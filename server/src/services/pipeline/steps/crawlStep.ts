import { DynamicCrawler } from '../../crawler/DynamicCrawler.js';
import { CrawlResult } from '../../crawler/types.js';

export async function executeCrawlStep(
  companyUrl: string,
  crawler?: DynamicCrawler,
  allowLocalCrawl = false
): Promise<CrawlResult> {
  const activeCrawler =
    crawler ||
    new DynamicCrawler({
      safeFetchOptions: { allowLocal: allowLocalCrawl },
    });

  try {
    return await activeCrawler.crawl(companyUrl);
  } catch (err: any) {
    return {
      pages: [],
      pagesUsed: [],
      skippedSources: [{ url: companyUrl, reason: err.message || 'Crawl failed' }],
      hiringEvidenceFound: false,
    };
  }
}
