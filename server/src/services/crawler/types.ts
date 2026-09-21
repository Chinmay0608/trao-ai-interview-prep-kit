/**
 * Types and error definitions for Crawler and SSRF Security Layer.
 */

export interface CrawlBudget {
  maxPages: number; // Default: 8
  maxDepth: number; // Default: 3
  maxRedirects: number; // Default: 5
  maxResponseBytes: number; // Default: 2 * 1024 * 1024 (2 MB)
  requestTimeoutMs: number; // Default: 20,000 ms
  overallTimeoutMs: number; // Default: 30,000 ms
}

export const DEFAULT_CRAWL_BUDGET: CrawlBudget = {
  maxPages: 8,
  maxDepth: 3,
  maxRedirects: 5,
  maxResponseBytes: 2 * 1024 * 1024, // 2 MB
  requestTimeoutMs: 20000,
  overallTimeoutMs: 30000,
};

export interface CrawlPageResult {
  url: string;
  title: string;
  extractedText: string;
  depth: number;
  relevanceScore: number;
  retrievedAt: string;
  contentType: string;
}

export interface SkippedSource {
  url: string;
  reason: string;
}

export interface CrawlResult {
  pages: CrawlPageResult[];
  pagesUsed: string[];
  skippedSources: SkippedSource[];
  hiringEvidenceFound: boolean;
}

export interface SafeHttpResponse {
  statusCode: number;
  finalUrl: string;
  contentType: string;
  body: string;
  redirectChain: string[];
}

export class SsrfSecurityError extends Error {
  public readonly targetUrl: string;
  public readonly resolvedIp?: string;

  constructor(message: string, targetUrl: string, resolvedIp?: string) {
    super(message);
    this.name = 'SsrfSecurityError';
    this.targetUrl = targetUrl;
    this.resolvedIp = resolvedIp;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ResponseSizeExceededError extends Error {
  public readonly bytesReceived: number;
  public readonly maxBytes: number;

  constructor(bytesReceived: number, maxBytes: number) {
    super(`Response size exceeded maximum allowed limit (${bytesReceived} > ${maxBytes} bytes)`);
    this.name = 'ResponseSizeExceededError';
    this.bytesReceived = bytesReceived;
    this.maxBytes = maxBytes;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnsupportedContentTypeError extends Error {
  public readonly contentType: string;

  constructor(contentType: string) {
    super(`Unsupported Content-Type: "${contentType}". Only text/html and application/xhtml+xml are permitted.`);
    this.name = 'UnsupportedContentTypeError';
    this.contentType = contentType;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
