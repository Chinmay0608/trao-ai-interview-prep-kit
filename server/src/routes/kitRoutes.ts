import path from 'path';
import dotenv from 'dotenv';
import { Router, Request, Response, NextFunction } from 'express';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
import { z } from 'zod';
import mongoose from 'mongoose';
import {
  QuestionCategory,
  LLMProvider,
  ResearchProvider,
  calculateCoverage,
  generateQuestionId,
  InternalQuestion,
} from '@trao/shared';
import { requireAuth } from '../auth/authMiddleware.js';
import { validateBody, validateParams } from '../middleware/validationMiddleware.js';
import { generationRateLimiter } from '../middleware/rateLimiterMiddleware.js';
import { GenerationJobService } from '../services/jobs/jobService.js';
import { GenerationRunner } from '../services/jobs/generationRunner.js';
import { regenerationService } from '../services/regeneration/regenerationService.js';
import { KitNotFoundError, UnknownQuestionIdError } from '../services/jobs/errors.js';
import { Kit } from '../db/models/Kit.js';
import { toBuilderViewModel } from '../db/converters/kitConverter.js';
import { GeminiLLMProvider } from '../providers/llm/GeminiLLMProvider.js';
import { GroqLLMProvider } from '../providers/llm/GroqLLMProvider.js';
import { DuckDuckGoHtmlSearchProvider } from '../providers/research/DuckDuckGoHtmlSearchProvider.js';
import { DynamicCrawler } from '../services/crawler/DynamicCrawler.js';
import { PipelineOptions } from '../services/pipeline/types.js';

import { createDevMockLLMProvider } from '../providers/mocks/createDevMockLLMProvider.js';

const router = Router();
const jobService = new GenerationJobService();
const runner = new GenerationRunner(jobService);

function isValidApiKey(key?: string): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  if (
    trimmed === '' ||
    trimmed === 'dev_key' ||
    trimmed === 'your_gemini_api_key_here' ||
    trimmed.startsWith('your_') ||
    trimmed.length < 15
  ) {
    return false;
  }
  return true;
}

// Cache singleton LLMProvider so concurrent requests share the exact same rate limiter
let cachedLLMProvider: LLMProvider | null = null;
let cachedLLMProviderKey = '';

// Default pipeline options factory
export function createDefaultPipelineOptions(): PipelineOptions {
  const groqKey = process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_2;
  const geminiKey = process.env.LLM_API_KEY || process.env.GEMINI_API_KEY;
  const providerType = (process.env.LLM_PROVIDER || '').trim().toLowerCase();

  const isGroqValid = isValidApiKey(groqKey);
  const isGeminiValid = isValidApiKey(geminiKey);

  const isProd = process.env.NODE_ENV === 'production';
  // Strict production security: ALLOW_LOCAL_CRAWL is NEVER permitted in production
  let allowLocalCrawl = !isProd && process.env.ALLOW_LOCAL_CRAWL === 'true';
  const cacheKey = `${providerType}:${groqKey || ''}:${geminiKey || ''}:${process.env.GROQ_MODEL || ''}:${process.env.LLM_MODEL || ''}`;

  if (!cachedLLMProvider || cachedLLMProviderKey !== cacheKey) {
    if (providerType === 'groq' || (isGroqValid && !isGeminiValid)) {
      if (isGroqValid) {
        console.log('[server] Initialized Groq LLM provider.');
        const model =
          process.env.GROQ_MODEL ||
          (process.env.LLM_MODEL && !process.env.LLM_MODEL.includes('gemini')
            ? process.env.LLM_MODEL
            : 'openai/gpt-oss-120b');
        cachedLLMProvider = new GroqLLMProvider({ apiKey: groqKey!.trim(), defaultModel: model });
      } else {
        if (isProd) {
          throw new Error('[server] Fatal: GROQ_API_KEY is required in production mode when LLM_PROVIDER=groq.');
        }
        console.log('[server] Groq provider requested but no valid GROQ_API_KEY found. Running with smart mock provider.');
        cachedLLMProvider = createDevMockLLMProvider();
      }
    } else if (isGeminiValid) {
      console.log('[server] Initialized Gemini LLM provider.');
      cachedLLMProvider = new GeminiLLMProvider({ apiKey: geminiKey!.trim(), defaultModel: process.env.LLM_MODEL });
    } else if (isGroqValid) {
      console.log('[server] Initialized Groq LLM provider.');
      const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
      cachedLLMProvider = new GroqLLMProvider({ apiKey: groqKey!.trim(), defaultModel: model });
    } else {
      if (isProd) {
        throw new Error(
          '[server] Fatal: No valid LLM API key configured in production mode. Please set GROQ_API_KEY or GEMINI_API_KEY.'
        );
      }
      console.log('[server] No valid LLM API key configured. Running with smart development LLM mock provider.');
      cachedLLMProvider = createDevMockLLMProvider();
    }
    cachedLLMProviderKey = cacheKey;
  }

  const llmProvider = cachedLLMProvider;
  const researchProvider: ResearchProvider = new DuckDuckGoHtmlSearchProvider();
  const crawler = new DynamicCrawler();

  return {
    llmProvider,
    researchProvider,
    crawler,
    allowLocalCrawl,
  };
}

let activePipelineOptions: PipelineOptions = createDefaultPipelineOptions();

/**
 * Allows test suites or custom runners to inject mock pipeline options.
 */
export function setPipelineOptionsForRoute(options: PipelineOptions): void {
  activePipelineOptions = options;
}

const CreateKitSchema = z.object({
  jobDescription: z
    .string()
    .min(10, 'Job description must be at least 10 characters')
    .max(50_000, 'Job description exceeds maximum length of 50,000 characters'),
  companyUrl: z
    .string()
    .url('Company URL must be a valid HTTP or HTTPS URL')
    .max(500, 'Company URL exceeds 500 characters')
    .refine(
      (url) => url.startsWith('http://') || url.startsWith('https://'),
      'Only http and https protocols are allowed'
    ),
  daysAvailable: z
    .number()
    .int('daysAvailable must be an integer')
    .min(1, 'daysAvailable must be at least 1')
    .max(60, 'daysAvailable cannot exceed 60 days'),
  forceRefresh: z.boolean().optional(),
});

const KitParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid kit ID format'),
});

const RegenerateKitSchema = z.object({
  category: z
    .enum(['technical', 'behavioural', 'system-design', 'company-fit'] as const)
    .optional(),
  questionIds: z.array(z.string().min(1)).optional(),
  generationVersion: z.number().int().min(1).optional(),
  forceRefresh: z.boolean().optional(),
});

/**
 * POST /api/kits
 * Creates or reuses an interview prep kit generation job.
 */
router.post(
  '/',
  requireAuth,
  generationRateLimiter,
  validateBody(CreateKitSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await jobService.createGenerationJob({
        userId: req.user!.id,
        jobDescription: req.body.jobDescription,
        companyUrl: req.body.companyUrl,
        daysAvailable: req.body.daysAvailable,
        forceRefresh: req.body.forceRefresh,
      });

      // If a brand new job was created, launch the runner asynchronously
      if (!result.isExisting) {
        runner.runJob(result.job.id, activePipelineOptions).catch((_err) => {
          // Errors are recorded directly on the GenerationJob in database
        });
      }

      res.status(result.isExisting ? 200 : 201).json({
        kitId: result.kitId,
        jobId: result.job.id,
        status: result.job.status,
        generationVersion: result.job.generationVersion,
        isExisting: result.isExisting,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/kits
 * Lists all prep kits owned by the authenticated user.
 */
router.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kits = await Kit.find({
        userId: new mongoose.Types.ObjectId(req.user!.id),
      }).sort({ updatedAt: -1 });

      const viewModels = kits.map((kit) => toBuilderViewModel(kit));
      res.status(200).json(viewModels);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/kits/:id
 * Retrieves the full BuilderViewModel for editing in the kit builder UI.
 */
router.get(
  '/:id',
  requireAuth,
  validateParams(KitParamsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kitId = req.params.id as string;
      const kit = await jobService.getKit(kitId, req.user!.id);
      res.status(200).json(kit);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/kits/:id/export
 * Exports strict Appendix A JSON (ZERO builder metadata or internal fields).
 */
router.get(
  '/:id/export',
  requireAuth,
  validateParams(KitParamsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kitId = req.params.id as string;
      const appendixA = await jobService.getKitAppendixA(kitId, req.user!.id);
      res.setHeader('Content-Type', 'application/json');
      res.status(200).json(appendixA);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/kits/:id/regenerate
 * Scoped category or question regeneration preserving edits, custom items, and pins.
 */
router.post(
  '/:id/regenerate',
  requireAuth,
  generationRateLimiter,
  validateParams(KitParamsSchema),
  validateBody(RegenerateKitSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kitId = req.params.id as string;
      const updatedKit = await regenerationService.regenerate({
        kitId,
        userId: req.user!.id,
        category: req.body.category as QuestionCategory,
        questionIds: req.body.questionIds,
        generationVersion: req.body.generationVersion,
        forceRefresh: req.body.forceRefresh,
        llmProvider: activePipelineOptions.llmProvider,
      });

      res.status(200).json(updatedKit);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/kits/:id/questions/:questionId
 * Updates question fields and flags question origin as 'edited'.
 */
router.patch(
  '/:id/questions/:questionId',
  requireAuth,
  validateParams(KitParamsSchema.extend({ questionId: z.string().min(1) })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kitId = req.params.id as string;
      const questionId = req.params.questionId as string;

      const kit = await Kit.findOne({
        _id: new mongoose.Types.ObjectId(kitId),
        userId: new mongoose.Types.ObjectId(req.user!.id),
      });

      if (!kit || !kit.internalKit) {
        throw new KitNotFoundError(kitId);
      }

      const qIndex = kit.internalKit.questions.findIndex((q) => q.id === questionId);
      if (qIndex === -1) {
        throw new UnknownQuestionIdError(questionId);
      }

      const existingQ = kit.internalKit.questions[qIndex];
      const { prompt, answer_outline, category, difficulty, requirement_ids } = req.body;

      const clampedDifficulty = (
        typeof difficulty === 'number' && [1, 2, 3].includes(difficulty) ? difficulty : existingQ.difficulty
      ) as 1 | 2 | 3;

      kit.internalKit.questions[qIndex] = {
        ...existingQ,
        prompt: typeof prompt === 'string' ? prompt : existingQ.prompt,
        answer_outline: typeof answer_outline === 'string' ? answer_outline : existingQ.answer_outline,
        category: category || existingQ.category,
        difficulty: clampedDifficulty,
        requirement_ids: Array.isArray(requirement_ids) ? requirement_ids : existingQ.requirement_ids,
        _meta: {
          ...existingQ._meta,
          origin: existingQ._meta.origin === 'custom' ? 'custom' : 'edited',
        },
      };

      const coverageResult = calculateCoverage(
        kit.internalKit.questions,
        kit.internalKit.role.requirements
      );
      kit.internalKit.coverage = coverageResult.toAppendixACoverage(kit.internalKit.coverage.passes);

      kit.markModified('internalKit');
      await kit.save();

      res.status(200).json(toBuilderViewModel(kit));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/kits/:id/questions/:questionId/pin
 * Toggles the pinned flag for a question.
 */
router.patch(
  '/:id/questions/:questionId/pin',
  requireAuth,
  validateParams(KitParamsSchema.extend({ questionId: z.string().min(1) })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kitId = req.params.id as string;
      const questionId = req.params.questionId as string;

      const kit = await Kit.findOne({
        _id: new mongoose.Types.ObjectId(kitId),
        userId: new mongoose.Types.ObjectId(req.user!.id),
      });

      if (!kit || !kit.internalKit) {
        throw new KitNotFoundError(kitId);
      }

      const qIndex = kit.internalKit.questions.findIndex((q) => q.id === questionId);
      if (qIndex === -1) {
        throw new UnknownQuestionIdError(questionId);
      }

      kit.internalKit.questions[qIndex]._meta.pinned = Boolean(req.body.pinned);
      kit.markModified('internalKit');
      await kit.save();

      res.status(200).json(toBuilderViewModel(kit));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/kits/:id/questions
 * Appends a custom user-created question with stable question ID.
 */
router.post(
  '/:id/questions',
  requireAuth,
  validateParams(KitParamsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kitId = req.params.id as string;
      const kit = await Kit.findOne({
        _id: new mongoose.Types.ObjectId(kitId),
        userId: new mongoose.Types.ObjectId(req.user!.id),
      });

      if (!kit || !kit.internalKit) {
        throw new KitNotFoundError(kitId);
      }

      const { prompt, answer_outline, category, difficulty, requirement_ids } = req.body;
      if (!prompt || !category) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Prompt and category are required.' },
        });
      }

      const newQ: InternalQuestion = {
        id: generateQuestionId(),
        requirement_ids: Array.isArray(requirement_ids) ? requirement_ids : [],
        category,
        prompt,
        answer_outline: answer_outline || '',
        difficulty: ([1, 2, 3].includes(Number(difficulty)) ? Number(difficulty) : 2) as 1 | 2 | 3,
        _meta: {
          origin: 'custom',
          pinned: false,
        },
      };

      kit.internalKit.questions.push(newQ);
      const addCoverageResult = calculateCoverage(
        kit.internalKit.questions,
        kit.internalKit.role.requirements
      );
      kit.internalKit.coverage = addCoverageResult.toAppendixACoverage(kit.internalKit.coverage.passes);

      kit.markModified('internalKit');
      await kit.save();

      res.status(201).json(toBuilderViewModel(kit));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/kits/:id/questions/:questionId
 * Deletes a question and cleans up associated references.
 */
router.delete(
  '/:id/questions/:questionId',
  requireAuth,
  validateParams(KitParamsSchema.extend({ questionId: z.string().min(1) })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const kitId = req.params.id as string;
      const questionId = req.params.questionId as string;

      const kit = await Kit.findOne({
        _id: new mongoose.Types.ObjectId(kitId),
        userId: new mongoose.Types.ObjectId(req.user!.id),
      });

      if (!kit || !kit.internalKit) {
        throw new KitNotFoundError(kitId);
      }

      kit.internalKit.questions = kit.internalKit.questions.filter((q) => q.id !== questionId);
      for (const day of kit.internalKit.schedule.days) {
        day.question_ids = day.question_ids.filter((id) => id !== questionId);
      }
      kit.internalKit.flashcards = kit.internalKit.flashcards.filter((f) => {
        const qRef = (f as any).question_id || (f as any).question_reference;
        return qRef !== questionId;
      });

      const delCoverageResult = calculateCoverage(
        kit.internalKit.questions,
        kit.internalKit.role.requirements
      );
      kit.internalKit.coverage = delCoverageResult.toAppendixACoverage(kit.internalKit.coverage.passes);

      kit.markModified('internalKit');
      await kit.save();

      res.status(200).json(toBuilderViewModel(kit));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
