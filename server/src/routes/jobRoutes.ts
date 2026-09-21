import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/authMiddleware.js';
import { validateParams } from '../middleware/validationMiddleware.js';
import { GenerationJobService } from '../services/jobs/jobService.js';
import { sseManager } from '../services/sse/sseManager.js';

const router = Router();
const jobService = new GenerationJobService();

const JobParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid job ID format'),
});

/**
 * GET /api/jobs/:id
 * Retrieves generation job status DTO with user authorization.
 */
router.get(
  '/:id',
  requireAuth,
  validateParams(JobParamsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = req.params.id as string;
      const jobInfo = await jobService.getGenerationJob(jobId, req.user!.id);
      res.status(200).json(jobInfo);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/jobs/:id/stream
 * Server-Sent Events stream for real-time job progress tracking.
 */
router.get(
  '/:id/stream',
  requireAuth,
  validateParams(JobParamsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = req.params.id as string;
      // 1. Authorize user ownership before establishing SSE connection
      const jobInfo = await jobService.getGenerationJob(jobId, req.user!.id);

      // 2. Delegate stream handling and keepalive to SSEManager
      sseManager.subscribe(jobId, jobInfo, req, res);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
