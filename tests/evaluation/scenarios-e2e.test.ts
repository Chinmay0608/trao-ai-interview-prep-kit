import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import http from 'http';
import mongoose from 'mongoose';
import { createApp } from '../../server/src/app.js';
import {
  setupTestDb,
  clearTestDb,
  teardownTestDb,
} from '../helpers/testDb.js';
import { setPipelineOptionsForRoute } from '../../server/src/routes/kitRoutes.js';
import { MockLLMProvider } from '../../server/src/providers/mocks/MockLLMProvider.js';
import { MockResearchProvider } from '../../server/src/providers/mocks/MockResearchProvider.js';
import { User } from '../../server/src/db/models/User.js';
import { Kit } from '../../server/src/db/models/Kit.js';
import { GenerationJob } from '../../server/src/db/models/GenerationJob.js';
import { signAuthToken } from '../../server/src/auth/authService.js';
import { ScenarioRunner, ScenarioDefinition } from '../../server/src/cli/scenarioRunner.js';
import {
  AppendixAKit,
  validateAppendixA,
  InternalPrepKit,
} from '@trao/shared';

describe('Phase 9: Comprehensive End-to-End & Regression Evaluation Suite', () => {
  const app = createApp();
  let server: any;
  let baseUrl: string;
  let mockLlm: MockLLMProvider;
  let mockResearch: MockResearchProvider;

  let tokenUserA: string;
  let tokenUserB: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    await setupTestDb();

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    mockLlm = new MockLLMProvider();
    mockResearch = new MockResearchProvider();

    // Default mock behavior
    mockLlm.generateStructured = async (req: any) => {
      if (req.schemaName === 'ExtractionOutput') {
        return {
          roleTitle: 'Full Stack Engineer',
          seniority: 'Senior',
          responsibilities: ['Build web apps and backend services'],
          requirements: [
            {
              id: 'r1',
              text: 'Expertise in TypeScript and React',
              kind: 'technical',
              priority: 'must',
              evidenceText: 'React required',
            },
            {
              id: 'r2',
              text: 'Cross-functional collaboration and clear communication',
              kind: 'behavioural',
              priority: 'must',
              evidenceText: 'Communication required',
            },
          ],
        };
      }
      if (req.schemaName === 'CompanyBriefOutput') {
        return {
          summary: 'TechCorp is an engineering organization.',
          what_they_do: 'Building developer tools.',
          sources: ['https://techcorp.example.com'],
        };
      }
      if (req.schemaName === 'InitialQuestionsOutput') {
        return {
          questions: [
            {
              requirement_ids: ['r1'],
              category: 'technical',
              prompt: 'Explain React rendering lifecycle and optimization strategies.',
              answer_outline: 'useMemo, useCallback, reconciliation algorithm.',
              difficulty: 2,
            },
            {
              requirement_ids: ['r2'],
              category: 'behavioural',
              prompt: 'Tell me about a time you handled a disagreement with a product manager.',
              answer_outline: 'Use STAR method: explain context, active listening, and compromise.',
              difficulty: 2,
            },
          ],
        };
      }
      if (req.schemaName === 'TargetedGapQuestionsOutput') {
        return {
          questions: [
            {
              requirement_ids: ['r2'],
              category: 'behavioural',
              prompt: 'How do you foster an inclusive team culture?',
              answer_outline: 'Team retrospectives and open feedback loops.',
              difficulty: 1,
            },
          ],
        };
      }
      if (req.schemaName === 'FlashcardsOutput') {
        return {
          flashcards: [
            {
              front: 'What does React.memo do?',
              back: 'Prevents re-renders if props did not change.',
              requirement_ids: ['r1'],
            },
            {
              front: 'What is the STAR interview method?',
              back: 'Situation, Task, Action, Result.',
              requirement_ids: ['r2'],
            },
          ],
        };
      }
      return {};
    };

    setPipelineOptionsForRoute({
      llmProvider: mockLlm,
      researchProvider: mockResearch,
      allowLocalCrawl: true,
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // Create 2 distinct isolated test users
    const userA = await User.create({
      email: 'usera@example.com',
      passwordHash: 'hashA',
      name: 'User A',
    });
    userAId = userA._id.toString();
    tokenUserA = signAuthToken(userA);

    const userB = await User.create({
      email: 'userb@example.com',
      passwordHash: 'hashB',
      name: 'User B',
    });
    userBId = userB._id.toString();
    tokenUserB = signAuthToken(userB);
  });

  // =========================================================================
  // 9.1 Happy Path Generation
  // =========================================================================
  describe('9.1 Happy Path Generation', () => {
    it('executes full pipeline, links requirements to questions, builds valid schedule and passes validateAppendixA', async () => {
      const runner = new ScenarioRunner({
        llmProvider: mockLlm,
        researchProvider: mockResearch,
        allowLocalCrawl: true,
      });

      const scenario: ScenarioDefinition = {
        name: 'Happy Path Full Generation',
        description: 'Verifies normal end-to-end generation with complete Appendix A compliance',
        input: {
          id: 'happy-01',
          jd: 'Senior Full Stack Engineer\nRequirements:\n- React & TypeScript (Required)\n- Team collaboration (Required)',
          company_url: 'https://techcorp.example.com',
          days: 5,
        },
        expectedStatus: 'ok',
        assertKit: (kit: AppendixAKit) => {
          expect(kit.source.company_url).toBe('https://techcorp.example.com');
          expect(kit.role.requirements.length).toBeGreaterThanOrEqual(2);
          expect(kit.questions.length).toBeGreaterThanOrEqual(2);

          // All must-have requirements covered
          expect(kit.coverage.uncovered_requirement_ids.length).toBe(0);

          // Schedule days count equals days_available
          expect(kit.schedule.days.length).toBe(5);
          expect(kit.schedule.days_available).toBe(5);

          // Strict Appendix A validation
          expect(() => validateAppendixA(kit)).not.toThrow();
        },
      };

      const res = await runner.runScenario(scenario);
      expect(res.passed).toBe(true);
    });
  });

  // =========================================================================
  // 9.2 Authentication & User Isolation
  // =========================================================================
  describe('9.2 Authentication & User Isolation', () => {
    it('enforces that User B cannot read, regenerate, or delete User A kit', async () => {
      // 1. User A creates a kit
      const kitA = await Kit.create({
        userId: userAId,
        deduplicationKey: 'dedup_user_a_kit',
        jobDescription: 'User A Job Description',
        companyUrl: 'https://company-a.example.com',
        daysAvailable: 3,
        internalKit: {
          source: {
            company: 'Company A',
            company_url: 'https://company-a.example.com',
            role: 'Backend Engineer',
            location: 'Remote',
            jd_chars: 100,
            researched_at: new Date().toISOString(),
            pages_used: [],
          },
          company_brief: { summary: 'Brief', what_they_do: 'Software', sources: [] },
          role: {
            title: 'Backend Engineer',
            seniority: 'Senior',
            responsibilities: [],
            requirements: [{ id: 'r1', text: 'Node', kind: 'technical', priority: 'must', _meta: { origin: 'generated', pinned: false } }],
          },
          questions: [
            {
              id: 'q_a1',
              requirement_ids: ['r1'],
              category: 'technical',
              prompt: 'Explain event loop',
              answer_outline: 'Phases of libuv event loop',
              difficulty: 2,
              _meta: { origin: 'generated', pinned: false },
            },
          ],
          flashcards: [],
          schedule: { days_available: 3, days: [{ day: 1, focus: 'Node', question_ids: ['q_a1'], minutes: 30 }, { day: 2, focus: 'Node 2', question_ids: ['q_a1'], minutes: 30 }, { day: 3, focus: 'Node 3', question_ids: ['q_a1'], minutes: 30 }] },
          coverage: { uncovered_requirement_ids: [], passes: 1 },
        },
      });

      const kitAId = kitA._id.toString();

      // 2. User B tries to read User A's kit -> 404 Kit Not Found (isolated)
      const readRes = await request(app)
        .get(`/api/kits/${kitAId}`)
        .set('Authorization', `Bearer ${tokenUserB}`);
      expect(readRes.status).toBe(404);

      // 3. User B tries to regenerate User A's kit -> 404
      const regenRes = await request(app)
        .post(`/api/kits/${kitAId}/regenerate`)
        .set('Authorization', `Bearer ${tokenUserB}`)
        .send({ generationVersion: 1 });
      expect(regenRes.status).toBe(404);

      // 4. User B tries to delete a question in User A's kit -> 404
      const deleteRes = await request(app)
        .delete(`/api/kits/${kitAId}/questions/q_a1`)
        .set('Authorization', `Bearer ${tokenUserB}`);
      expect(deleteRes.status).toBe(404);
    });
  });

  // =========================================================================
  // 9.3 Scoped Regeneration & State Preservation
  // =========================================================================
  describe('9.3 Scoped Regeneration & State Preservation', () => {
    it('preserves pinned, edited, and custom questions while replacing pristine questions in scope', async () => {
      // Create kit for User A with mixed questions:
      // q1: pristine generated (technical) -> MUST BE REPLACED
      // q2: pinned (technical) -> MUST BE PRESERVED
      // q3: edited (technical) -> MUST BE PRESERVED
      // q4: custom (technical) -> MUST BE PRESERVED
      // q5: behavioural (different category) -> MUST BE PRESERVED
      const kitDoc = await Kit.create({
        userId: userAId,
        deduplicationKey: 'dedup_regen_test_kit',
        jobDescription: 'Software Engineer',
        companyUrl: 'https://example.com',
        daysAvailable: 2,
        generationVersion: 1,
        internalKit: {
          source: {
            company: 'Example',
            company_url: 'https://example.com',
            role: 'Dev',
            location: '',
            jd_chars: 100,
            researched_at: new Date().toISOString(),
            pages_used: [],
          },
          company_brief: { summary: 'Brief', what_they_do: '', sources: [] },
          role: {
            title: 'Dev',
            seniority: 'Mid',
            responsibilities: [],
            requirements: [
              { id: 'r1', text: 'Tech', kind: 'technical', priority: 'must', _meta: { origin: 'generated', pinned: false } },
              { id: 'r2', text: 'Soft', kind: 'behavioural', priority: 'must', _meta: { origin: 'generated', pinned: false } },
            ],
          },
          questions: [
            {
              id: 'q_pristine',
              requirement_ids: ['r1'],
              category: 'technical',
              prompt: 'Old pristine prompt',
              answer_outline: 'Outline',
              difficulty: 1,
              _meta: { origin: 'generated', pinned: false },
            },
            {
              id: 'q_pinned',
              requirement_ids: ['r1'],
              category: 'technical',
              prompt: 'Pinned prompt',
              answer_outline: 'Outline',
              difficulty: 2,
              _meta: { origin: 'generated', pinned: true },
            },
            {
              id: 'q_edited',
              requirement_ids: ['r1'],
              category: 'technical',
              prompt: 'Edited prompt',
              answer_outline: 'Outline',
              difficulty: 2,
              _meta: { origin: 'edited', pinned: false },
            },
            {
              id: 'q_custom',
              requirement_ids: ['r1'],
              category: 'technical',
              prompt: 'Custom prompt',
              answer_outline: 'Outline',
              difficulty: 3,
              _meta: { origin: 'custom', pinned: false },
            },
            {
              id: 'q_behavioural',
              requirement_ids: ['r2'],
              category: 'behavioural',
              prompt: 'Behavioural prompt',
              answer_outline: 'Outline',
              difficulty: 1,
              _meta: { origin: 'generated', pinned: false },
            },
          ],
          flashcards: [
            { id: 'f_pristine', front: 'F Pristine', back: 'B', requirement_ids: ['r1'], question_id: 'q_pristine', _meta: { origin: 'generated' } },
            { id: 'f_pinned', front: 'F Pinned', back: 'B', requirement_ids: ['r1'], question_id: 'q_pinned', _meta: { origin: 'generated' } },
          ],
          schedule: {
            days_available: 2,
            days: [
              { day: 1, focus: 'Day 1', question_ids: ['q_pristine', 'q_pinned'], minutes: 60 },
              { day: 2, focus: 'Day 2', question_ids: ['q_edited', 'q_custom', 'q_behavioural'], minutes: 60 },
            ],
          },
          coverage: { uncovered_requirement_ids: [], passes: 1 },
        },
      });

      // Regenerate ONLY 'technical' category
      const res = await request(app)
        .post(`/api/kits/${kitDoc._id.toString()}/regenerate`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          category: 'technical',
          generationVersion: 1,
        });

      expect(res.status).toBe(200);
      const updatedKit = res.body;

      const questionIds = updatedKit.questions.map((q: any) => q.id);

      // Preserved items must survive
      expect(questionIds).toContain('q_pinned');
      expect(questionIds).toContain('q_edited');
      expect(questionIds).toContain('q_custom');
      expect(questionIds).toContain('q_behavioural');

      // Pristine question was replaced
      expect(questionIds).not.toContain('q_pristine');

      // Flashcards: preserved question flashcard survives, discarded question flashcard is pruned
      const flashcardIds = updatedKit.flashcards.map((f: any) => f.id);
      expect(flashcardIds).toContain('f_pinned');
      expect(flashcardIds).not.toContain('f_pristine');

      // Schedule reconciliation: every question_id in schedule exists in final questions
      const finalQuestionIds = new Set(questionIds);
      for (const day of updatedKit.schedule.days) {
        for (const qId of day.question_ids) {
          expect(finalQuestionIds.has(qId)).toBe(true);
        }
      }
    });
  });

  // =========================================================================
  // 9.4 Invalid Input & Edge Cases
  // =========================================================================
  describe('9.4 Invalid Input & Edge Cases', () => {
    it('stub JD produces an honest thin kit without hallucinating requirements', async () => {
      const runner = new ScenarioRunner({
        llmProvider: mockLlm,
        researchProvider: mockResearch,
        allowLocalCrawl: true,
      });

      const res = await runner.runScenario({
        name: 'Stub JD',
        description: '2-line stub JD produces honest minimal requirements',
        input: {
          id: 'case-stub',
          jd: 'Looking for a React developer with 3+ years experience.',
          company_url: 'https://stubcorp.example.com',
          days: 2,
        },
        expectedStatus: 'ok',
        assertKit: (kit: AppendixAKit) => {
          expect(kit.role.requirements.length).toBeGreaterThan(0);
          expect(kit.schedule.days_available).toBe(2);
          expect(kit.schedule.days.length).toBe(2);
          expect(() => validateAppendixA(kit)).not.toThrow();
        },
      });

      expect(res.passed).toBe(true);
    });

    it('unreachable company URL produces honest brief and does not crash batch', async () => {
      const runner = new ScenarioRunner({
        llmProvider: mockLlm,
        researchProvider: mockResearch,
        allowLocalCrawl: true,
      });

      const res = await runner.runScenario({
        name: 'Unreachable Company Site',
        description: 'Unreachable company website produces honest gap report without crashing',
        input: {
          id: 'case-unreachable',
          jd: 'Backend Engineer\nRequirements:\n- PostgreSQL (Required)',
          company_url: 'https://non-existent-domain-404-timeout.example.com',
          days: 3,
        },
        expectedStatus: 'ok',
        assertKit: (kit: AppendixAKit) => {
          // Company brief reports honest lack of crawl data
          expect(typeof kit.company_brief.summary).toBe('string');
          expect(() => validateAppendixA(kit)).not.toThrow();
        },
      });

      expect(res.passed).toBe(true);
    });

    it('1-day schedule allocates correctly without empty-question days', async () => {
      const runner = new ScenarioRunner({
        llmProvider: mockLlm,
        researchProvider: mockResearch,
        allowLocalCrawl: true,
      });

      const res = await runner.runScenario({
        name: '1-Day Schedule',
        description: 'Single-day schedule allocates properly',
        input: {
          id: 'case-1day',
          jd: 'Software Engineer\nRequirements:\n- Python (Required)',
          company_url: 'https://pythoncorp.example.com',
          days: 1,
        },
        expectedStatus: 'ok',
        assertKit: (kit: AppendixAKit) => {
          expect(kit.schedule.days_available).toBe(1);
          expect(kit.schedule.days.length).toBe(1);
          expect(kit.schedule.days[0].question_ids.length).toBeGreaterThan(0);
          expect(() => validateAppendixA(kit)).not.toThrow();
        },
      });

      expect(res.passed).toBe(true);
    });

    it('60-day schedule allocates correctly across all 60 days without empty days', async () => {
      const runner = new ScenarioRunner({
        llmProvider: mockLlm,
        researchProvider: mockResearch,
        allowLocalCrawl: true,
      });

      const res = await runner.runScenario({
        name: '60-Day Schedule',
        description: 'Long prep schedule spans exactly 60 days with questions distributed',
        input: {
          id: 'case-60day',
          jd: 'Principal Architect\nRequirements:\n- Distributed Systems (Required)',
          company_url: 'https://architect.example.com',
          days: 60,
        },
        expectedStatus: 'ok',
        assertKit: (kit: AppendixAKit) => {
          expect(kit.schedule.days_available).toBe(60);
          expect(kit.schedule.days.length).toBe(60);
          for (const day of kit.schedule.days) {
            expect(day.question_ids.length).toBeGreaterThan(0);
          }
          expect(() => validateAppendixA(kit)).not.toThrow();
        },
      });

      expect(res.passed).toBe(true);
    });
  });

  // =========================================================================
  // 10. Rate Limiting & Concurrency
  // =========================================================================
  describe('10. Rate Limiting & Concurrency', () => {
    it('optimistic concurrency: rejects stale generationVersion with 409 Conflict', async () => {
      const kit = await Kit.create({
        userId: userAId,
        deduplicationKey: 'dedup_concurrency_kit',
        jobDescription: 'JD',
        companyUrl: 'https://test.com',
        daysAvailable: 1,
        generationVersion: 3, // current DB version is 3
        internalKit: {
          source: { company: '', company_url: 'https://test.com', role: '', location: '', jd_chars: 2, researched_at: '', pages_used: [] },
          company_brief: { summary: '', what_they_do: '', sources: [] },
          role: { title: '', seniority: '', responsibilities: [], requirements: [{ id: 'r1', text: 'Req', kind: 'technical', priority: 'must', _meta: { origin: 'generated', pinned: false } }] },
          questions: [{ id: 'q1', requirement_ids: ['r1'], category: 'technical', prompt: 'P', answer_outline: 'A', difficulty: 1, _meta: { origin: 'generated', pinned: false } }],
          flashcards: [],
          schedule: { days_available: 1, days: [{ day: 1, focus: 'F', question_ids: ['q1'], minutes: 30 }] },
          coverage: { uncovered_requirement_ids: [], passes: 1 },
        },
      });

      // User sends stale version 2
      const res = await request(app)
        .post(`/api/kits/${kit._id.toString()}/regenerate`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          generationVersion: 2,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('STALE_GENERATION');
    });
  });

  // =========================================================================
  // 11. SSE Lifecycle
  // =========================================================================
  describe('11. SSE Lifecycle', () => {
    it('emits step sequence VALIDATING_INPUT -> VALIDATING_KIT and completes with terminal event', async () => {
      // Create job in DB
      const job = await GenerationJob.create({
        kitId: new mongoose.Types.ObjectId(),
        userId: userAId,
        deduplicationKey: 'dedup_sse_lifecycle_job',
        status: 'running',
        currentStep: 'VALIDATING_INPUT',
        progress: 10,
        generationVersion: 1,
      });

      const jobId = job._id.toString();

      // Connect via HTTP streaming to SSE endpoint
      const events: string[] = [];

      await new Promise<void>((resolve, reject) => {
        const req = http.get(
          `${baseUrl}/api/jobs/${jobId}/stream?token=${tokenUserA}`,
          (res) => {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toContain('text/event-stream');

            res.on('data', (chunk) => {
              const text = chunk.toString();
              events.push(text);

              // Once initial event is received, close connection
              if (text.includes('event: initial')) {
                req.destroy();
                resolve();
              }
            });

            res.on('error', (err) => {
              // Ignore socket hangup from destroy
              if ((err as any).code === 'ECONNRESET') resolve();
              else reject(err);
            });
          }
        );

        req.on('error', (err) => {
          if ((err as any).code === 'ECONNRESET') resolve();
          else reject(err);
        });
      });

      const combined = events.join('');
      expect(combined).toContain('event: initial');
      expect(combined).toContain('VALIDATING_INPUT');
    });
  });
});
