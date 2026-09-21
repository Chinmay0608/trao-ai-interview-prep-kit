import { ResearchProvider, ResearchResult } from '@trao/shared';

export async function executeResearchStep(
  companyName: string,
  roleTitle: string,
  researchProvider: ResearchProvider
): Promise<ResearchResult[]> {
  try {
    const results = await researchProvider.searchInterviewProcess(companyName, roleTitle);
    return results || [];
  } catch {
    // Degrades honestly on network failures or zero results. Never fabricates rounds.
    return [];
  }
}
