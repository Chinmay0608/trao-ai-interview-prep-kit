import { describe, it, expect } from 'vitest';
import {
  runPrepKitPipeline,
  PipelineExecutionError,
} from '../server/src/services/pipeline/index.js';
import { MockLLMProvider } from '../server/src/providers/mocks/MockLLMProvider.js';
import { MockResearchProvider } from '../server/src/providers/mocks/MockResearchProvider.js';
import { DynamicCrawler } from '../server/src/services/crawler/DynamicCrawler.js';
import {
  realisticJobDescription,
  shortStubJobDescription,
  mockCrawlResult,
  mockResearchResults,
} from './fixtures/pipelineFixtures.js';

describe('Phase 5: Master Pipeline Integration', () => {
  it('executes full 12-step pipeline, detects coverage gap, triggers second-pass, and produces valid Appendix A kit', async () => {
    let callStep = 0;

    // Orchestrate multi-step LLM responses dynamically:
    // Step 1: Extraction
    // Step 4: Brief
    // Step 5: Initial Questions (INTENTIONALLY leaves must-have r2 uncovered!)
    // Step 7: Second-Pass Gap Questions (CLOSES the gap by covering r2)
    // Step 10: Flashcards
    const mockLlm = new MockLLMProvider();
    mockLlm.generateStructured = async (req: any) => {
      callStep++;
      if (req.schemaName === 'ExtractionOutput') {
        return {
          roleTitle: 'Senior Backend Engineer',
          seniority: 'Senior',
          responsibilities: [
            'Design and deploy distributed, event-driven microservices',
            'Mentor junior and mid-level software engineers',
          ],
          requirements: [
            {
              id: 'r1',
              text: '5+ years building distributed backend systems using Node.js or Go',
              kind: 'technical',
              priority: 'must',
              evidenceText: '5+ years building distributed backend systems using Node.js or Go (Required)',
            },
            {
              id: 'r2',
              text: 'Proven track record mentoring junior and mid-level engineers',
              kind: 'behavioural',
              priority: 'must',
              evidenceText: 'Proven track record mentoring junior and mid-level engineers (Required)',
            },
            {
              id: 'r3',
              text: 'Deep experience with PostgreSQL and MongoDB',
              kind: 'technical',
              priority: 'must',
              evidenceText: 'Deep experience with relational and NoSQL databases like PostgreSQL and MongoDB (Required)',
            },
            {
              id: 'r4',
              text: 'Hands-on experience with Kubernetes and Terraform',
              kind: 'technical',
              priority: 'nice',
              evidenceText: 'Bonus: Hands-on experience with Kubernetes and Terraform infrastructure as code (Nice to have)',
            },
          ],
        };
      }

      if (req.schemaName === 'CompanyBriefOutput') {
        return {
          summary: 'Acme builds distributed telemetry pipelines with a 4-round interview process.',
          what_they_do: 'They deliver high-scale event processing for enterprise platforms.',
          sources: mockCrawlResult.pagesUsed,
        };
      }

      if (req.schemaName === 'InitialQuestionsOutput') {
        // Intentionally covers r1 and r3, leaving r2 UNCOVERED
        return {
          questions: [
            {
              requirement_ids: ['r1'],
              category: 'technical',
              prompt: 'How do you design a distributed consensus protocol in Go?',
              answer_outline: 'Explain Raft leader election, log replication, and split-brain resolution.',
              difficulty: 3,
            },
            {
              requirement_ids: ['r3'],
              category: 'system-design',
              prompt: 'How do you architect read-replicas and sharding between PostgreSQL and MongoDB?',
              answer_outline: 'Explain write concerns, secondary reads, and hash partition keys.',
              difficulty: 3,
            },
            {
              requirement_ids: ['r4'],
              category: 'technical',
              prompt: 'Explain Kubernetes pod disruption budgets and zero-downtime rolling updates.',
              answer_outline: 'Describe PDB manifests, readiness probes, and graceful termination hooks.',
              difficulty: 2,
            },
          ],
        };
      }

      if (req.schemaName === 'TargetedGapQuestionsOutput') {
        // Targeted second pass generated specifically for missing r2
        return {
          questions: [
            {
              requirement_ids: ['r2'],
              category: 'behavioural',
              prompt: 'Describe a situation where a junior engineer was struggling with architectural complexity and how you mentored them.',
              answer_outline: 'Use STAR method: explain paired design reviews, incremental milestones, and code review guidance.',
              difficulty: 2,
            },
          ],
        };
      }

      if (req.schemaName === 'FlashcardsOutput') {
        return {
          flashcards: [
            {
              front: 'What is Raft leader election?',
              back: 'A consensus mechanism where nodes transition from follower to candidate on heartbeat timeout.',
              requirement_ids: ['r1'],
            },
            {
              front: 'Key principle of effective technical mentorship?',
              back: 'Active listening, collaborative pairing, and empowering autonomous decision making.',
              requirement_ids: ['r2'],
            },
          ],
        };
      }

      throw new Error(`Unexpected request in mock: ${req.schemaName}`);
    };

    const mockResearch = new MockResearchProvider({
      mockResults: mockResearchResults,
    });

    const mockCrawler = new DynamicCrawler({
      safeFetchOptions: {
        httpFetchOverride: async (url) => ({
          statusCode: 200,
          finalUrl: url,
          contentType: 'text/html',
          body: mockCrawlResult.pages[0].extractedText,
          redirectChain: [],
        }),
      },
    });

    const recordedSteps: string[] = [];

    const result = await runPrepKitPipeline(
      {
        jobDescription: realisticJobDescription,
        companyUrl: 'https://acme.example.com',
        daysAvailable: 3,
      },
      {
        llmProvider: mockLlm,
        researchProvider: mockResearch,
        crawler: mockCrawler,
        onStepProgress: (progress) => {
          recordedSteps.push(progress.step);
        },
      }
    );

    // 1. All 12 steps executed
    expect(recordedSteps).toContain('EXTRACTING_JD');
    expect(recordedSteps).toContain('CRAWLING_SITE');
    expect(recordedSteps).toContain('SEARCHING_PUBLIC_INFO');
    expect(recordedSteps).toContain('SYNTHESIZING_BRIEF');
    expect(recordedSteps).toContain('GENERATING_QUESTIONS');
    expect(recordedSteps).toContain('CHECKING_COVERAGE');
    expect(recordedSteps).toContain('SECOND_PASS_GAP_CLOSURE');
    expect(recordedSteps).toContain('RECHECKING_COVERAGE');
    expect(recordedSteps).toContain('NORMALIZING_QUESTIONS');
    expect(recordedSteps).toContain('GENERATING_FLASHCARDS');
    expect(recordedSteps).toContain('ALLOCATING_SCHEDULE');
    expect(recordedSteps).toContain('VALIDATING_APPENDIX_A');

    // 2. Second pass closed coverage gap
    expect(result.context.gapRequirements).toHaveLength(1);
    expect(result.context.gapRequirements![0].id).toBe('r2');
    expect(result.kit.coverage.passes).toBe(2);
    expect(result.kit.coverage.uncovered_requirement_ids).toEqual([]);

    // 3. Questions received canonical q_${nanoid(8)} IDs
    for (const q of result.kit.questions) {
      expect(q.id).toMatch(/^q_[a-z0-9]{8}$/);
    }

    // 4. Flashcards generated after question bank & reference valid requirements
    expect(result.kit.flashcards.length).toBeGreaterThanOrEqual(1);
    for (const f of result.kit.flashcards) {
      expect(f.requirement_ids.length).toBeGreaterThan(0);
      expect(f.id).toMatch(/^f_[a-z0-9]{8}$/);
    }

    // 5. Schedule contains exactly 3 days and all must-haves appear
    expect(result.kit.schedule.days_available).toBe(3);
    expect(result.kit.schedule.days).toHaveLength(3);
    for (const day of result.kit.schedule.days) {
      expect(Number.isInteger(day.minutes)).toBe(true);
      expect(day.question_ids.length).toBeGreaterThan(0);
    }

    // 6. Appendix A serialization strips all internal metadata
    expect((result.kit as any)._meta).toBeUndefined();
    for (const q of result.kit.questions) {
      expect((q as any)._meta).toBeUndefined();
    }
    for (const req of result.kit.role.requirements) {
      expect((req as any)._meta).toBeUndefined();
    }
  });

  it('handles short 2-line stub JD honestly without hallucinating extra requirements', async () => {
    const mockLlm = new MockLLMProvider();
    mockLlm.generateStructured = async (req: any) => {
      if (req.schemaName === 'ExtractionOutput') {
        return {
          roleTitle: 'Frontend Developer',
          seniority: 'Mid-Level',
          responsibilities: ['Build user interfaces'],
          requirements: [
            {
              id: 'r1',
              text: '3+ years experience with React and TypeScript',
              kind: 'technical',
              priority: 'must',
              evidenceText: 'Must have 3+ years experience with React and TypeScript.',
            },
            {
              id: 'r2',
              text: 'Familiarity with GraphQL',
              kind: 'technical',
              priority: 'nice',
              evidenceText: 'Bonus points for familiarity with GraphQL.',
            },
          ],
        };
      }

      if (req.schemaName === 'CompanyBriefOutput') {
        return {
          summary: 'Tech startup overview.',
          what_they_do: 'Software development.',
          sources: [],
        };
      }

      if (req.schemaName === 'InitialQuestionsOutput') {
        return {
          questions: [
            {
              requirement_ids: ['r1'],
              category: 'technical',
              prompt: 'Explain React hooks lifecycle and useEffect dependency management.',
              answer_outline: 'Explain closures, stale state, and cleanup functions.',
              difficulty: 2,
            },
          ],
        };
      }

      if (req.schemaName === 'FlashcardsOutput') {
        return {
          flashcards: [
            {
              front: 'What does the cleanup function in useEffect do?',
              back: 'Runs before the component unmounts and before re-running the effect on dependency change.',
              requirement_ids: ['r1'],
            },
          ],
        };
      }

      throw new Error(`Unexpected call: ${req.schemaName}`);
    };

    const result = await runPrepKitPipeline(
      {
        jobDescription: shortStubJobDescription,
        companyUrl: 'https://smallstartup.example.com',
        daysAvailable: 1,
      },
      {
        llmProvider: mockLlm,
        researchProvider: new MockResearchProvider(),
      }
    );

    // Honestly extracted only the 2 requirements directly present in stub
    expect(result.kit.role.requirements).toHaveLength(2);
    expect(result.kit.role.requirements[0].text).toContain('React and TypeScript');
    expect(result.kit.schedule.days_available).toBe(1);
    expect(result.kit.schedule.days).toHaveLength(1);
  });

  it('handles unreachable company site and empty research gracefully without failing', async () => {
    const mockLlm = new MockLLMProvider();
    mockLlm.generateStructured = async (req: any) => {
      if (req.schemaName === 'ExtractionOutput') {
        return {
          roleTitle: 'Developer',
          seniority: 'Mid-Level',
          responsibilities: ['Development'],
          requirements: [
            {
              id: 'r1',
              text: 'Python experience',
              kind: 'technical',
              priority: 'must',
              evidenceText: 'Python developer needed',
            },
          ],
        };
      }
      if (req.schemaName === 'InitialQuestionsOutput') {
        return {
          questions: [
            {
              requirement_ids: ['r1'],
              category: 'technical',
              prompt: 'Explain Python GIL.',
              answer_outline: 'Global Interpreter Lock details.',
              difficulty: 2,
            },
          ],
        };
      }
      if (req.schemaName === 'FlashcardsOutput') {
        return {
          flashcards: [
            {
              front: 'What is Python GIL?',
              back: 'Mutex protecting access to Python objects.',
              requirement_ids: ['r1'],
            },
          ],
        };
      }
      throw new Error(`Unexpected: ${req.schemaName}`);
    };

    // Crawler fails with 404 / network error
    const failingCrawler = new DynamicCrawler({
      safeFetchOptions: {
        httpFetchOverride: async () => {
          throw new Error('404 Not Found');
        },
      },
    });

    const result = await runPrepKitPipeline(
      {
        jobDescription: 'Python developer needed with 3+ years experience.',
        companyUrl: 'https://unreachable-site-404.example.com',
        daysAvailable: 2,
      },
      {
        llmProvider: mockLlm,
        researchProvider: new MockResearchProvider(), // empty research
        crawler: failingCrawler,
      }
    );

    expect(result.kit).toBeDefined();
    // Brief notes unreachable status honestly
    expect(result.kit.company_brief.summary).toContain('Limited or unreachable');
    expect(result.kit.company_brief.sources).toEqual([]);
    expect(result.kit.schedule.days_available).toBe(2);
  });

  it('throws PipelineExecutionError if must-have requirements cannot be resolved after second pass', async () => {
    const mockLlm = new MockLLMProvider();
    mockLlm.generateStructured = async (req: any) => {
      if (req.schemaName === 'ExtractionOutput') {
        return {
          roleTitle: 'Engineer',
          seniority: 'Senior',
          responsibilities: ['Coding'],
          requirements: [
            {
              id: 'r1',
              text: 'Distributed Systems',
              kind: 'technical',
              priority: 'must',
              evidenceText: 'Distributed systems required',
            },
            {
              id: 'r2',
              text: 'Leadership',
              kind: 'behavioural',
              priority: 'must',
              evidenceText: 'Leadership required',
            },
          ],
        };
      }
      if (req.schemaName === 'CompanyBriefOutput') {
        return { summary: 'S', what_they_do: 'W', sources: [] };
      }
      // Both initial and gap questions persistently refuse to cover r2
      if (req.schemaName === 'InitialQuestionsOutput' || req.schemaName === 'TargetedGapQuestionsOutput') {
        return {
          questions: [
            {
              requirement_ids: ['r1'],
              category: 'technical',
              prompt: 'Raft consensus?',
              answer_outline: 'Outline',
              difficulty: 2,
            },
          ],
        };
      }
      throw new Error('Unexpected');
    };

    await expect(
      runPrepKitPipeline(
        {
          jobDescription: 'Distributed systems and Leadership required.',
          companyUrl: 'https://test.com',
          daysAvailable: 2,
        },
        {
          llmProvider: mockLlm,
          researchProvider: new MockResearchProvider(),
        }
      )
    ).rejects.toThrow(PipelineExecutionError);
  });
});
