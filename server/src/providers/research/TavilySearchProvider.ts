import axios from 'axios';
import { ResearchProvider, ResearchResult, ResearchSourceType } from '@trao/shared';
import { isValidResearchUrl, calculateRelevance, determineSourceType } from './DuckDuckGoHtmlSearchProvider.js';

export interface TavilySearchConfig {
  apiKey?: string;
  timeoutMs?: number;
  maxResults?: number;
}

export class TavilySearchProvider implements ResearchProvider {
  public readonly providerName = 'tavily';
  private apiKey?: string;
  private timeoutMs: number;
  private maxResults: number;

  constructor(config: TavilySearchConfig = {}) {
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs || 10000;
    this.maxResults = config.maxResults || 5;
  }

  public async searchInterviewProcess(
    companyName: string,
    roleTitle: string
  ): Promise<ResearchResult[]> {
    if (!this.apiKey || !companyName) {
      return [];
    }

    const query = `"${companyName.trim()}" ${roleTitle.trim()} interview process questions rounds`;

    try {
      const response = await axios.post(
        'https://api.tavily.com/search',
        {
          api_key: this.apiKey,
          query,
          search_depth: 'basic',
          include_answer: false,
          max_results: this.maxResults,
        },
        { timeout: this.timeoutMs }
      );

      const rawResults = response.data?.results || [];
      const results: ResearchResult[] = [];
      const seenUrls = new Set<string>();

      for (const item of rawResults) {
        const url = String(item.url || '');
        if (!isValidResearchUrl(url) || seenUrls.has(url)) {
          continue;
        }

        seenUrls.add(url);
        const title = String(item.title || '');
        const snippet = String(item.content || '');
        const relevance = calculateRelevance(title, snippet);
        const sourceType: ResearchSourceType = determineSourceType(url, snippet);

        results.push({
          url,
          title,
          snippet,
          sourceType,
          relevance,
          retrievedAt: new Date().toISOString(),
        });
      }

      results.sort((a, b) => {
        if (b.relevance !== a.relevance) {
          return b.relevance - a.relevance;
        }
        return a.url.localeCompare(b.url);
      });

      return results;
    } catch {
      // Degrade gracefully on API errors without throwing or hallucinating
      return [];
    }
  }
}
