import mongoose from 'mongoose';
import {
  PipelineOptions,
  PipelineResult,
  PipelineStepProgress,
  runPrepKitPipeline,
} from '../pipeline/index.js';
import { Kit } from '../../db/models/Kit.js';
import { GenerationJob, IGenerationJobDoc } from '../../db/models/GenerationJob.js';
import { GenerationJobService } from './jobService.js';
import { sanitizeErrorMessage } from './sanitizer.js';
import {
  JobClaimConflictError,
  KitNotFoundError,
  StaleGenerationError,
} from './errors.js';

export class GenerationRunner {
  constructor(
    private jobService: GenerationJobService = new GenerationJobService()
  ) {}

  /**
   * Atomically claims a pending GenerationJob.
   * Guarantees that only one worker can transition a job to 'running'.
   */
  public async claimJob(jobId: string): Promise<IGenerationJobDoc | null> {
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      return null;
    }

    const jobObjectId = new mongoose.Types.ObjectId(jobId);

    return GenerationJob.findOneAndUpdate(
      { _id: jobObjectId, status: 'pending' },
      {
        $set: {
          status: 'running',
          startedAt: new Date(),
          heartbeatAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { new: true }
    );
  }

  /**
   * Runs the generation pipeline for a claimed job with heartbeat tracking,
   * step progress reporting, and optimistic concurrency on final save.
   */
  public async runJob(
    jobId: string,
    pipelineOptions: PipelineOptions
  ): Promise<PipelineResult> {
    // 1. Atomically claim the job
    const job = await this.claimJob(jobId);
    if (!job) {
      throw new JobClaimConflictError(jobId);
    }

    // 2. Fetch kit inputs
    const kit = await Kit.findById(job.kitId);
    if (!kit) {
      throw new KitNotFoundError(job.kitId.toString());
    }

    // 3. Start background heartbeat interval (refreshed every 15s to beat 90s stale timeout)
    let heartbeatTimer: NodeJS.Timeout | null = setInterval(async () => {
      try {
        await this.jobService.touchJobHeartbeat(jobId);
      } catch {
        // Suppress errors during background heartbeat update
      }
    }, 15_000);

    const cleanupHeartbeat = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    try {
      // 4. Step progress callback linking pipeline steps to job progress
      const onProgress = async (stepProgress: PipelineStepProgress) => {
        const pct = Math.round(
          (stepProgress.stepIndex / stepProgress.totalSteps) * 100
        );
        await this.jobService.updateJobProgress(
          jobId,
          stepProgress.step,
          pct
        );
      };

      // 5. Execute headless Phase 5 pipeline
      const result = await runPrepKitPipeline(
        {
          jobDescription: kit.jobDescription,
          companyUrl: kit.companyUrl,
          daysAvailable: kit.daysAvailable,
        },
        {
          ...pipelineOptions,
          onStepProgress: onProgress,
        }
      );

      // Clean up heartbeat before final persistence
      cleanupHeartbeat();

      // 6. Optimistic Concurrency Check on Kit Save
      // Atomically verify generationVersion matches expectedVersion
      const updatedKit = await Kit.findOneAndUpdate(
        {
          _id: kit._id,
          generationVersion: job.generationVersion,
        },
        {
          $set: {
            internalKit: result.internalKit,
            status: 'ready',
            updatedAt: new Date(),
          },
          $inc: {
            generationVersion: 1,
          },
        },
        { new: true }
      );

      if (!updatedKit) {
        // Concurrency conflict: Kit was updated by another generation
        const currentKit = await Kit.findById(kit._id);
        const staleError = new StaleGenerationError(
          kit._id.toString(),
          job.generationVersion,
          currentKit?.generationVersion
        );

        await GenerationJob.updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'failed',
              completedAt: new Date(),
              updatedAt: new Date(),
              error: {
                code: 'STALE_GENERATION',
                message: staleError.message,
              },
            },
          }
        );

        throw staleError;
      }

      // 7. Atomically mark job completed
      await GenerationJob.updateOne(
        { _id: job._id, status: 'running' },
        {
          $set: {
            status: 'completed',
            progress: 100,
            completedAt: new Date(),
            updatedAt: new Date(),
          },
        }
      );

      return result;
    } catch (err: any) {
      cleanupHeartbeat();

      if (err instanceof StaleGenerationError) {
        throw err;
      }

      const sanitizedMessage = sanitizeErrorMessage(err.message || String(err));
      const errorCode = err.code || err.name || 'PIPELINE_ERROR';

      // Persist sanitized failure to job
      await GenerationJob.updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'failed',
            completedAt: new Date(),
            updatedAt: new Date(),
            error: {
              code: errorCode,
              message: sanitizedMessage,
            },
          },
        }
      );

      // Mark kit as failed if it was currently generating under this version
      await Kit.updateOne(
        { _id: kit._id, generationVersion: job.generationVersion, status: 'generating' },
        {
          $set: {
            status: 'failed',
            updatedAt: new Date(),
          },
        }
      );

      throw err;
    }
  }
}
