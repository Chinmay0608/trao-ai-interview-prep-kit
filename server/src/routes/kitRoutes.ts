import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import {
  QuestionCategory,
  LLMProvider,
  ResearchProvider,
} from '@trao/shared';
import { requireAuth } from '../auth/authMiddleware.js';
import { validateBody, validateParams } from '../middleware/validationMiddleware.js';
import { generationRateLimiter } from '../middleware/rateLimiterMiddleware.js';
import { GenerationJobService } from '../services/jobs/jobService.js';
import { GenerationRunner } from '../services/jobs/generationRunner.js';
import { regenerationService } from '../services/regeneration/regenerationService.js';
import { Kit } from '../db/models/Kit.js';
import { toBuilderViewModel } from '../db/converters/kitConverter.js';
import { GeminiLLMProvider } from '../providers/llm/GeminiLLMProvider.js';
import { DuckDuckGoHtmlSearchProvider } from '../providers/research/DuckDuckGoHtmlSearchProvider.js';
import { DynamicCrawler } from '../services/crawler/DynamicCrawler.js';
import { PipelineOptions } from '../services/pipeline/types.js';

const router = Router();
const jobService = new GenerationJobService();
const runner = new GenerationRunner(jobService);

// Default pipeline options factory
export function createDefaultPipelineOptions(): PipelineOptions {
  const apiKey = process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || 'dev_key';
  const llmProvider: LLMProvider = new GeminiLLMProvider({ apiKey });
  const researchProvider: ResearchProvider = new DuckDuckGoHtmlSearchProvider();
  const crawler = new DynamicCrawler();

  return {
    llmProvider,
    researchProvider,
    crawler,
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

export default router;
