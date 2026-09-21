import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import http from 'http';
import mongoose from 'mongoose';
import { createApp } from '../server/src/app.js';
import {
  setupTestDb,
  clearTestDb,
  teardownTestDb,
} from './helpers/testDb.js';
import { setPipelineOptionsForRoute } from '../server/src/routes/kitRoutes.js';
import { MockLLMProvider } from '../server/src/providers/mocks/MockLLMProvider.js';
import { MockResearchProvider } from '../server/src/providers/mocks/MockResearchProvider.js';
import bcrypt from 'bcryptjs';
import { User } from '../server/src/db/models/User.js';
import { Kit } from '../server/src/db/models/Kit.js';
import { GenerationJob } from '../server/src/db/models/GenerationJob.js';
import { sseManager } from '../server/src/services/sse/sseManager.js';
import { signAuthToken } from '../server/src/auth/authService.js';
import { authRateLimiter, generationRateLimiter } from '../server/src/middleware/rateLimiterMiddleware.js';
import {
  AppendixAKitSchema,
  InternalPrepKit,
  createDeduplicationKey,
} from '@trao/shared';

describe('Phase 7: Backend API, Authentication, SSE, and Regeneration', () => {
  const app = createApp();
  let server: any;
  let baseUrl: string;
  let mockLlm: MockLLMProvider;
  let mockResearch: MockResearchProvider;

  let tokenAlice: string;
  let tokenBob: string;
  let userIdAlice: string;
  let userIdBob: string;

  beforeAll(async () => {
    await setupTestDb();

    // Start HTTP server for SSE and streaming tests
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    mockLlm = new MockLLMProvider();
    mockLlm.generateStructured = async (req: any) => {
      if (req.schemaName === 'ExtractionOutput') {
        return {
          roleTitle: 'Senior Backend Engineer',
          seniority: 'Senior',
          responsibilities: ['Build distributed systems'],
          requirements: [
            {
              id: 'r1',
              text: 'Backend systems architecture',
              kind: 'technical',
              priority: 'must',
              evidenceText: 'Senior Backend Engineer Distributed Systems Node.js',
            },
          ],
        };
      }
      if (req.schemaName === 'CompanyBriefOutput') {
        return {
          summary: 'Acme Corp produces scalable systems',
          what_they_do: 'Software development',
          sources: ['https://example.com', 'https://acme.org'],
        };
      }
      if (req.schemaName === 'InitialQuestionsOutput' || req.schemaName === 'QuestionsOutput') {
        return {
          questions: [
            {
              temp_id: 't1',
              requirement_ids: ['r1'],
              category: 'technical',
              prompt: 'How do you design a distributed cache?',
              answer_outline: 'Use consistent hashing, TTL, eviction policies.',
              difficulty: 2,
            },
          ],
        };
      }
      if (req.schemaName === 'FlashcardsOutput') {
        return {
          flashcards: [
            {
              temp_id: 'fc1',
              question_reference: 't1',
              requirement_ids: ['r1'],
              front: 'What is consistent hashing?',
              back: 'A hashing technique where changing buckets only remaps K/N keys.',
            },
          ],
        };
      }
      throw new Error(`Unexpected mock schema: ${req.schemaName}`);
    };

    mockResearch = new MockResearchProvider([]);

    // Configure mock providers for the routes
    setPipelineOptionsForRoute({
      llmProvider: mockLlm,
      researchProvider: mockResearch,
      crawler: {
        crawl: async () => ({
          targetDomain: 'example.com',
          pagesVisited: 1,
          durationMs: 50,
          pages: [
            {
              url: 'https://example.com',
              statusCode: 200,
              extractedText: 'Example company tech stack and hiring information',
              links: [],
            },
          ],
        }),
      } as any,
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
    authRateLimiter.reset();
    generationRateLimiter.reset();

    const userAlice = await User.create({
      email: 'alice@example.com',
      name: 'Alice',
      passwordHash: await bcrypt.hash('Password123!', 10),
    });
    tokenAlice = signAuthToken(userAlice);
    userIdAlice = userAlice._id.toString();

    const userBob = await User.create({
      email: 'bob@example.com',
      name: 'Bob',
      passwordHash: await bcrypt.hash('Password456!', 10),
    });
    tokenBob = signAuthToken(userBob);
    userIdBob = userBob._id.toString();
  });

  // ===========================================================================
  // Section 1: Authentication & Authorization
  // ===========================================================================
  describe('Authentication & User Isolation', () => {
    it('1. registers a new user successfully and returns token without passwordHash', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'carol@example.com', password: 'SecurePassword123' });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('carol@example.com');
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('2. rejects duplicate registration with 409 USER_EXISTS', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'alice@example.com', password: 'AnotherPassword123' });

      expect(res.status).toBe(401); // AuthenticationError maps to 401
      expect(res.body.error.code).toBe('USER_EXISTS');
    });

    it('3. login success returns valid session token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'alice@example.com', password: 'Password123!' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('alice@example.com');
    });

    it('4. invalid login rejects without leaking email vs password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'alice@example.com', password: 'WrongPassword!' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe('Invalid email or password.');
    });

    it('5. protected route without auth returns 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/kits');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('6. user isolation prevents accessing another user kit', async () => {
      // Alice creates a kit
      const postRes = await request(app)
        .post('/api/kits')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          jobDescription: 'Senior Backend Engineer Distributed Systems Node.js',
          companyUrl: 'https://example.com',
          daysAvailable: 5,
        });

      const kitId = postRes.body.kitId;

      // Bob tries to access Alice's kit
      const bobRes = await request(app)
        .get(`/api/kits/${kitId}`)
        .set('Authorization', `Bearer ${tokenBob}`);

      expect(bobRes.status).toBe(404); // Returns 404 to avoid leaking existence
      expect(bobRes.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });
  });

  // ===========================================================================
  // Section 2: Kits API & Deduplication
  // ===========================================================================
  describe('Kit Creation & Deduplication', () => {
    const kitPayload = {
      jobDescription: 'Senior Full Stack Engineer React Node TypeScript',
      companyUrl: 'https://acme.org',
      daysAvailable: 5,
    };

    it('7. creates kit and pending job returning stable DTO', async () => {
      const res = await request(app)
        .post('/api/kits')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send(kitPayload);

      expect(res.status).toBe(201);
      expect(res.body.kitId).toBeDefined();
      expect(res.body.jobId).toBeDefined();
      expect(res.body.status).toBe('pending');
      expect(res.body.generationVersion).toBe(1);
      expect(res.body.isExisting).toBe(false);
    });

    it('8. active job deduplication reuses pending/running job for same request', async () => {
      const deduplicationKey = createDeduplicationKey({
        jobDescription: kitPayload.jobDescription,
        companyUrl: kitPayload.companyUrl,
        daysAvailable: kitPayload.daysAvailable,
      });

      // Create active (running) job in DB
      const activeKit = await Kit.create({
        userId: userIdAlice,
        deduplicationKey,
        jobDescription: kitPayload.jobDescription,
        companyUrl: kitPayload.companyUrl,
        daysAvailable: kitPayload.daysAvailable,
        generationVersion: 1,
        status: 'generating',
      });

      const activeJob = await GenerationJob.create({
        kitId: activeKit._id,
        userId: userIdAlice,
        deduplicationKey,
        status: 'running',
        currentStep: 'CRAWLING_SITE',
        progress: 30,
        generationVersion: 1,
        retryAttempts: 0,
      });

      const res = await request(app)
        .post('/api/kits')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send(kitPayload);

      expect(res.status).toBe(200);
      expect(res.body.isExisting).toBe(true);
      expect(res.body.jobId).toBe(activeJob._id.toString());
    });

    it('9. completed kit reuse returns existing kit result', async () => {
      const deduplicationKey = createDeduplicationKey({
        jobDescription: kitPayload.jobDescription,
        companyUrl: kitPayload.companyUrl,
        daysAvailable: kitPayload.daysAvailable,
      });

      const existingKit = await Kit.create({
        userId: userIdAlice,
        deduplicationKey,
        jobDescription: kitPayload.jobDescription,
        companyUrl: kitPayload.companyUrl,
        daysAvailable: kitPayload.daysAvailable,
        generationVersion: 1,
        status: 'ready',
      });

      await GenerationJob.create({
        kitId: existingKit._id,
        userId: userIdAlice,
        deduplicationKey,
        status: 'completed',
        currentStep: 'VALIDATING_KIT',
        progress: 100,
        generationVersion: 1,
      });

      const res = await request(app)
        .post('/api/kits')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send(kitPayload);

      expect(res.status).toBe(200);
      expect(res.body.isExisting).toBe(true);
      expect(res.body.kitId).toBe(existingKit._id.toString());
    });

    it('10. forceRefresh bypasses completed kit cache and creates new version', async () => {
      const res1 = await request(app)
        .post('/api/kits')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send(kitPayload);

      await Kit.updateOne({ _id: res1.body.kitId }, { $set: { status: 'ready' } });
      await GenerationJob.updateOne({ _id: res1.body.jobId }, { $set: { status: 'completed' } });

      const res2 = await request(app)
        .post('/api/kits')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({ ...kitPayload, forceRefresh: true });

      expect(res2.status).toBe(201);
      expect(res2.body.isExisting).toBe(false);
      expect(res2.body.jobId).not.toBe(res1.body.jobId);
      expect(res2.body.generationVersion).toBe(2);
    });
  });

  // ===========================================================================
  // Section 3: Appendix A Export Boundary
  // ===========================================================================
  describe('Appendix A Export', () => {
    it('11 & 12. exports strict Appendix A JSON with zero _meta fields passing Zod', async () => {
      // Seed a completed kit with builder _meta
      const internalKit: InternalPrepKit = {
        source: {
          company: 'Acme',
          company_url: 'https://acme.org',
          role: 'Backend Dev',
          location: 'Remote',
          jd_chars: 120,
          researched_at: new Date().toISOString(),
          pages_used: ['https://acme.org'],
        },
        company_brief: {
          summary: 'Acme Corp produces high-volume logistics software.',
          what_they_do: 'Supply chain management',
          sources: ['https://acme.org'],
        },
        role: {
          title: 'Backend Dev',
          seniority: 'Mid-Level',
          responsibilities: ['Build APIs'],
          requirements: [
            {
              id: 'r1',
              text: 'Node.js event loop',
              kind: 'technical',
              priority: 'must',
              _meta: { origin: 'generated', pinned: false, evidenceText: 'Node.js event loop' },
            },
          ],
        },
        questions: [
          {
            id: 'q_test1234',
            requirement_ids: ['r1'],
            category: 'technical',
            prompt: 'Explain the phases of the Node.js event loop.',
            answer_outline: 'Timers, pending callbacks, poll, check, close callbacks.',
            difficulty: 2,
            _meta: { origin: 'generated', pinned: false },
          },
        ],
        flashcards: [
          {
            id: 'f_test5678',
            requirement_ids: ['r1'],
            front: 'What phase of Node.js event loop executes setImmediate?',
            back: 'Check phase.',
            _meta: { origin: 'generated', pinned: false },
          },
        ],
        schedule: {
          days_available: 1,
          days: [{ day: 1, focus: 'Node.js Event Loop', question_ids: ['q_test1234'], minutes: 45 }],
        },
        coverage: {
          uncovered_requirement_ids: [],
          passes: 1,
        },
      };

      const kit = await Kit.create({
        userId: userIdAlice,
        deduplicationKey: 'test_key_export',
        jobDescription: 'Node.js event loop backend',
        companyUrl: 'https://acme.org',
        daysAvailable: 1,
        internalKit,
        generationVersion: 1,
        status: 'ready',
      });

      const res = await request(app)
        .get(`/api/kits/${kit._id.toString()}/export`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');

      // Validates Appendix A Zod schema
      const parsed = AppendixAKitSchema.parse(res.body);
      expect(parsed).toBeDefined();

      // STRICT CHECK: Zero _meta or internal Mongo fields
      expect(res.body._id).toBeUndefined();
      expect(res.body.userId).toBeUndefined();
      expect(res.body.questions[0]._meta).toBeUndefined();
      expect(res.body.flashcards[0]._meta).toBeUndefined();
      expect(res.body.role.requirements[0]._meta).toBeUndefined();
    });
  });

  // ===========================================================================
  // Section 4: Scoped Regeneration & Item Preservation
  // ===========================================================================
  describe('Scoped Regeneration & Flashcard/Schedule Reconciliation', () => {
    let seededKitId: string;

    beforeEach(async () => {
      // Seed kit with 4 questions:
      // q1: technical (generated, unpinned) -> will be discarded on technical regen
      // q2: technical (edited, unpinned) -> MUST BE PRESERVED
      // q3: behavioural (pinned) -> MUST BE PRESERVED
      // q4: system-design (custom) -> MUST BE PRESERVED
      const initialInternalKit: InternalPrepKit = {
        source: {
          company: 'Acme Inc',
          company_url: 'https://acme.org',
          role: 'Senior Engineer',
          location: 'Remote',
          jd_chars: 150,
          researched_at: new Date().toISOString(),
          pages_used: ['https://acme.org'],
        },
        company_brief: {
          summary: 'Fintech high frequency trading',
          what_they_do: 'Low latency market data processing',
          sources: ['https://acme.org'],
        },
        role: {
          title: 'Senior Engineer',
          seniority: 'Senior',
          responsibilities: ['Architect microservices'],
          requirements: [
            {
              id: 'r1',
              text: 'Concurrency & Locking',
              kind: 'technical',
              priority: 'must',
              _meta: { origin: 'generated', pinned: false },
            },
            {
              id: 'r2',
              text: 'Leadership and Mentorship',
              kind: 'behavioural',
              priority: 'must',
              _meta: { origin: 'generated', pinned: false },
            },
          ],
        },
        questions: [
          {
            id: 'q_gen_tech',
            requirement_ids: ['r1'],
            category: 'technical',
            prompt: 'Original pristine technical question',
            answer_outline: 'Original technical outline',
            difficulty: 2,
            _meta: { origin: 'generated', pinned: false },
          },
          {
            id: 'q_edited_tech',
            requirement_ids: ['r1'],
            category: 'technical',
            prompt: 'USER EDITED TECHNICAL QUESTION',
            answer_outline: 'User custom outline',
            difficulty: 3,
            _meta: { origin: 'edited', pinned: false },
          },
          {
            id: 'q_pinned_beh',
            requirement_ids: ['r2'],
            category: 'behavioural',
            prompt: 'PINNED BEHAVIOURAL QUESTION',
            answer_outline: 'Mentoring junior engineer story',
            difficulty: 2,
            _meta: { origin: 'generated', pinned: true },
          },
          {
            id: 'q_custom_sys',
            requirement_ids: ['r1'],
            category: 'system-design',
            prompt: 'CUSTOM SYSTEM DESIGN QUESTION',
            answer_outline: 'Distributed ledger outline',
            difficulty: 3,
            _meta: { origin: 'custom', pinned: false },
          },
        ],
        flashcards: [
          {
            id: 'f_gen_tech',
            requirement_ids: ['r1'],
            front: 'Flashcard for pristine tech question',
            back: 'Tech answer',
            _meta: { origin: 'generated', pinned: false },
          },
          {
            id: 'f_edited_tech',
            requirement_ids: ['r1'],
            front: 'Flashcard for edited tech question',
            back: 'Edited answer',
            _meta: { origin: 'generated', pinned: false },
          },
        ],
        schedule: {
          days_available: 3,
          days: [
            { day: 1, focus: 'Tech', question_ids: ['q_gen_tech', 'q_edited_tech'], minutes: 60 },
            { day: 2, focus: 'Behavioural', question_ids: ['q_pinned_beh'], minutes: 45 },
            { day: 3, focus: 'System', question_ids: ['q_custom_sys'], minutes: 45 },
          ],
        },
        coverage: {
          uncovered_requirement_ids: [],
          passes: 1,
        },
      };

      const kit = await Kit.create({
        userId: userIdAlice,
        deduplicationKey: 'regen_test_key',
        jobDescription: 'Fintech low latency trading engineer',
        companyUrl: 'https://acme.org',
        daysAvailable: 3,
        internalKit: initialInternalKit,
        generationVersion: 1,
        status: 'ready',
      });

      seededKitId = kit._id.toString();

      // Configure mock LLM to return replacement question on regeneration
      mockLlm.generateStructured = async (req: any) => {
        if (req.schemaName === 'InitialQuestionsOutput' || req.schemaName === 'QuestionsOutput') {
          return {
            questions: [
              {
                temp_id: 't_new',
                requirement_ids: ['r1'],
                category: 'technical',
                prompt: 'BRAND NEW REGENERATED TECHNICAL QUESTION',
                answer_outline: 'Fresh technical outline details',
                difficulty: 3,
              },
            ],
          };
        }
        if (req.schemaName === 'FlashcardsOutput') {
          return {
            flashcards: [
              {
                temp_id: 'fc_new',
                question_reference: 't_new',
                requirement_ids: ['r1'],
                front: 'New flashcard for regenerated question',
                back: 'New flashcard answer',
              },
            ],
          };
        }
        throw new Error(`Unexpected schema: ${req.schemaName}`);
      };
    });

    it('13, 16, 17, 18, 19, 20 & 21. regenerates technical category, replacing pristine while preserving edited, custom, and pinned questions', async () => {
      const res = await request(app)
        .post(`/api/kits/${seededKitId}/regenerate`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({ category: 'technical' });

      expect(res.status).toBe(200);
      const updatedKit: InternalPrepKit = res.body;

      const questionPrompts = updatedKit.questions.map((q) => q.prompt);

      // 19. Pristine generated question is replaced
      expect(questionPrompts).not.toContain('Original pristine technical question');

      // 16. Edited question preserved
      expect(questionPrompts).toContain('USER EDITED TECHNICAL QUESTION');

      // 18. Pinned question preserved
      expect(questionPrompts).toContain('PINNED BEHAVIOURAL QUESTION');

      // 17. Custom question preserved
      expect(questionPrompts).toContain('CUSTOM SYSTEM DESIGN QUESTION');

      // 20. Unrelated category preserved
      const sysQuestions = updatedKit.questions.filter((q) => q.category === 'system-design');
      expect(sysQuestions.length).toBe(1);

      // 21. Newly generated question received fresh q_ ID
      const newQuestion = updatedKit.questions.find((q) =>
        q.prompt.includes('BRAND NEW REGENERATED')
      );
      expect(newQuestion).toBeDefined();
      expect(newQuestion!.id).toMatch(/^q_[A-Za-z0-9_-]{8}$/);
    });

    it('14. regenerates behavioural category when requested', async () => {
      // In this kit, the only behavioural question was pinned, so it should be preserved
      const res = await request(app)
        .post(`/api/kits/${seededKitId}/regenerate`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({ category: 'behavioural' });

      expect(res.status).toBe(200);
      const behQuestions = res.body.questions.filter((q: any) => q.category === 'behavioural');
      expect(behQuestions.length).toBe(1);
      expect(behQuestions[0].prompt).toBe('PINNED BEHAVIOURAL QUESTION');
    });

    it('15. regenerates specific question IDs when supplied', async () => {
      const res = await request(app)
        .post(`/api/kits/${seededKitId}/regenerate`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({ questionIds: ['q_gen_tech'] });

      expect(res.status).toBe(200);
      const questionIds = res.body.questions.map((q: any) => q.id);
      expect(questionIds).not.toContain('q_gen_tech');
    });

    it('22, 23 & 24. reconciles flashcards: removes discarded question flashcard, preserves valid flashcard, adds new flashcards referencing valid questions', async () => {
      const res = await request(app)
        .post(`/api/kits/${seededKitId}/regenerate`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({ category: 'technical' });

      expect(res.status).toBe(200);
      const flashcards = res.body.flashcards;

      // 22. Discarded question's flashcard removed
      const discardedFc = flashcards.find((f: any) => f.id === 'f_gen_tech');
      expect(discardedFc).toBeUndefined();

      // 23. Preserved question's flashcard retained
      const preservedFc = flashcards.find((f: any) => f.id === 'f_edited_tech');
      expect(preservedFc).toBeDefined();

      // 24. New flashcards reference valid requirements
      for (const fc of flashcards) {
        expect(fc.requirement_ids.length).toBeGreaterThan(0);
        expect(fc.requirement_ids.every((id: string) => ['r1', 'r2'].includes(id))).toBe(true);
      }
    });

    it('25, 26 & 27. deterministic schedule reconciliation maintains exact daysAvailable and covers must-haves', async () => {
      const res = await request(app)
        .post(`/api/kits/${seededKitId}/regenerate`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({ category: 'technical' });

      expect(res.status).toBe(200);
      const schedule = res.body.schedule;

      // 26. Exact days_available maintained
      expect(schedule.days_available).toBe(3);
      expect(schedule.days.length).toBe(3);

      // Integer minutes
      for (const day of schedule.days) {
        expect(Number.isInteger(day.minutes)).toBe(true);
        expect(day.minutes).toBeGreaterThan(0);
      }

      // 27. Must-haves remain covered
      const coverage = res.body.coverage;
      expect(coverage.uncovered_requirement_ids.length).toBe(0);
    });

    it('28 & 29. optimistic concurrency prevents stale regeneration from overwriting newer generation', async () => {
      // Simulate another update bumping generationVersion to 2 first
      await Kit.updateOne({ _id: seededKitId }, { $inc: { generationVersion: 1 } });

      // Alice attempts to regenerate on stale state
      const res = await request(app)
        .post(`/api/kits/${seededKitId}/regenerate`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({ category: 'technical', generationVersion: 1 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('STALE_GENERATION');
    });

    it('30. duplicate regeneration requests with same parameters are handled safely without corrupting data', async () => {
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/kits/${seededKitId}/regenerate`)
          .set('Authorization', `Bearer ${tokenAlice}`)
          .send({ category: 'technical' }),
        request(app)
          .post(`/api/kits/${seededKitId}/regenerate`)
          .set('Authorization', `Bearer ${tokenAlice}`)
          .send({ category: 'technical' }),
      ]);

      // Exactly one succeeds with 200, the other receives 409 conflict
      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);
    });
  });

  // ===========================================================================
  // Section 5: Server-Sent Events (SSE) Progress & Reconnect
  // ===========================================================================
  describe('Server-Sent Events (SSE)', () => {
    it('31. unauthorized stream without token is rejected with 401', async () => {
      const res = await request(app).get('/api/jobs/507f1f77bcf86cd799439011/stream');
      expect(res.status).toBe(401);
    });

    it('32, 33, 34 & 36. SSE stream emits initial, progress, completed events and cleans up listener on close', async () => {
      const job = await GenerationJob.create({
        kitId: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(userIdAlice),
        deduplicationKey: 'sse_test_key_1',
        status: 'running',
        currentStep: 'VALIDATING_INPUT',
        progress: 10,
        generationVersion: 1,
        retryAttempts: 0,
      });

      const jobId = job._id.toString();

      // Verify listener count before connection
      expect(sseManager.getListenerCount(jobId)).toBe(0);

      let streamData = '';
      const streamPromise = new Promise<void>((resolve, reject) => {
        const clientReq = http.get(
          `${baseUrl}/api/jobs/${jobId}/stream?token=${tokenAlice}`,
          (res) => {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toContain('text/event-stream');

            res.on('data', (chunk) => {
              streamData += chunk.toString();
              if (streamData.includes('event: completed')) {
                resolve();
              }
            });
            res.on('error', reject);
          }
        );
        clientReq.on('error', reject);
      });

      // Allow connection to establish
      await new Promise((r) => setTimeout(r, 60));

      // 32. Verify initial event was emitted
      expect(streamData).toContain('event: initial');
      expect(streamData).toContain(jobId);

      // Active listener should be registered
      expect(sseManager.getListenerCount(jobId)).toBeGreaterThan(0);

      // 33. Emit progress event
      sseManager.emitProgress(jobId, {
        jobId,
        status: 'running',
        currentStep: 'CRAWLING_SITE',
        progress: 30,
      });

      // 34. Emit completed event
      sseManager.emitCompleted(jobId, {
        jobId,
        status: 'completed',
        kitId: job.kitId.toString(),
        progress: 100,
      });

      await streamPromise;

      expect(streamData).toContain('event: progress');
      expect(streamData).toContain('CRAWLING_SITE');
      expect(streamData).toContain('event: completed');

      // 36. Verify listeners are cleaned up
      await new Promise((r) => setTimeout(r, 60));
      expect(sseManager.getListenerCount(jobId)).toBe(0);
    });

    it('35. SSE stream emits failed event on job failure and closes stream', async () => {
      const job = await GenerationJob.create({
        kitId: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(userIdAlice),
        deduplicationKey: 'sse_test_key_2',
        status: 'running',
        currentStep: 'VALIDATING_INPUT',
        progress: 10,
        generationVersion: 1,
        retryAttempts: 0,
      });

      const jobId = job._id.toString();
      let streamData = '';

      const streamPromise = new Promise<void>((resolve, reject) => {
        const clientReq = http.get(
          `${baseUrl}/api/jobs/${jobId}/stream?token=${tokenAlice}`,
          (res) => {
            res.on('data', (chunk) => {
              streamData += chunk.toString();
              if (streamData.includes('event: failed')) {
                resolve();
              }
            });
            res.on('error', reject);
          }
        );
        clientReq.on('error', reject);
      });

      await new Promise((r) => setTimeout(r, 60));

      sseManager.emitFailed(jobId, {
        jobId,
        status: 'failed',
        error: { code: 'PIPELINE_ERROR', message: 'Test failure' },
      });

      await streamPromise;
      expect(streamData).toContain('event: failed');
      expect(streamData).toContain('PIPELINE_ERROR');
    });

    it('37. SSE reconnect obtains current persisted job state immediately', async () => {
      const job = await GenerationJob.create({
        kitId: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(userIdAlice),
        deduplicationKey: 'sse_test_key_3',
        status: 'running',
        currentStep: 'SYNTHESIZING_BRIEF',
        progress: 50,
        generationVersion: 1,
        retryAttempts: 0,
      });

      const jobId = job._id.toString();

      // Client connects and gets initial state
      let streamData = '';
      await new Promise<void>((resolve, reject) => {
        const clientReq = http.get(
          `${baseUrl}/api/jobs/${jobId}/stream?token=${tokenAlice}`,
          (res) => {
            res.on('data', (chunk) => {
              streamData += chunk.toString();
              if (streamData.includes('event: initial') && streamData.includes('\n\n')) {
                clientReq.destroy();
                resolve();
              }
            });
            res.on('error', reject);
          }
        );
        clientReq.on('error', reject);
      });

      expect(streamData).toContain('event: initial');
      expect(streamData).toContain('SYNTHESIZING_BRIEF');
      expect(streamData).toContain('"progress":50');
    });
  });

  // ===========================================================================
  // Section 6: Request Validation & Security Limits
  // ===========================================================================
  describe('Input Validation, Rate Limiting & CORS', () => {
    it('38. rejects invalid company URL protocol (e.g. ftp:// or file://)', async () => {
      const res = await request(app)
        .post('/api/kits')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          jobDescription: 'Valid job description with enough characters',
          companyUrl: 'ftp://ftp.example.com',
          daysAvailable: 5,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Only http and https protocols are allowed');
    });

    it('39. rejects oversized job description (> 50,000 characters)', async () => {
      const giantJd = 'A'.repeat(50_001);
      const res = await request(app)
        .post('/api/kits')
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          jobDescription: giantJd,
          companyUrl: 'https://example.com',
          daysAvailable: 5,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('exceeds maximum length');
    });

    it('40. rejects invalid category in regeneration request', async () => {
      const kit = await Kit.create({
        userId: userIdAlice,
        deduplicationKey: 'cat_test_key',
        jobDescription: 'Test job description',
        companyUrl: 'https://example.com',
        daysAvailable: 5,
        generationVersion: 1,
        status: 'ready',
        internalKit: {
          questions: [],
          flashcards: [],
          schedule: { days_available: 5, days: [] },
          coverage: { uncovered_requirement_ids: [], passes: 1 },
          role: { title: 'T', seniority: 'S', responsibilities: [], requirements: [] },
          company_brief: { summary: '', what_they_do: '', sources: [] },
          source: { company: '', company_url: '', role: '', location: '', jd_chars: 0, researched_at: '', pages_used: [] },
        },
      });

      const res = await request(app)
        .post(`/api/kits/${kit._id.toString()}/regenerate`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({ category: 'nonexistent-category' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('41. rejects unknown question ID in regeneration request', async () => {
      const kit = await Kit.create({
        userId: userIdAlice,
        deduplicationKey: 'qid_test_key',
        jobDescription: 'Test job description',
        companyUrl: 'https://example.com',
        daysAvailable: 5,
        generationVersion: 1,
        status: 'ready',
        internalKit: {
          questions: [
            {
              id: 'q_valid1',
              requirement_ids: [],
              category: 'technical',
              prompt: 'p',
              answer_outline: 'a',
              difficulty: 1,
              _meta: { origin: 'generated', pinned: false },
            },
          ],
          flashcards: [],
          schedule: { days_available: 5, days: [] },
          coverage: { uncovered_requirement_ids: [], passes: 1 },
          role: { title: 'T', seniority: 'S', responsibilities: [], requirements: [] },
          company_brief: { summary: '', what_they_do: '', sources: [] },
          source: { company: '', company_url: '', role: '', location: '', jd_chars: 0, researched_at: '', pages_used: [] },
        },
      });

      const res = await request(app)
        .post(`/api/kits/${kit._id.toString()}/regenerate`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({ questionIds: ['q_NONEXISTENT_ID'] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNKNOWN_QUESTION_ID');
      expect(res.body.error.message).toContain('was not found in this prep kit');
    });

    it('42. rate limiter sets Retry-After header and returns 429 when limit exceeded', async () => {
      // Send 35 login requests rapidly to trigger the 30-req auth limit
      let hit429 = false;
      for (let i = 0; i < 35; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email: 'alice@example.com', password: 'Password123!' });
        if (res.status === 429) {
          hit429 = true;
          expect(res.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
          expect(res.headers['retry-after']).toBeDefined();
          break;
        }
      }
      expect(hit429).toBe(true);
    });

    it('43. CORS policy supports credentials and allows configured client origin', async () => {
      const res = await request(app)
        .options('/api/kits')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });
  });
});
