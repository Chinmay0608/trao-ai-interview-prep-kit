import dns from 'dns';
import net from 'net';
import { SsrfSecurityError } from './types.js';

export interface DnsLookupResult {
  address: string;
  family: number;
}

export type DnsLookupFunction = (
  hostname: string
) => Promise<DnsLookupResult[]>;

/**
 * Default system DNS resolver querying all IPv4 and IPv6 addresses.
 */
export const defaultDnsLookup: DnsLookupFunction = async (hostname: string) => {
  return dns.promises.lookup(hostname, { all: true });
};

/**
 * Validates and normalizes outbound URLs:
 * - Only permits http: and https:
 * - Rejects non-HTTP schemes (file:, ftp:, data:, javascript:, ws:, wss:, etc.)
 * - Rejects URLs containing credentials/userinfo (username:password)
 * - Normalizes default ports (:80, :443)
 * - Strips fragments (#...)
 */
export function validateAndNormalizeUrl(rawUrl: string): {
  normalizedUrl: string;
  parsed: URL;
} {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new SsrfSecurityError('URL must be a non-empty string.', rawUrl || '');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new SsrfSecurityError(`Malformed URL: "${rawUrl}"`, rawUrl);
  }

  // Enforce protocol whitelist
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfSecurityError(
      `Unsupported protocol "${parsed.protocol}". Only "http:" and "https:" are permitted.`,
      rawUrl
    );
  }

  // Reject URL credentials
  if (parsed.username || parsed.password) {
    throw new SsrfSecurityError(
      'URLs containing userinfo credentials are not permitted.',
      rawUrl
    );
  }

  // Require valid hostname
  if (!parsed.hostname || parsed.hostname.trim() === '') {
    throw new SsrfSecurityError('URL must specify a valid hostname.', rawUrl);
  }

  // Strip fragment
  parsed.hash = '';

  // Normalize default ports
  if (
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = '';
  }

  // Construct clean normalized URL
  let normalizedUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}`;
  while (normalizedUrl.endsWith('/') && normalizedUrl.length > parsed.protocol.length + 2) {
    normalizedUrl = normalizedUrl.slice(0, -1);
  }

  return { normalizedUrl, parsed };
}

/**
 * Checks if an IPv4 or IPv6 address belongs to a loopback, private, link-local,
 * multicast, reserved, or IPv4-mapped private subnet.
 */
export function isPrivateOrBlockedIp(
  ip: string,
  allowLocal = false
): { blocked: boolean; reason?: string } {
  if (!ip || typeof ip !== 'string') {
    return { blocked: true, reason: 'Empty or invalid IP address' };
  }

  const cleanIp = ip.trim().toLowerCase();

  // Handle IPv4-Mapped IPv6 addresses (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (cleanIp.startsWith('::ffff:')) {
    const ipv4Part = cleanIp.slice(7);
    if (ipv4Part.includes('.')) {
      const ipv4Check = isPrivateOrBlockedIp(ipv4Part, allowLocal);
      if (ipv4Check.blocked) {
        return { blocked: true, reason: `IPv4-mapped IPv6 blocked: ${ipv4Check.reason}` };
      }
    }
  }

  // IPv6 checks
  if (cleanIp.includes(':')) {
    if (cleanIp === '::1') {
      if (allowLocal) return { blocked: false };
      return { blocked: true, reason: 'IPv6 loopback address (::1)' };
    }
    if (cleanIp === '::' || cleanIp === '0:0:0:0:0:0:0:0') {
      return { blocked: true, reason: 'IPv6 unspecified address (::)' };
    }
    // Unique Local Addresses (fc00::/7 -> fc00 to fdff)
    if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) {
      return { blocked: true, reason: 'IPv6 unique local address (fc00::/7)' };
    }
    // Link-Local Addresses (fe80::/10 -> fe80 to febf)
    if (
      cleanIp.startsWith('fe8') ||
      cleanIp.startsWith('fe9') ||
      cleanIp.startsWith('fea') ||
      cleanIp.startsWith('feb')
    ) {
      return { blocked: true, reason: 'IPv6 link-local address (fe80::/10)' };
    }
    // Multicast (ff00::/8)
    if (cleanIp.startsWith('ff')) {
      return { blocked: true, reason: 'IPv6 multicast address (ff00::/8)' };
    }
    return { blocked: false };
  }

  // IPv4 checks
  const parts = cleanIp.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return { blocked: true, reason: 'Malformed IPv4 address' };
  }

  const [b0, b1] = parts;

  // Loopback (127.0.0.0/8)
  if (b0 === 127) {
    if (allowLocal) return { blocked: false };
    return { blocked: true, reason: 'IPv4 loopback address (127.0.0.0/8)' };
  }

  // Unspecified (0.0.0.0/8)
  if (b0 === 0) {
    return { blocked: true, reason: 'IPv4 unspecified address (0.0.0.0/8)' };
  }

  // RFC 1918: 10.0.0.0/8
  if (b0 === 10) {
    if (allowLocal) return { blocked: false };
    return { blocked: true, reason: 'RFC 1918 private address (10.0.0.0/8)' };
  }

  // RFC 1918: 172.16.0.0/12 (172.16.x.x to 172.31.x.x)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) {
    if (allowLocal) return { blocked: false };
    return { blocked: true, reason: 'RFC 1918 private address (172.16.0.0/12)' };
  }

  // RFC 1918: 192.168.0.0/16
  if (b0 === 192 && b1 === 168) {
    if (allowLocal) return { blocked: false };
    return { blocked: true, reason: 'RFC 1918 private address (192.168.0.0/16)' };
  }

  // Link-local / Cloud metadata (169.254.0.0/16)
  if (b0 === 169 && b1 === 254) {
    return { blocked: true, reason: 'Link-local/cloud metadata address (169.254.0.0/16)' };
  }

  // Multicast (224.0.0.0/4 -> 224 to 239)
  if (b0 >= 224 && b0 <= 239) {
    return { blocked: true, reason: 'IPv4 multicast address (224.0.0.0/4)' };
  }

  // Reserved / Broadcast (240.0.0.0/4)
  if (b0 >= 240) {
    return { blocked: true, reason: 'IPv4 reserved/broadcast address (240.0.0.0/4)' };
  }

  return { blocked: false };
}

/**
 * Resolves all DNS addresses for the given hostname and validates that NONE
 * are private, loopback, or blocked.
 */
export async function resolveAndValidateDns(
  hostname: string,
  allowLocal = false,
  dnsLookupFn: DnsLookupFunction = defaultDnsLookup
): Promise<string[]> {
  const host = hostname.trim().toLowerCase();

  // Hostname string checks
  if (host === 'localhost' || host === 'localhost.localdomain') {
    if (allowLocal) return ['127.0.0.1'];
    throw new SsrfSecurityError('Hostname "localhost" is blocked by SSRF policy.', host);
  }

  // If host is an explicit IP literal, validate directly
  if (net.isIP(host)) {
    const ipCheck = isPrivateOrBlockedIp(host, allowLocal);
    if (ipCheck.blocked) {
      throw new SsrfSecurityError(`IP address blocked by SSRF policy: ${ipCheck.reason}`, host, host);
    }
    return [host];
  }

  let addresses: DnsLookupResult[];
  try {
    addresses = await dnsLookupFn(host);
  } catch (err: any) {
    throw new SsrfSecurityError(`DNS resolution failed for hostname "${host}": ${err.message}`, host);
  }

  if (!addresses || addresses.length === 0) {
    throw new SsrfSecurityError(`DNS resolution returned 0 addresses for "${host}"`, host);
  }

  const validatedIps: string[] = [];
  for (const entry of addresses) {
    const check = isPrivateOrBlockedIp(entry.address, allowLocal);
    if (check.blocked) {
      throw new SsrfSecurityError(
        `DNS resolved address "${entry.address}" for host "${host}" is blocked: ${check.reason}`,
        host,
        entry.address
      );
    }
    validatedIps.push(entry.address);
  }

  return validatedIps;
}
