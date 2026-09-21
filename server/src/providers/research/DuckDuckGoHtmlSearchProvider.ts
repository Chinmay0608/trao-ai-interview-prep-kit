import axios from 'axios';
import * as cheerio from 'cheerio';
import { ResearchProvider, ResearchResult, ResearchSourceType } from '@trao/shared';

export interface DuckDuckGoSearchConfig {
  timeoutMs?: number;
  maxResults?: number;
}

/**
 * Validates external URLs before accepting them as research sources.
 * Requires http/https, valid hostname, and rejects credentials/userinfo.
 */
export function isValidResearchUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    if (parsed.username || parsed.password) {
      return false;
    }
    if (!parsed.hostname || parsed.hostname.length < 3 || !parsed.hostname.includes('.')) {
      return false;
    }
    // Reject local loopback or private ranges from research results
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host === '::1'
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves DuckDuckGo's internal redirect format (/l/?uddg=https%3A%2F%2F...)
 */
export function resolveDuckDuckGoUrl(href: string): string {
  if (!href) return '';
  if (href.startsWith('http://') || href.startsWith('https://')) {
    return href;
  }
  try {
    const parsed = new URL(href, 'https://html.duckduckgo.com');
    const uddg = parsed.searchParams.get('uddg');
    if (uddg) {
      return decodeURIComponent(uddg);
    }
  } catch {
    // Return original if parsing fails
  }
  return href;
}

/**
 * Computes a deterministic relevance score (0-100) based on interview keywords.
 */
export function calculateRelevance(title: string, snippet: string): number {
  const combined = `${title.toLowerCase()} ${snippet.toLowerCase()}`;
  const keywords = [
    'interview',
    'interview process',
    'technical interview',
    'coding',
    'system design',
    'behavioural',
    'take-home',
    'hiring process',
    'onsite',
    'rounds',
    'questions',
    'assessment',
  ];

  let score = 40;
  for (const kw of keywords) {
    if (combined.includes(kw)) {
      score += 7;
    }
  }

  return Math.min(100, score);
}

/**
 * Categorizes source type deterministically based on URL and text.
 */
export function determineSourceType(url: string, snippet: string): ResearchSourceType {
  const lowerUrl = url.toLowerCase();
  const lowerSnippet = snippet.toLowerCase();

  if (
    lowerUrl.includes('glassdoor') ||
    lowerUrl.includes('reddit') ||
    lowerUrl.includes('teamblind') ||
    lowerUrl.includes('levels.fyi') ||
    lowerUrl.includes('interviewing.io')
  ) {
    return 'public_discussion';
  }

  if (
    lowerUrl.includes('/blog') ||
    lowerUrl.includes('engineering.') ||
    lowerUrl.includes('/engineering') ||
    lowerSnippet.includes('engineering blog')
  ) {
    return 'company_blog';
  }

  return 'interview_experience';
}

export class DuckDuckGoHtmlSearchProvider implements ResearchProvider {
  public readonly providerName = 'duckduckgo';
  private timeoutMs: number;
  private maxResults: number;

  constructor(config: DuckDuckGoSearchConfig = {}) {
    this.timeoutMs = config.timeoutMs || 10000;
    this.maxResults = config.maxResults || 5;
  }

  public async searchInterviewProcess(
    companyName: string,
    roleTitle: string
  ): Promise<ResearchResult[]> {
    if (!companyName || companyName.trim() === '') {
      return [];
    }

    const query = `"${companyName.trim()}" ${roleTitle.trim()} interview process questions rounds`;
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    try {
      const response = await axios.get(searchUrl, {
        timeout: this.timeoutMs,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      return this.parseHtmlResults(response.data);
    } catch {
      // Degrades gracefully on network errors or CAPTCHAs by returning an honest empty array
      // Never fabricates research findings.
      return [];
    }
  }

  /**
   * Pure HTML parsing method exposed for deterministic unit testing.
   */
  public parseHtmlResults(html: string): ResearchResult[] {
    if (!html || typeof html !== 'string') return [];

    const $ = cheerio.load(html);
    const results: ResearchResult[] = [];
    const seenUrls = new Set<string>();

    $('.result').each((_i, element) => {
      if (results.length >= this.maxResults) return;

      const titleElem = $(element).find('.result__title a');
      const snippetElem = $(element).find('.result__snippet');
      const rawHref = titleElem.attr('href') || '';

      const targetUrl = resolveDuckDuckGoUrl(rawHref);
      if (!isValidResearchUrl(targetUrl) || seenUrls.has(targetUrl)) {
        return;
      }

      const title = titleElem.text().trim();
      const snippet = snippetElem.text().trim();

      if (!title && !snippet) {
        return;
      }

      seenUrls.add(targetUrl);
      const relevance = calculateRelevance(title, snippet);
      const sourceType = determineSourceType(targetUrl, snippet);

      results.push({
        url: targetUrl,
        title,
        snippet,
        sourceType,
        relevance,
        retrievedAt: new Date().toISOString(),
      });
    });

    // Deterministic sort: relevance descending, then URL ascending
    results.sort((a, b) => {
      if (b.relevance !== a.relevance) {
        return b.relevance - a.relevance;
      }
      return a.url.localeCompare(b.url);
    });

    return results;
  }
}
