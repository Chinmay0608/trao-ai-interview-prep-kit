import http from 'http';
import https from 'https';
import axios, { AxiosResponse } from 'axios';
import {
  SafeHttpResponse,
  ResponseSizeExceededError,
  UnsupportedContentTypeError,
  SsrfSecurityError,
  DEFAULT_CRAWL_BUDGET,
} from './types.js';
import {
  validateAndNormalizeUrl,
  resolveAndValidateDns,
  DnsLookupFunction,
  defaultDnsLookup,
} from './ssrfGuard.js';

export interface SafeFetchOptions {
  maxResponseBytes?: number;
  requestTimeoutMs?: number;
  maxRedirects?: number;
  allowLocal?: boolean;
  dnsLookupFn?: DnsLookupFunction;
  httpFetchOverride?: (
    url: string,
    options: SafeFetchOptions
  ) => Promise<SafeHttpResponse>;
  transportOverride?: (
    url: string
  ) => Promise<{ status: number; headers: Record<string, any>; data: any }>;
}

/**
 * Checks whether Content-Type header matches HTML/XHTML.
 */
export function isAllowedContentType(contentTypeHeader?: string): boolean {
  if (!contentTypeHeader) return false;
  const lower = contentTypeHeader.toLowerCase();
  return (
    lower.includes('text/html') ||
    lower.includes('application/xhtml+xml')
  );
}

/**
 * Performs an SSRF-safe HTTP GET request:
 * - Validates initial URL & protocol
 * - Validates DNS against loopback/private/metadata ranges
 * - Inspects Content-Type before reading full response
 * - Streams and caps response body at maxResponseBytes (default 2 MB)
 * - Manually validates and follows redirects (up to maxRedirects, default 5)
 * - Revalidates DNS on every redirect target
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeHttpResponse> {
  if (options.httpFetchOverride) {
    return options.httpFetchOverride(rawUrl, options);
  }

  const maxBytes = options.maxResponseBytes || DEFAULT_CRAWL_BUDGET.maxResponseBytes;
  const timeoutMs = options.requestTimeoutMs || DEFAULT_CRAWL_BUDGET.requestTimeoutMs;
  const maxRedirects = options.maxRedirects ?? DEFAULT_CRAWL_BUDGET.maxRedirects;
  const dnsLookupFn = options.dnsLookupFn || defaultDnsLookup;

  // Strict local crawl rule: Never permitted in production!
  const isProd = process.env.NODE_ENV === 'production';
  const allowLocal = !isProd && (options.allowLocal === true || process.env.ALLOW_LOCAL_CRAWL === 'true');

  let currentUrl = rawUrl;
  const redirectChain: string[] = [];

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    // Step 1: Validate URL structure & scheme
    const { normalizedUrl, parsed } = validateAndNormalizeUrl(currentUrl);

    // Step 2: Validate DNS resolution before connecting
    const validatedIps = await resolveAndValidateDns(parsed.hostname, allowLocal, dnsLookupFn);

    // DNS Rebinding Defense: Use custom Agent lookup that returns our validated IP
    const safeLookup = (
      _hostname: string,
      _options: any,
      callback: (err: Error | null, address: string, family: number) => void
    ) => {
      // Pick first validated IP
      const ip = validatedIps[0];
      const family = ip.includes(':') ? 6 : 4;
      callback(null, ip, family);
    };

    const httpAgent = new http.Agent({ lookup: safeLookup as any, keepAlive: false });
    const httpsAgent = new https.Agent({ lookup: safeLookup as any, keepAlive: false });

    // Step 3: Issue request with maxRedirects = 0 (manual redirect handling)
    let response: AxiosResponse<any>;
    if (options.transportOverride) {
      const res = await options.transportOverride(normalizedUrl);
      response = {
        status: res.status,
        headers: res.headers,
        data: res.data,
      } as any;
    } else {
      try {
        response = await axios.get(normalizedUrl, {
          timeout: timeoutMs,
          maxRedirects: 0,
          responseType: 'stream',
          httpAgent,
          httpsAgent,
          validateStatus: (status) => status >= 200 && status < 400,
          headers: {
            'User-Agent':
              'Trao-Crawler/1.0 (+https://github.com/trao-interview-prep; bot@trao.internal)',
            Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
            'Accept-Language': 'en-US,en;q=0.8',
          },
        });
      } catch (err: any) {
        if (err.response && [301, 302, 303, 307, 308].includes(err.response.status)) {
          response = err.response;
        } else {
          throw err;
        }
      }
    }

    const statusCode = response.status;

    // Step 4: Handle Redirects
    if ([301, 302, 303, 307, 308].includes(statusCode)) {
      const locationHeader = response.headers?.location;
      if (!locationHeader) {
        throw new SsrfSecurityError(`Redirect HTTP ${statusCode} missing Location header`, normalizedUrl);
      }

      redirectChain.push(normalizedUrl);
      if (redirectChain.length > maxRedirects) {
        throw new SsrfSecurityError(
          `Maximum redirect limit (${maxRedirects}) exceeded`,
          normalizedUrl
        );
      }

      // Resolve relative redirect against current URL
      let targetUrl: string;
      try {
        targetUrl = new URL(locationHeader, normalizedUrl).href;
      } catch {
        throw new SsrfSecurityError(`Invalid redirect Location: "${locationHeader}"`, normalizedUrl);
      }

      currentUrl = targetUrl;
      continue;
    }

    // Step 5: Check Content-Type Header before reading body
    const contentType = String(response.headers?.['content-type'] || '');
    if (!isAllowedContentType(contentType)) {
      throw new UnsupportedContentTypeError(contentType);
    }

    // Step 6: Stream Response Body with strict byte limit
    const stream = response.data;
    const chunks: Buffer[] = [];
    let bytesReceived = 0;

    const bodyText = await new Promise<string>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        bytesReceived += chunk.length;
        if (bytesReceived > maxBytes) {
          stream.destroy();
          reject(new ResponseSizeExceededError(bytesReceived, maxBytes));
          return;
        }
        chunks.push(chunk);
      });

      stream.on('end', () => {
        const fullBuffer = Buffer.concat(chunks);
        resolve(fullBuffer.toString('utf8'));
      });

      stream.on('error', (streamErr: any) => {
        reject(streamErr);
      });
    });

    return {
      statusCode,
      finalUrl: normalizedUrl,
      contentType,
      body: bodyText,
      redirectChain,
    };
  }

  throw new SsrfSecurityError(`Maximum redirect limit (${maxRedirects}) exceeded`, rawUrl);
}
