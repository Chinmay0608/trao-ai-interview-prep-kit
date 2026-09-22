import * as cheerio from 'cheerio';
import {
  CrawlBudget,
  DEFAULT_CRAWL_BUDGET,
  CrawlResult,
  CrawlPageResult,
  SkippedSource,
} from './types.js';
import { validateAndNormalizeUrl } from './ssrfGuard.js';
import { safeFetch, SafeFetchOptions } from './safeHttpClient.js';
import { RobotsHandler } from './robotsHandler.js';
import { UrlQueue, QueueItem } from './UrlQueue.js';

export interface DynamicCrawlerOptions {
  budget?: Partial<CrawlBudget>;
  safeFetchOptions?: SafeFetchOptions;
  allowSubdomains?: boolean; // Default true (allows careers.acme.com for acme.com)
  sleepFn?: (ms: number) => Promise<void>;
}

export const CRAWLER_KEYWORDS = [
  'careers',
  'jobs',
  'hiring',
  'interview',
  'engineering',
  'recruitment',
  'culture',
  'benefits',
  'teams',
  'students',
  'university',
  'technology',
  'about',
  'handbook',
  'people',
  'work-with-us',
];

export const ANCHOR_KEYWORDS = [
  "we're hiring",
  'join our team',
  'careers',
  'engineering blog',
  'interview guide',
  'life at',
  'open positions',
  'jobs',
  'work with us',
  'view openings',
];

export class DynamicCrawler {
  private budget: CrawlBudget;
  private safeFetchOptions: SafeFetchOptions;
  private allowSubdomains: boolean;
  private robotsHandler: RobotsHandler;

  constructor(options: DynamicCrawlerOptions = {}) {
    this.budget = {
      ...DEFAULT_CRAWL_BUDGET,
      ...options.budget,
    };
    this.safeFetchOptions = options.safeFetchOptions || {};
    this.allowSubdomains = options.allowSubdomains ?? true;
    this.robotsHandler = new RobotsHandler(
      this.safeFetchOptions,
      'Trao-Crawler',
      options.sleepFn
    );
  }

  /**
   * Main crawl entry point executing bounded best-first crawling.
   */
  public async crawl(initialCompanyUrl: string): Promise<CrawlResult> {
    const pages: CrawlPageResult[] = [];
    const pagesUsed: string[] = [];
    const skippedSources: SkippedSource[] = [];
    let hiringEvidenceFound = false;

    let pagesAttempted = 0;
    let pagesSucceeded = 0;
    let pagesFailed = 0;
    let pagesSkipped = 0;
    let blockedByRobots = 0;

    // Step 1: Validate and establish base domain
    let baseOrigin: string;
    let baseHost: string;
    let seedUrl: string;

    try {
      const { normalizedUrl, parsed } = validateAndNormalizeUrl(initialCompanyUrl);
      seedUrl = normalizedUrl;
      baseOrigin = parsed.origin;
      baseHost = parsed.hostname.toLowerCase();
    } catch (err: any) {
      skippedSources.push({ url: initialCompanyUrl, reason: err.message });
      return {
        pages,
        pagesUsed,
        skippedSources,
        hiringEvidenceFound,
        metrics: {
          pagesAttempted: 0,
          pagesSucceeded: 0,
          pagesFailed: 1,
          pagesSkipped: 0,
          blockedByRobots: 0,
          statusMessage: 'Invalid company URL structure.',
        },
      };
    }

    const queue = new UrlQueue();
    const visitedUrls = new Set<string>();

    // Seed the priority queue with initial company URL (score 100, depth 0)
    queue.push({
      url: seedUrl,
      depth: 0,
      priority: 100,
    });

    const startTime = Date.now();

    // Step 2: Bounded Best-First Crawl Loop
    while (!queue.isEmpty() && pages.length < this.budget.maxPages) {
      if (Date.now() - startTime > this.budget.overallTimeoutMs) {
        skippedSources.push({
          url: 'CRAWLER_BUDGET',
          reason: `Overall crawl timeout (${this.budget.overallTimeoutMs} ms) exceeded`,
        });
        break;
      }

      const currentItem = queue.pop()!;
      const currentUrl = currentItem.url;

      if (visitedUrls.has(currentUrl)) {
        pagesSkipped++;
        continue;
      }
      visitedUrls.add(currentUrl);
      pagesAttempted++;

      // Check robots.txt permissions
      const isAllowedByRobots = await this.robotsHandler.isAllowed(currentUrl);
      if (!isAllowedByRobots) {
        blockedByRobots++;
        pagesSkipped++;
        skippedSources.push({ url: currentUrl, reason: 'Disallowed by robots.txt' });
        continue;
      }

      // Enforce crawl-delay for origin
      try {
        const parsedCurrent = new URL(currentUrl);
        await this.robotsHandler.enforceCrawlDelay(parsedCurrent.origin);
      } catch {
        // ignore parsing errors on origin
      }

      // Fetch page via SSRF-safe HTTP client
      let response: any;
      try {
        response = await safeFetch(currentUrl, {
          ...this.safeFetchOptions,
          maxResponseBytes: this.budget.maxResponseBytes,
          requestTimeoutMs: this.budget.requestTimeoutMs,
          maxRedirects: this.budget.maxRedirects,
        });
      } catch (fetchErr: any) {
        pagesFailed++;
        skippedSources.push({
          url: currentUrl,
          reason: fetchErr.message || 'Fetch failed',
        });
        continue;
      }

      const finalUrl = response.finalUrl;
      pagesUsed.push(finalUrl);
      pagesSucceeded++;

      // Parse HTML
      const $ = cheerio.load(response.body);

      // Remove non-content elements
      $('script, style, nav, footer, header, svg, noscript, form, aside, iframe').remove();

      const title = $('title').first().text().trim() || '';
      const rawText = $('body').text();
      const cleanedText = this.cleanText(rawText);

      // Check for hiring process evidence
      if (this.detectHiringEvidence(cleanedText)) {
        hiringEvidenceFound = true;
      }

      pages.push({
        url: finalUrl,
        title,
        extractedText: cleanedText.slice(0, 50000), // Cap extracted text to 50KB
        depth: currentItem.depth,
        relevanceScore: currentItem.priority,
        retrievedAt: new Date().toISOString(),
        contentType: response.contentType,
      });

      // Stop early if high-confidence hiring process evidence is found and budget threshold reached
      if (hiringEvidenceFound && pages.length >= 4) {
        break;
      }

      // Dynamic link discovery if not exceeding maxDepth
      if (currentItem.depth < this.budget.maxDepth) {
        const discoveredLinks = this.extractAndScoreLinks(
          $,
          finalUrl,
          baseHost,
          currentItem.depth + 1
        );

        for (const candidate of discoveredLinks) {
          if (!visitedUrls.has(candidate.url) && !queue.has(candidate.url)) {
            queue.push(candidate);
          }
        }
      }
    }

    let statusMessage: string;
    if (pagesSucceeded > 0) {
      statusMessage = `Crawl completed: ${pagesSucceeded} page${pagesSucceeded > 1 ? 's' : ''} successfully indexed.`;
    } else if (blockedByRobots > 0) {
      statusMessage = 'Some pages were unavailable due to site access restrictions. No unsupported company facts were fabricated.';
    } else if (pagesFailed > 0) {
      statusMessage = 'External website was unreachable or returned no extractable text. The kit continues using only verified available evidence.';
    } else {
      statusMessage = 'Limited public company information was found during research.';
    }

    return {
      pages,
      pagesUsed: Array.from(new Set(pagesUsed)),
      skippedSources,
      hiringEvidenceFound,
      metrics: {
        pagesAttempted,
        pagesSucceeded,
        pagesFailed,
        pagesSkipped,
        blockedByRobots,
        statusMessage,
      },
    };
  }

  /**
   * Extracts links from page HTML, resolves relative URLs, and computes priority.
   */
  public extractAndScoreLinks(
    $: cheerio.CheerioAPI,
    currentUrl: string,
    baseHost: string,
    nextDepth: number
  ): QueueItem[] {
    const discovered: QueueItem[] = [];
    const seenOnPage = new Set<string>();

    $('a[href]').each((_i, el) => {
      const rawHref = $(el).attr('href');
      if (!rawHref) return;

      const anchorText = $(el).text().trim();

      // Resolve relative URL
      let resolvedUrl: string;
      try {
        resolvedUrl = new URL(rawHref, currentUrl).href;
      } catch {
        return; // Malformed href
      }

      // Normalize and validate scheme
      let normalized: string;
      let parsed: URL;
      try {
        const validated = validateAndNormalizeUrl(resolvedUrl);
        normalized = validated.normalizedUrl;
        parsed = validated.parsed;
      } catch {
        return; // Invalid protocol or credentials
      }

      if (seenOnPage.has(normalized)) {
        return;
      }
      seenOnPage.add(normalized);

      // Domain constraint: enforce same origin or allowed subdomain
      const host = parsed.hostname.toLowerCase();
      const isAllowedDomain = this.isDomainAllowed(host, baseHost);
      if (!isAllowedDomain) {
        return; // Reject foreign external domains
      }

      const priority = this.calculateLinkPriority(normalized, anchorText, nextDepth);

      discovered.push({
        url: normalized,
        depth: nextDepth,
        discoveredFrom: currentUrl,
        anchorText,
        priority,
      });
    });

    return discovered;
  }

  /**
   * Domain constraint policy:
   * Same host is always allowed.
   * If allowSubdomains is true, subdomains of baseHost are allowed (e.g. careers.acme.com for acme.com).
   */
  public isDomainAllowed(targetHost: string, baseHost: string): boolean {
    if (targetHost === baseHost) return true;
    if (!this.allowSubdomains) return false;

    // Check if targetHost is a subdomain of baseHost (e.g. jobs.example.com vs example.com)
    return targetHost.endsWith(`.${baseHost}`);
  }

  /**
   * Deterministically computes priority score for a discovered link.
   */
  public calculateLinkPriority(url: string, anchorText: string, depth: number): number {
    let score = 50;
    const lowerUrl = url.toLowerCase();
    const lowerAnchor = anchorText.toLowerCase();

    // URL path relevance: accumulate matches up to +50
    let urlBonus = 0;
    for (const kw of CRAWLER_KEYWORDS) {
      if (lowerUrl.includes(kw)) {
        urlBonus += kw === 'careers' || kw === 'jobs' || kw === 'hiring' ? 35 : 20;
      }
    }
    score += Math.min(50, urlBonus);

    // Anchor text relevance (+25)
    let anchorBonus = 0;
    for (const kw of ANCHOR_KEYWORDS) {
      if (lowerAnchor.includes(kw)) {
        anchorBonus = 25;
        break;
      }
    }
    if (anchorBonus === 0) {
      for (const kw of CRAWLER_KEYWORDS) {
        if (lowerAnchor.includes(kw)) {
          anchorBonus = 20;
          break;
        }
      }
    }
    score += anchorBonus;

    // Depth penalty (-10 * depth)
    score -= 10 * depth;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Evaluates text for strong signals of hiring process or interview information.
   */
  public detectHiringEvidence(text: string): boolean {
    const lower = text.toLowerCase();
    const signals = [
      'interview process',
      'interview stages',
      'hiring process',
      'technical assessment',
      'take-home',
      'system design round',
      'behavioural round',
      'how we hire',
      'our hiring process',
    ];
    return signals.some((sig) => lower.includes(sig));
  }

  private cleanText(rawText: string): string {
    return rawText
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
  }
}
