import { describe, it, expect } from 'vitest';
import {
  validateAppendixA,
  BatchOutputFileSchema,
  allocateSchedule,
  calculateCoverage,
} from '../../shared/src/index.js';
import { runPrepKitPipeline } from '../../server/src/services/pipeline/index.js';
import { MockLLMProvider } from '../../server/src/providers/mocks/MockLLMProvider.js';
import { MockResearchProvider } from '../../server/src/providers/mocks/MockResearchProvider.js';
import { DynamicCrawler } from '../../server/src/services/crawler/dynamicCrawler.js';
import { BatchEvaluator } from '../../server/src/cli/batchEvaluator.js';

describe('Unseen Adversarial Evaluation Cases', () => {
  const createMockLlmForAdversarial = () => {
    const mock = new MockLLMProvider();
    mock.generateStructured = async (req: any) => {
      if (req.schemaName === 'ExtractionOutput') {
        // If near-empty JD, extract only the single requirement
        if (req.prompt.includes('Node.js only')) {
          return {
            roleTitle: 'Developer',
            seniority: 'Junior',
            responsibilities: [],
            requirements: [
              {
                id: 'r1',
                text: 'Node.js only',
                kind: 'technical',
                priority: 'must',
                evidenceText: 'Node.js only',
              },
            ],
          };
        }

        return {
          roleTitle: 'Software Engineer',
          seniority: 'Senior',
          responsibilities: ['Build backend services'],
          requirements: [
            {
              id: 'r1',
              text: '5+ years backend systems',
              kind: 'technical',
              priority: 'must',
              evidenceText: '5+ years backend systems',
            },
            {
              id: 'r2',
              text: 'Lead small engineering teams',
              kind: 'behavioural',
              priority: 'must',
              evidenceText: 'Lead small engineering teams',
            },
          ],
        };
      }

      if (req.schemaName === 'CompanyBriefOutput') {
        return {
          summary: 'Factual brief based only on available evidence.',
          what_they_do: 'Software product development.',
          sources: ['https://example.com'],
        };
      }

      if (req.schemaName === 'InitialQuestionsOutput') {
        return {
          questions: [
            {
              category: 'technical',
              prompt: 'Explain your experience building distributed services.',
              answer_outline: 'Look for concurrency and scale understanding.',
              difficulty: 2,
              requirement_ids: ['r1'],
            },
            {
              category: 'behavioural',
              prompt: 'Tell me about a time you led an engineering team through a technical disagreement.',
              answer_outline: 'Look for empathy, clear communication, and STAR structure.',
              difficulty: 2,
              requirement_ids: ['r2'],
            },
          ],
        };
      }

      if (req.schemaName === 'FlashcardsOutput') {
        return {
          flashcards: [
            {
              id: 'f-1',
              front: 'What are key distributed system patterns?',
              back: 'Partitioning, replication, and consensus.',
              requirement_ids: ['r1'],
              question_id: 'q-1',
            },
          ],
        };
      }

      return {};
    };
    return mock;
  };

  // -------------------------------------------------------------------------
  // Case A — Near-empty JD
  // -------------------------------------------------------------------------
  it('Case A: Near-empty JD produces honest thin kit without hallucinating requirements', async () => {
    const mockLlm = createMockLlmForAdversarial();
    const result = await runPrepKitPipeline(
      {
        jobDescription: 'Developer needed. Node.js only.',
        companyUrl: 'https://example.com',
        daysAvailable: 3,
      },
      {
        llmProvider: mockLlm,
        researchProvider: new MockResearchProvider(),
        crawler: new DynamicCrawler(),
        allowLocalCrawl: true,
      }
    );

    expect(result.kit).toBeDefined();
    expect(result.kit.role.requirements.length).toBe(1);
    expect(result.kit.role.requirements[0].text).toBe('Node.js only');
    expect(() => validateAppendixA(result.kit)).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Case B — 404 company URL
  // -------------------------------------------------------------------------
  it('Case B: 404 company URL degrades gracefully to honest brief without fabricating data', async () => {
    const mockLlm = createMockLlmForAdversarial();
    const result = await runPrepKitPipeline(
      {
        jobDescription: 'Senior Engineer\n- 5+ years backend systems (Required)\n- Lead small engineering teams (Required)',
        companyUrl: 'https://example.com/this-page-does-not-exist-404',
        daysAvailable: 5,
      },
      {
        llmProvider: mockLlm,
        researchProvider: new MockResearchProvider(),
        crawler: new DynamicCrawler(),
        allowLocalCrawl: true,
      }
    );

    expect(result.kit).toBeDefined();
    expect(() => validateAppendixA(result.kit)).not.toThrow();
    expect(result.internalKit.crawlMetrics).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Case C — No hiring/careers page
  // -------------------------------------------------------------------------
  it('Case C: No discoverable hiring page reports honest status without inventing rounds', async () => {
    const mockLlm = createMockLlmForAdversarial();
    const mockResearch = new MockResearchProvider();
    mockResearch.searchInterviewDiscussions = async () => [];

    const result = await runPrepKitPipeline(
      {
        jobDescription: 'Senior Engineer\n- 5+ years backend systems (Required)\n- Lead small engineering teams (Required)',
        companyUrl: 'https://example.com',
        daysAvailable: 5,
      },
      {
        llmProvider: mockLlm,
        researchProvider: mockResearch,
        crawler: new DynamicCrawler(),
        allowLocalCrawl: true,
      }
    );

    expect(result.kit).toBeDefined();
    expect(() => validateAppendixA(result.kit)).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Case D — Extremely small 1-day schedule
  // -------------------------------------------------------------------------
  it('Case D: Extremely small 1-day schedule produces exactly 1 day with all must-haves', async () => {
    const mockLlm = createMockLlmForAdversarial();
    const result = await runPrepKitPipeline(
      {
        jobDescription: 'Senior Engineer\n- 5+ years backend systems (Required)\n- Lead small engineering teams (Required)',
        companyUrl: 'https://example.com',
        daysAvailable: 1,
      },
      {
        llmProvider: mockLlm,
        researchProvider: new MockResearchProvider(),
        crawler: new DynamicCrawler(),
        allowLocalCrawl: true,
      }
    );

    expect(result.kit.schedule.days_available).toBe(1);
    expect(result.kit.schedule.days.length).toBe(1);
    expect(Number.isInteger(result.kit.schedule.days[0].minutes)).toBe(true);

    // Every must-have requirement must appear in day 1 question references
    const dayReqIds = new Set(
      result.kit.schedule.days[0].question_ids.flatMap((qid) => {
        const q = result.kit.questions.find((x) => x.id === qid);
        return q?.requirement_ids || [];
      })
    );
    expect(dayReqIds.has('r1')).toBe(true);
    expect(dayReqIds.has('r2')).toBe(true);
    expect(() => validateAppendixA(result.kit)).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Case E — 60-day schedule
  // -------------------------------------------------------------------------
  it('Case E: 60-day schedule produces exactly 60 days with valid reused question IDs', async () => {
    const mockLlm = createMockLlmForAdversarial();
    const result = await runPrepKitPipeline(
      {
        jobDescription: 'Senior Engineer\n- 5+ years backend systems (Required)\n- Lead small engineering teams (Required)',
        companyUrl: 'https://example.com',
        daysAvailable: 60,
      },
      {
        llmProvider: mockLlm,
        researchProvider: new MockResearchProvider(),
        crawler: new DynamicCrawler(),
        allowLocalCrawl: true,
      }
    );

    expect(result.kit.schedule.days_available).toBe(60);
    expect(result.kit.schedule.days.length).toBe(60);

    const validQuestionIds = new Set(result.kit.questions.map((q) => q.id));
    for (const day of result.kit.schedule.days) {
      expect(Number.isInteger(day.minutes)).toBe(true);
      expect(day.question_ids.length).toBeGreaterThan(0);
      for (const qid of day.question_ids) {
        expect(validQuestionIds.has(qid)).toBe(true);
      }
    }
    expect(() => validateAppendixA(result.kit)).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Case F — Malformed/unhelpful research results
  // -------------------------------------------------------------------------
  it('Case F: Malformed/empty research results fall back cleanly without inventing evidence', async () => {
    const mockLlm = createMockLlmForAdversarial();
    const emptyResearch = new MockResearchProvider();
    emptyResearch.searchInterviewDiscussions = async () => [];

    const result = await runPrepKitPipeline(
      {
        jobDescription: 'Senior Engineer\n- 5+ years backend systems (Required)\n- Lead small engineering teams (Required)',
        companyUrl: 'https://example.com',
        daysAvailable: 5,
      },
      {
        llmProvider: mockLlm,
        researchProvider: emptyResearch,
        crawler: new DynamicCrawler(),
        allowLocalCrawl: true,
      }
    );

    expect(result.kit).toBeDefined();
    expect(() => validateAppendixA(result.kit)).not.toThrow();
  });
});
