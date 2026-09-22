import robotsParser from 'robots-parser';
import { safeFetch, SafeFetchOptions } from './safeHttpClient.js';

export interface RobotsCacheEntry {
  robots: any;
  crawlDelayMs: number;
  lastRequestTimeMs: number;
  fetchedAt: number;
}

export class RobotsHandler {
  private cache = new Map<string, RobotsCacheEntry>();
  private userAgent: string;
  private safeFetchOptions: SafeFetchOptions;
  private sleepFn: (ms: number) => Promise<void>;

  constructor(
    safeFetchOptions: SafeFetchOptions = {},
    userAgent = 'Trao-Crawler',
    sleepFn: (ms: number) => Promise<void> = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms))
  ) {
    this.safeFetchOptions = safeFetchOptions;
    this.userAgent = userAgent;
    this.sleepFn = sleepFn;
  }

  /**
   * Checks if a URL is allowed by robots.txt for the given origin.
   */
  public async isAllowed(targetUrl: string): Promise<boolean> {
    try {
      const parsed = new URL(targetUrl);
      const origin = parsed.origin;
      const entry = await this.getOrFetchRobots(origin);

      if (!entry.robots) {
        return true; // No robots.txt or failed fetch -> permissive fallback
      }

      const allowed = entry.robots.isAllowed(targetUrl, this.userAgent);
      return allowed !== false; // if undefined or true, allowed
    } catch {
      return true;
    }
  }

  /**
   * Enforces crawl-delay deterministically for the given origin.
   */
  public async enforceCrawlDelay(origin: string): Promise<void> {
    const entry = this.cache.get(origin);
    if (!entry || entry.crawlDelayMs <= 0) {
      return;
    }

    const now = Date.now();
    const elapsed = now - entry.lastRequestTimeMs;
    if (elapsed < entry.crawlDelayMs) {
      const waitTime = entry.crawlDelayMs - elapsed;
      await this.sleepFn(waitTime);
    }
    entry.lastRequestTimeMs = Date.now();
  }

  public markRequestCompleted(origin: string): void {
    const entry = this.cache.get(origin);
    if (entry) {
      entry.lastRequestTimeMs = Date.now();
    }
  }

  /**
   * Retrieves or fetches robots.txt for an origin via the SSRF-safe client.
   */
  public async getOrFetchRobots(origin: string): Promise<RobotsCacheEntry> {
    const existing = this.cache.get(origin);
    if (existing) {
      return existing;
    }

    const robotsUrl = `${origin}/robots.txt`;
    let robotsObj: any = null;
    let crawlDelayMs = 0;

    try {
      const res = await safeFetch(robotsUrl, {
        ...this.safeFetchOptions,
        allowTextPlain: true,
        maxResponseBytes: 100 * 1024, // 100 KB max for robots.txt
        requestTimeoutMs: 5000,
      });

      if (res.statusCode === 200 && res.body) {
        robotsObj = robotsParser(robotsUrl, res.body);
        const delaySeconds = robotsObj.getCrawlDelay(this.userAgent) || 0;
        crawlDelayMs = Math.max(0, Math.min(10000, delaySeconds * 1000)); // Cap crawl delay at 10s
      }
    } catch {
      // 404, network error, or content-type rejection: proceed with null robotsObj
      robotsObj = null;
    }

    const entry: RobotsCacheEntry = {
      robots: robotsObj,
      crawlDelayMs,
      lastRequestTimeMs: 0,
      fetchedAt: Date.now(),
    };

    this.cache.set(origin, entry);
    return entry;
  }

  public getCacheSize(): number {
    return this.cache.size;
  }
}
