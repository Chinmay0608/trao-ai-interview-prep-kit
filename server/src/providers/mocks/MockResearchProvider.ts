import { ResearchProvider, ResearchResult } from '@trao/shared';

export interface MockResearchConfig {
  mockResults?: ResearchResult[];
  shouldThrowNetworkError?: boolean;
}

export class MockResearchProvider implements ResearchProvider {
  public readonly providerName = 'mock-research';
  public callCount = 0;
  public lastQuery?: { companyName: string; roleTitle: string };
  public config: MockResearchConfig;

  constructor(config: MockResearchConfig = {}) {
    this.config = { ...config };
  }

  public async searchInterviewProcess(
    companyName: string,
    roleTitle: string
  ): Promise<ResearchResult[]> {
    this.callCount++;
    this.lastQuery = { companyName, roleTitle };

    if (this.config.shouldThrowNetworkError) {
      throw new Error('Simulated network error in research provider');
    }

    return this.config.mockResults ? [...this.config.mockResults] : [];
  }
}
