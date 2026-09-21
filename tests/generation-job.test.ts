import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import {
  AppendixAKitSchema,
  InternalPrepKit,
} from '@trao/shared';
import {
  User,
  Kit,
  GenerationJob,
} from '../server/src/db/models/index.js';
import {
  toBuilderViewModel,
  toAppendixAKit,
  toGenerationJobInfo,
} from '../server/src/db/converters/kitConverter.js';
import {
  GenerationJobService,
  GenerationRunner,
  recoverStaleJobs,
  assertValidTransition,
  InvalidJobTransitionError,
  StaleGenerationError,
  JobNotFoundError,
  KitNotFoundError,
  UnauthorizedAccessError,
  JobClaimConflictError,
  sanitizeErrorMessage,
} from '../server/src/services/jobs/index.js';
import { MockLLMProvider } from '../server/src/providers/mocks/MockLLMProvider.js';
import { MockResearchProvider } from '../server/src/providers/mocks/MockResearchProvider.js';
import {
  realisticJobDescription,
  mockCrawlResult,
  mockResearchResults,
} from './fixtures/pipelineFixtures.js';
import {
  setupTestDb,
  clearTestDb,
  teardownTestDb,
} from './helpers/testDb.js';

describe('Phase 6: Persistence & GenerationJob Orchestration', () => {
  let jobService: GenerationJobService;
  let runner: GenerationRunner;
  let userId1: string;
  let userId2: string;

  beforeAll(async () => {
    await setupTestDb();
    jobService = new GenerationJobService();
    runner = new GenerationRunner(jobService);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // Seed test users
    const user1 = await User.create({ email: 'alice@example.com', name: 'Alice' });
    const user2 = await User.create({ email: 'bob@example.com', name: 'Bob' });
    userId1 = user1._id.toString();
    userId2 = user2._id.toString();
  });

  // ===========================================================================
  // 1. Job Creation & Initial State
  // ===========================================================================
  describe('Job Creation & Lifecycle', () => {
    it('1. creates pending job and associated Kit with version 1', async () => {
      const res = await jobService.createGenerationJob({
        userId: userId1,
        jobDescription: 'Software Engineer Node.js',
        companyUrl: 'https://example.com',
        daysAvailable: 5,
      });

      expect(res.isExisting).toBe(false);
      expect(res.job.status).toBe('pending');
      expect(res.job.progress).toBe(0);
      expect(res.job.currentStep).toBe('VALIDATING_INPUT');
      expect(res.job.generationVersion).toBe(1);
      expect(res.job.retryAttempts).toBe(0);

      const kit = await Kit.findById(res.kitId);
      expect(kit).not.toBeNull();
      expect(kit!.status).toBe('generating');
      expect(kit!.generationVersion).toBe(1);
    });

    it('2. validates pending -> running transition', () => {
      expect(() => assertValidTransition('pending', 'running')).not.toThrow();
    });

    it('3. validates running -> completed transition', () => {
      expect(() => assertValidTransition('running', 'completed')).not.toThrow();
    });

    it('4. validates running -> failed transition', () => {
      expect(() => assertValidTransition('running', 'failed')).not.toThrow();
    });

    it('5. rejects invalid state transitions', () => {
      expect(() => assertValidTransition('completed', 'running')).toThrow(InvalidJobTransitionError);
      expect(() => assertValidTransition('failed', 'running')).toThrow(InvalidJobTransitionError);
      expect(() => assertValidTransition('completed', 'pending')).toThrow(InvalidJobTransitionError);
      expect(() => assertValidTransition('pending', 'completed')).toThrow(InvalidJobTransitionError);
    });
  });

  // ===========================================================================
  // 2. Atomic Job Claiming & Concurrency Race
  // ===========================================================================
  describe('Atomic Job Claiming & Concurrency', () => {
    it('6. atomically claims a pending job', async () => {
      const { job } = await jobService.createGenerationJob({
        userId: userId1,
        jobDescription: 'Backend Engineer',
        companyUrl: 'https://example.com',
        daysAvailable: 3,
      });

      const claimed = await runner.claimJob(job.id);
      expect(claimed).not.toBeNull();
      expect(claimed!.status).toBe('running');
      expect(claimed!.startedAt).toBeDefined();
      expect(claimed!.heartbeatAt).toBeDefined();
    });

    it('7. second worker cannot claim the same job (returns null)', async () => {
      const { job } = await jobService.createGenerationJob({
        userId: userId1,
        jobDescription: 'Backend Engineer',
        companyUrl: 'https://example.com',
        daysAvailable: 3,
      });

      const claim1 = await runner.claimJob(job.id);
      expect(claim1).not.toBeNull();
      expect(claim1!.status).toBe('running');

      // Second attempt
      const claim2 = await runner.claimJob(job.id);
      expect(claim2).toBeNull();
    });

    it('17. CONCURRENCY TEST: Two simulated workers attempting to claim simultaneously', async () => {
      const { job } = await jobService.createGenerationJob({
        userId: userId1,
        jobDescription: 'Frontend Engineer',
        companyUrl: 'https://acme.org',
        daysAvailable: 7,
      });

      // Launch two claims concurrently via Promise.all
      const [claimA, claimB] = await Promise.all([
        runner.claimJob(job.id),
        runner.claimJob(job.id),
      ]);

      // Exactly one must win, the other must receive null
      const winners = [claimA, claimB].filter((c) => c !== null);
      const losers = [claimA, claimB].filter((c) => c === null);

      expect(winners.length).toBe(1);
      expect(losers.length).toBe(1);
      expect(winners[0]!.status).toBe('running');
    });
  });

  // ===========================================================================
  // 3. Heartbeat & Progress Updates
  // ===========================================================================
  describe('Heartbeat & Step Progress', () => {
    it('8. updates heartbeat and progress timestamps', async () => {
      const { job } = await jobService.createGenerationJob({
        userId: userId1,
        jobDescription: 'DevOps Engineer',
        companyUrl: 'https://cloud.io',
        daysAvailable: 4,
      });

      await runner.claimJob(job.id);

      const beforeUpdate = new Date(Date.now() - 2000);
      await GenerationJob.updateOne({ _id: job.id }, { $set: { heartbeatAt: beforeUpdate } });

      await jobService.updateJobProgress(job.id, 'CRAWLING_SITE', 25);

      const updated = await GenerationJob.findById(job.id);
      expect(updated!.currentStep).toBe('CRAWLING_SITE');
      expect(updated!.progress).toBe(25);
      expect(updated!.heartbeatAt.getTime()).toBeGreaterThan(beforeUpdate.getTime());
    });
  });

  // ===========================================================================
  // 4. Stale Job Recovery & Retries
  // ===========================================================================
  describe('Stale Job Detection & Recovery', () => {
    it('9. detects running jobs with heartbeat older than 90 seconds', async () => {
      const { job } = await jobService.createGenerationJob({
        userId: userId1,
        jobDescription: 'QA Lead',
        companyUrl: 'https://test.io',
        daysAvailable: 2,
      });

      await runner.claimJob(job.id);

      // Stale heartbeat (100 seconds ago)
      const staleTime = new Date(Date.now() - 100_000);
      await GenerationJob.updateOne({ _id: job.id }, { $set: { heartbeatAt: staleTime } });

      const stale = await GenerationJob.find({
        status: 'running',
        heartbeatAt: { $lt: new Date(Date.now() - 90_000) },
      });
      expect(stale.length).toBe(1);
      expect(stale[0]._id.toString()).toBe(job.id);
    });

    it('10 & 11. recovers stale running job back to pending and increments retryAttempts', async () => {
      const { job } = await jobService.createGenerationJob({
        userId: userId1,
        jobDescription: 'QA Lead',
        companyUrl: 'https://test.io',
        daysAvailable: 2,
      });

      await runner.claimJob(job.id);

      // Set stale heartbeat
      await GenerationJob.updateOne(
        { _id: job.id },
        { $set: { heartbeatAt: new Date(Date.now() - 100_000), retryAttempts: 0 } }
      );

      const res = await recoverStaleJobs(90_000, 2);
      expect(res.recoveredCount).toBe(1);
      expect(res.failedCount).toBe(0);

      const recovered = await GenerationJob.findById(job.id);
      expect(recovered!.status).toBe('pending');
      expect(recovered!.retryAttempts).toBe(1);
    });

    it('12 & 13. marks job as failed with JOB_TIMEOUT after reaching maximum retries (2)', async () => {
      const { job } = await jobService.createGenerationJob({
        userId: userId1,
        jobDescription: 'QA Lead',
        companyUrl: 'https://test.io',
        daysAvailable: 2,
      });

      await runner.claimJob(job.id);

      // Simulate job that has already exhausted its 2 retries
      await GenerationJob.updateOne(
        { _id: job.id },
        { $set: { heartbeatAt: new Date(Date.now() - 100_000), retryAttempts: 2 } }
      );

      const res = await recoverStaleJobs(90_000, 2);
      expect(res.recoveredCount).toBe(0);
      expect(res.failedCount).toBe(1);

      const terminalJob = await GenerationJob.findById(job.id);
      expect(terminalJob!.status).toBe('failed');
      expect(terminalJob!.error?.code).toBe('JOB_TIMEOUT');
      expect(terminalJob!.error?.message).toContain('Pipeline stalled without heartbeat');
    });

    it('18. RECOVERY RACE TEST: Two recovery workers discovering the same stale job', async () => {
      const { job } = await jobService.createGenerationJob({
        userId: userId1,
        jobDescription: 'Security Engineer',
        companyUrl: 'https://shield.com',
        daysAvailable: 3,
      });

      await runner.claimJob(job.id);
      await GenerationJob.updateOne(
        { _id: job.id },
        { $set: { heartbeatAt: new Date(Date.now() - 120_000), retryAttempts: 0 } }
      );

      // Run two recovery sweeps concurrently
      const [res1, res2] = await Promise.all([
        recoverStaleJobs(90_000, 2),
        recoverStaleJobs(90_000, 2),
      ]);

      // Together, exactly one recovery should have succeeded
      const totalRecovered = res1.recoveredCount + res2.recoveredCount;
      expect(totalRecovered).toBe(1);

      const updatedJob = await GenerationJob.findById(job.id);
      expect(updatedJob!.status).toBe('pending');
      expect(updatedJob!.retryAttempts).toBe(1); // Incremented exactly once, not twice!
    });
  });

  // ===========================================================================
  // 5. Generation Versioning & Optimistic Concurrency
  // ===========================================================================
  describe('Generation Versioning & Optimistic Concurrency', () => {
    it('14 & 17. increments generationVersion on successful atomic final save', async () => {
      const { job, kitId } = await jobService.createGenerationJob({
        userId: userId1,
        jobDescription: 'Systems Architect',
        companyUrl: 'https://arch.org',
        daysAvailable: 5,
      });

      expect(job.generationVersion).toBe(1);

      // Simulate atomic final save in GenerationRunner
      const sampleInternalKit: InternalPrepKit = {
        source: {
          company: 'Arch Inc',
          company_url: 'https://arch.org',
          role: 'Systems Architect',
          location: 'Remote',
          jd_chars: 100,
          researched_at: new Date().toISOString(),
          pages_used: ['https://arch.org'],
        },
        company_brief: {
          summary: 'Cloud architecture company',
          what_they_do: 'Distributed systems consulting',
          sources: ['https://arch.org'],
        },
        role: {
          title: 'Systems Architect',
          seniority: 'Principal',
          responsibilities: ['Architecture'],
          requirements: [
            {
              id: 'r1',
              text: 'Distributed consensus',
              kind: 'technical',
              priority: 'must',
              _meta: { origin: 'generated', pinned: false },
            },
          ],
        },
        questions: [
          {
            id: 'q_abc12345',
            requirement_ids: ['r1'],
            category: 'technical',
            prompt: 'Explain Raft leader election.',
            answer_outline: 'Terms, heartbeats, candidate votes.',
            difficulty: 3,
            _meta: { origin: 'generated', pinned: false },
          },
        ],
        flashcards: [
          {
            id: 'f_xyz98765',
            requirement_ids: ['r1'],
            front: 'What triggers Raft election?',
            back: 'Election timer timeout without leader heartbeat.',
            _meta: { origin: 'generated', pinned: false },
          },
        ],
        schedule: {
          days_available: 5,
          days: [
            { day: 1, focus: 'Core', question_ids: ['q_abc12345'], minutes: 60 },
            { day: 2, focus: 'Review', question_ids: ['q_abc12345'], minutes: 60 },
            { day: 3, focus: 'Deep Dive', question_ids: ['q_abc12345'], minutes: 60 },
            { day: 4, focus: 'System', question_ids: ['q_abc12345'], minutes: 60 },
            { day: 5, focus: 'Final', question_ids: ['q_abc12345'], minutes: 60 },
          ],
        },
        coverage: {
          uncovered_requirement_ids: [],
          passes: 1,
        },
      };

      const updatedKit = await Kit.findOneAndUpdate(
        { _id: kitId, generationVersion: job.generationVersion },
        {
          $set: {
            internalKit: sampleInternalKit,
            status: 'ready',
            updatedAt: new Date(),
          },
          $inc: { generationVersion: 1 },
        },
        { new: true }
      );

      expect(updatedKit).not.toBeNull();
      expect(updatedKit!.generationVersion).toBe(2);
      expect(updatedKit!.status).toBe('ready');
      expect(updatedKit!.internalKit?.questions.length).toBe(1);
    });

    it('15, 16 & 17. CONCURRENCY: Stale generation cannot overwrite newer generation (StaleGenerationError)', async () => {
      // Scenario:
      // Generation A starts with expected version 1.
      // Generation B starts, finishes, and bumps version to 2.
      // Generation A finishes later with expected version 1.
      // Generation A's write MUST fail and throw StaleGenerationError without corrupting Kit.

      const { kitId } = await jobService.createGenerationJob({
        userId: userId1,
        jobDescription: 'Full Stack Engineer',
        companyUrl: 'https://fullstack.com',
        daysAvailable: 5,
      });

      // Generation B updates Kit first to version 2
      await Kit.findOneAndUpdate(
        { _id: kitId, generationVersion: 1 },
        {
          $set: {
            internalKit: {
              source: { company: 'Generation B Company' },
            } as any,
            status: 'ready',
          },
          $inc: { generationVersion: 1 },
        }
      );

      const currentKit = await Kit.findById(kitId);
      expect(currentKit!.generationVersion).toBe(2);

      // Now Generation A tries to update using stale version 1
      const staleSaveResult = await Kit.findOneAndUpdate(
        { _id: kitId, generationVersion: 1 }, // Expected version 1 no longer matches!
        {
          $set: {
            internalKit: {
              source: { company: 'STALE Generation A Company' },
            } as any,
          },
          $inc: { generationVersion: 1 },
        }
      );

      expect(staleSaveResult).toBeNull(); // ZERO documents modified!

      // Confirm newer Kit data was untouched
      const intactKit = await Kit.findById(kitId);
      expect(intactKit!.generationVersion).toBe(2);
      expect(intactKit!.internalKit?.source?.company).toBe('Generation B Company');
    });
  });

  // ===========================================================================
  // 6. Deduplication & Force Refresh
  // ===========================================================================
  describe('Deduplication & Force Refresh', () => {
    it('19. reuses active (pending/running) job for identical request', async () => {
      const input = {
        userId: userId1,
        jobDescription: 'Data Scientist Python SQL',
        companyUrl: 'https://data.ai',
        daysAvailable: 5,
      };

      const res1 = await jobService.createGenerationJob(input);
      expect(res1.isExisting).toBe(false);

      const res2 = await jobService.createGenerationJob(input);
      expect(res2.isExisting).toBe(true);
      expect(res2.job.id).toBe(res1.job.id);
    });

    it('20. reuses completed kit for identical request', async () => {
      const input = {
        userId: userId1,
        jobDescription: 'Site Reliability Engineer',
        companyUrl: 'https://sre.io',
        daysAvailable: 5,
      };

      const res1 = await jobService.createGenerationJob(input);

      // Simulate completion
      await Kit.updateOne({ _id: res1.kitId }, { $set: { status: 'ready' } });
      await GenerationJob.updateOne({ _id: res1.job.id }, { $set: { status: 'completed' } });

      const res2 = await jobService.createGenerationJob(input);
      expect(res2.isExisting).toBe(true);
      expect(res2.kitId).toBe(res1.kitId);
    });

    it('21. forceRefresh creates a new generation and does not attach to previous completed job', async () => {
      const input = {
        userId: userId1,
        jobDescription: 'MLOps Engineer',
        companyUrl: 'https://ml.io',
        daysAvailable: 5,
      };

      const res1 = await jobService.createGenerationJob(input);
      await Kit.updateOne({ _id: res1.kitId }, { $set: { status: 'ready', generationVersion: 1 } });
      await GenerationJob.updateOne({ _id: res1.job.id }, { $set: { status: 'completed' } });

      // Request with forceRefresh: true
      const res2 = await jobService.createGenerationJob({
        ...input,
        forceRefresh: true,
      });

      expect(res2.isExisting).toBe(false);
      expect(res2.job.id).not.toBe(res1.job.id);
      expect(res2.job.generationVersion).toBe(2);
      expect(res2.job.status).toBe('pending');
    });
  });

  // ===========================================================================
  // 7. User Isolation & Serialization Boundary
  // ===========================================================================
  describe('User Isolation & Appendix A Boundary', () => {
    it('22. prevents user from accessing another user job or kit', async () => {
      const { job, kitId } = await jobService.createGenerationJob({
        userId: userId1, // Alice
        jobDescription: 'Mobile Developer Swift',
        companyUrl: 'https://mobile.app',
        daysAvailable: 3,
      });

      // Bob tries to access Alice's job
      await expect(jobService.getGenerationJob(job.id, userId2)).rejects.toThrow(
        UnauthorizedAccessError
      );

      // Bob tries to access Alice's kit
      await expect(jobService.getKit(kitId, userId2)).rejects.toThrow(
        UnauthorizedAccessError
      );

      // Bob tries to export Alice's Appendix A
      await expect(jobService.getKitAppendixA(kitId, userId2)).rejects.toThrow(
        UnauthorizedAccessError
      );
    });

    it('23 & 24. raw Mongo document is not returned, Appendix A passes schema without _meta', async () => {
      const { kitId } = await jobService.createGenerationJob({
        userId: userId1,
        jobDescription: 'Security Analyst',
        companyUrl: 'https://cyber.org',
        daysAvailable: 2,
      });

      const internalKit: InternalPrepKit = {
        source: {
          company: 'CyberOrg',
          company_url: 'https://cyber.org',
          role: 'Security Analyst',
          location: 'On-site',
          jd_chars: 80,
          researched_at: new Date().toISOString(),
          pages_used: ['https://cyber.org'],
        },
        company_brief: {
          summary: 'Cybersecurity defense firm',
          what_they_do: 'Penetration testing and incident response',
          sources: ['https://cyber.org'],
        },
        role: {
          title: 'Security Analyst',
          seniority: 'Mid-Level',
          responsibilities: ['Incident response'],
          requirements: [
            {
              id: 'r1',
              text: 'SIEM log analysis',
              kind: 'technical',
              priority: 'must',
              _meta: { origin: 'generated', pinned: false, evidenceText: 'SIEM log analysis' },
            },
          ],
        },
        questions: [
          {
            id: 'q_sec12345',
            requirement_ids: ['r1'],
            category: 'technical',
            prompt: 'How do you investigate anomalous egress traffic?',
            answer_outline: 'Check firewall logs, correlate NetFlow, isolate host.',
            difficulty: 2,
            _meta: { origin: 'generated', pinned: false },
          },
        ],
        flashcards: [
          {
            id: 'f_sec98765',
            requirement_ids: ['r1'],
            front: 'What does SIEM stand for?',
            back: 'Security Information and Event Management.',
            _meta: { origin: 'generated', pinned: false },
          },
        ],
        schedule: {
          days_available: 2,
          days: [
            { day: 1, focus: 'Detection', question_ids: ['q_sec12345'], minutes: 45 },
            { day: 2, focus: 'Response', question_ids: ['q_sec12345'], minutes: 45 },
          ],
        },
        coverage: {
          uncovered_requirement_ids: [],
          passes: 1,
        },
      };

      await Kit.updateOne({ _id: kitId }, { $set: { internalKit, status: 'ready' } });

      // 1. Verify BuilderViewModel DTO
      const viewModel = await jobService.getKit(kitId, userId1);
      expect(viewModel.id).toBe(kitId);
      expect(viewModel.userId).toBe(userId1);
      expect((viewModel as any)._id).toBeUndefined(); // Mongo ObjectId removed!
      expect(viewModel.questions[0]._meta).toBeDefined(); // Internal builder meta preserved

      // 2. Verify Appendix A Export
      const appendixA = await jobService.getKitAppendixA(kitId, userId1);
      const parsed = AppendixAKitSchema.parse(appendixA);
      expect(parsed).toBeDefined();

      // STRICT CHECK: Ensure ZERO _meta leaks into Appendix A!
      expect((appendixA.questions[0] as any)._meta).toBeUndefined();
      expect((appendixA.flashcards[0] as any)._meta).toBeUndefined();
      expect((appendixA.role.requirements[0] as any)._meta).toBeUndefined();
    });
  });

  // ===========================================================================
  // 8. Error Sanitization & Secret Redaction
  // ===========================================================================
  describe('Failure Handling & Secret Redaction', () => {
    it('25. redacts Gemini keys, Tavily keys, and Bearer tokens from job error messages', () => {
      const dirtyMessage =
        'LLM call failed with status 403: key AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q and Tavily key tvly-abcdef1234567890. Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.token.sig';

      const sanitized = sanitizeErrorMessage(dirtyMessage);

      expect(sanitized).not.toContain('AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q');
      expect(sanitized).not.toContain('tvly-abcdef1234567890');
      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiJ9');
      expect(sanitized).toContain('[REDACTED_GEMINI_KEY]');
      expect(sanitized).toContain('[REDACTED_TAVILY_KEY]');
      expect(sanitized).toContain('Bearer [REDACTED_TOKEN]');
    });

    it('18. failed pipeline execution marks job as failed and records sanitized error', async () => {
      const { job } = await jobService.createGenerationJob({
        userId: userId1,
        jobDescription: 'Unreal Engine Developer',
        companyUrl: 'https://games.com',
        daysAvailable: 3,
      });

      const failingLlm = new MockLLMProvider();
      failingLlm.generateStructured = async () => {
        throw new Error('Gemini API rate limit exceeded: key AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q');
      };

      await expect(
        runner.runJob(job.id, {
          llmProvider: failingLlm,
          researchProvider: new MockResearchProvider(mockResearchResults),
        })
      ).rejects.toThrow();

      const failedJob = await GenerationJob.findById(job.id);
      expect(failedJob!.status).toBe('failed');
      expect(failedJob!.error?.code).toBeDefined();
      expect(failedJob!.error?.message).not.toContain('AIzaSy');
      expect(failedJob!.error?.message).toContain('[REDACTED_GEMINI_KEY]');
    });
  });

  // ===========================================================================
  // 9. End-to-End Pipeline Runner Integration
  // ===========================================================================
  describe('Full Pipeline Runner Integration', () => {
    it('executes full pipeline through GenerationRunner, updates progress, and saves Kit', async () => {
      const { job, kitId } = await jobService.createGenerationJob({
        userId: userId1,
        jobDescription: realisticJobDescription,
        companyUrl: 'https://scaleinnovations.example.com',
        daysAvailable: 5,
      });

      const mockLlm = new MockLLMProvider();
      mockLlm.generateStructured = async (req: any) => {
        if (req.schemaName === 'ExtractionOutput') {
          return {
            roleTitle: 'Senior Backend Engineer',
            seniority: 'Senior',
            responsibilities: ['Build distributed systems'],
            requirements: [
              {
                id: 'r1',
                text: '5+ years building distributed backend systems',
                kind: 'technical',
                priority: 'must',
                evidenceText: '5+ years building distributed backend systems using Node.js or Go (Required)',
              },
            ],
          };
        }
        if (req.schemaName === 'CompanyBriefOutput') {
          return {
            summary: 'Leading cloud logistics platform',
            what_they_do: 'Optimizes freight distribution networks',
            sources: ['https://scaleinnovations.example.com'],
          };
        }
        if (req.schemaName === 'InitialQuestionsOutput' || req.schemaName === 'QuestionBatch') {
          return {
            questions: [
              {
                temp_id: 't1',
                requirement_ids: ['r1'],
                category: 'technical',
                prompt: 'How do you design a distributed idempotency key mechanism for payment retries?',
                answer_outline: 'Use Redis SETNX with TTL and token bucket.',
                difficulty: 3,
              },
            ],
          };
        }
        if (req.schemaName === 'FlashcardsOutput' || req.schemaName === 'FlashcardBatch') {
          return {
            flashcards: [
              {
                temp_id: 'fc1',
                question_reference: 't1',
                requirement_ids: ['r1'],
                front: 'What guarantees idempotency in payment APIs?',
                back: 'Unique client-generated idempotency keys checked atomically in cache.',
              },
            ],
          };
        }
        throw new Error(`Unexpected schema: ${req.schemaName}`);
      };

      const mockCrawler: any = {
        crawl: async () => mockCrawlResult,
      };

      const result = await runner.runJob(job.id, {
        llmProvider: mockLlm,
        researchProvider: new MockResearchProvider(mockResearchResults),
        crawler: mockCrawler,
      });

      expect(result).toBeDefined();

      // Check job state in database
      const finishedJob = await GenerationJob.findById(job.id);
      expect(finishedJob!.status).toBe('completed');
      expect(finishedJob!.progress).toBe(100);
      expect(finishedJob!.completedAt).toBeDefined();

      // Check kit state in database
      const savedKit = await Kit.findById(kitId);
      expect(savedKit!.status).toBe('ready');
      expect(savedKit!.generationVersion).toBe(2);
      expect(savedKit!.internalKit).not.toBeNull();
      expect(savedKit!.internalKit!.questions.length).toBeGreaterThanOrEqual(1);

      // Verify Appendix A output from DB
      const appendixA = await jobService.getKitAppendixA(kitId, userId1);
      expect(AppendixAKitSchema.parse(appendixA)).toBeDefined();
    });
  });
});
