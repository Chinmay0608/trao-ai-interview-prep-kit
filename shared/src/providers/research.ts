/**
 * Research Provider Contract and Result Types
 */

export type ResearchSourceType =
  | 'interview_experience'
  | 'company_blog'
  | 'public_discussion';

export interface ResearchResult {
  url: string;
  title: string;
  snippet: string;
  sourceType: ResearchSourceType;
  relevance: number; // 0 to 100
  retrievedAt: string; // ISO 8601 timestamp
}

export interface ResearchProvider {
  readonly providerName: string;
  searchInterviewProcess(
    companyName: string,
    roleTitle: string
  ): Promise<ResearchResult[]>;
}
