import { LLMProvider, CompanyBrief } from '@trao/shared';
import { CompanyBriefOutputSchema, CompanyBriefOutputType } from '../schemas.js';
import { CrawlResult } from '../../crawler/types.js';
import { ResearchResult } from '@trao/shared';

export async function executeBriefStep(
  companyName: string,
  companyUrl: string,
  crawlResult: CrawlResult,
  researchResults: ResearchResult[],
  llmProvider: LLMProvider
): Promise<CompanyBrief> {
  const crawledPages = crawlResult.pages || [];
  const validSources = Array.from(
    new Set([
      ...crawlResult.pagesUsed,
      ...researchResults.map((r) => r.url),
    ])
  );

  // If zero evidence was gathered from crawler and search: return an honest brief without calling LLM
  if (crawledPages.length === 0 && researchResults.length === 0) {
    return {
      summary: `Limited or unreachable information for ${companyName || companyUrl}. Company website was not accessible or returned no extractable text.`,
      what_they_do: 'Unable to verify what the company does from public research and crawl evidence.',
      sources: [],
    };
  }

  // Format evidence cleanly
  const crawlSnippets = crawledPages
    .slice(0, 4)
    .map((p) => `[Page: ${p.title} (${p.url})]:\n${p.extractedText.slice(0, 1500)}`)
    .join('\n\n');

  const researchSnippets = researchResults
    .slice(0, 4)
    .map((r) => `[Public Search (${r.sourceType}): ${r.title} (${r.url})]:\n${r.snippet}`)
    .join('\n\n');

  const systemPrompt = `You are an accurate corporate researcher synthesizing interview intelligence.
Your task is to produce an honest, factual company brief summarizing:
1. summary: A 2-3 sentence overview of the company, team culture, and any known hiring process details.
2. what_they_do: A clear 2-3 sentence description of their core product, mission, and business model.

CRITICAL HONESTY RULES:
- Base your summary ONLY on the provided crawled text and public search snippets.
- DO NOT invent technologies, hiring rounds, or corporate facts not supported by the evidence.
- If public discussions mention specific interview stages (e.g. take-home, system design round), mention them honestly. If not, state that interview process specifics were not publicly available.`;

  const prompt = `Synthesize the company brief for "${companyName || companyUrl}" using ONLY the retrieved evidence below:

--- CRAWLED COMPANY EVIDENCE ---
${crawlSnippets || '(No crawled pages retrieved)'}

--- PUBLIC RESEARCH EVIDENCE ---
${researchSnippets || '(No public search discussions found)'}
--------------------------------`;

  try {
    const output: CompanyBriefOutputType = await llmProvider.generateStructured({
      prompt,
      systemPrompt,
      schema: CompanyBriefOutputSchema,
      schemaName: 'CompanyBriefOutput',
      temperature: 0.2,
    });

    // Ensure returned sources strictly match verified URLs
    const sources = validSources.filter((src) =>
      output.sources.length === 0 || output.sources.some((s) => s.includes(src) || src.includes(s))
    );

    return {
      summary: output.summary.trim(),
      what_they_do: output.what_they_do.trim(),
      sources: sources.length > 0 ? sources : validSources.slice(0, 5),
    };
  } catch {
    // Graceful fallback on LLM failure using available evidence directly
    return {
      summary: `${companyName || 'The company'} research compiled from ${validSources.length} verified public sources.`,
      what_they_do: crawledPages[0]?.extractedText.slice(0, 200).trim() || 'Software and technology services.',
      sources: validSources.slice(0, 5),
    };
  }
}
