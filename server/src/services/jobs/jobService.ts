import mongoose from 'mongoose';
import {
  AppendixAKit,
  BuilderViewModel,
  GenerationJobInfo,
  createDeduplicationKey,
} from '@trao/shared';
import { Kit, IKitDoc } from '../../db/models/Kit.js';
import { GenerationJob, IGenerationJobDoc } from '../../db/models/GenerationJob.js';
import {
  toBuilderViewModel,
  toAppendixAKit,
  toGenerationJobInfo,
} from '../../db/converters/kitConverter.js';
import {
  JobNotFoundError,
  KitNotFoundError,
  UnauthorizedAccessError,
} from './errors.js';

export interface CreateJobInput {
  userId: string;
  jobDescription: string;
  companyUrl: string;
  daysAvailable: number;
  forceRefresh?: boolean;
}

export interface CreateJobResult {
  job: GenerationJobInfo;
  kitId: string;
  isExisting: boolean;
}

export class GenerationJobService {
  /**
   * Creates or attaches to a GenerationJob using deterministic deduplication.
   */
  public async createGenerationJob(input: CreateJobInput): Promise<CreateJobResult> {
    const { userId, jobDescription, companyUrl, daysAvailable, forceRefresh } = input;

    if (!jobDescription || jobDescription.trim().length === 0) {
      throw new Error('jobDescription must not be empty.');
    }
    if (!companyUrl || companyUrl.trim().length === 0) {
      throw new Error('companyUrl must not be empty.');
    }
    if (!daysAvailable || daysAvailable < 1) {
      throw new Error('daysAvailable must be at least 1.');
    }

    const cleanJd = jobDescription.trim();
    const cleanUrl = companyUrl.trim();
    const deduplicationKey = createDeduplicationKey({
      jobDescription: cleanJd,
      companyUrl: cleanUrl,
      daysAvailable,
    });
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // =========================================================================
    // Deduplication Handling
    // =========================================================================
    if (!forceRefresh) {
      // 1. Check for active in-progress job (pending or running)
      const activeJob = await GenerationJob.findOne({
        userId: userObjectId,
        deduplicationKey,
        status: { $in: ['pending', 'running'] },
      }).sort({ createdAt: -1 });

      if (activeJob) {
        return {
          job: toGenerationJobInfo(activeJob),
          kitId: activeJob.kitId.toString(),
          isExisting: true,
        };
      }

      // 2. Check for existing completed kit
      const existingKit = await Kit.findOne({
        userId: userObjectId,
        deduplicationKey,
        status: 'ready',
      }).sort({ generationVersion: -1 });

      if (existingKit) {
        // Return existing completed job for this kit if present, or synthesis
        const lastJob = await GenerationJob.findOne({
          kitId: existingKit._id,
          status: 'completed',
        }).sort({ createdAt: -1 });

        if (lastJob) {
          return {
            job: toGenerationJobInfo(lastJob),
            kitId: existingKit._id.toString(),
            isExisting: true,
          };
        }
      }
    }

    // =========================================================================
    // Force Refresh or New Generation
    // =========================================================================
    let kit = await Kit.findOne({
      userId: userObjectId,
      deduplicationKey,
    }).sort({ generationVersion: -1 });

    let nextVersion = 1;

    if (kit) {
      nextVersion = kit.generationVersion + 1;
      kit.generationVersion = nextVersion;
      kit.status = 'generating';
      kit.updatedAt = new Date();
      await kit.save();
    } else {
      kit = await Kit.create({
        userId: userObjectId,
        deduplicationKey,
        jobDescription: cleanJd,
        companyUrl: cleanUrl,
        daysAvailable,
        internalKit: null,
        generationVersion: 1,
        status: 'generating',
      });
      nextVersion = 1;
    }

    const job = await GenerationJob.create({
      kitId: kit._id,
      userId: userObjectId,
      deduplicationKey,
      status: 'pending',
      currentStep: 'VALIDATING_INPUT',
      progress: 0,
      generationVersion: nextVersion,
      retryAttempts: 0,
      heartbeatAt: new Date(),
    });

    return {
      job: toGenerationJobInfo(job),
      kitId: kit._id.toString(),
      isExisting: false,
    };
  }

  /**
   * Retrieves a generation job ensuring user isolation.
   */
  public async getGenerationJob(
    jobId: string,
    userId: string
  ): Promise<GenerationJobInfo> {
    if (!mongoose.Types.ObjectId.isValid(jobId)) {
      throw new JobNotFoundError(jobId);
    }

    const job = await GenerationJob.findById(jobId);
    if (!job) {
      throw new JobNotFoundError(jobId);
    }

    if (job.userId.toString() !== userId) {
      throw new UnauthorizedAccessError('GenerationJob', jobId);
    }

    return toGenerationJobInfo(job);
  }

  /**
   * Retrieves a prep kit BuilderViewModel ensuring user isolation.
   */
  public async getKit(kitId: string, userId: string): Promise<BuilderViewModel> {
    if (!mongoose.Types.ObjectId.isValid(kitId)) {
      throw new KitNotFoundError(kitId);
    }

    const kit = await Kit.findById(kitId);
    if (!kit) {
      throw new KitNotFoundError(kitId);
    }

    if (kit.userId.toString() !== userId) {
      throw new UnauthorizedAccessError('Kit', kitId);
    }

    const activeJob = await GenerationJob.findOne({
      kitId: kit._id,
      status: { $in: ['pending', 'running'] },
    }).sort({ createdAt: -1 });

    return toBuilderViewModel(kit, activeJob?._id.toString());
  }

  /**
   * Retrieves strict Appendix A representation ensuring user isolation.
   */
  public async getKitAppendixA(
    kitId: string,
    userId: string
  ): Promise<AppendixAKit> {
    if (!mongoose.Types.ObjectId.isValid(kitId)) {
      throw new KitNotFoundError(kitId);
    }

    const kit = await Kit.findById(kitId);
    if (!kit) {
      throw new KitNotFoundError(kitId);
    }

    if (kit.userId.toString() !== userId) {
      throw new UnauthorizedAccessError('Kit', kitId);
    }

    return toAppendixAKit(kit);
  }

  /**
   * Updates job progress and refreshes heartbeat.
   */
  public async updateJobProgress(
    jobId: string,
    step: string,
    progress: number
  ): Promise<void> {
    await GenerationJob.updateOne(
      { _id: new mongoose.Types.ObjectId(jobId), status: 'running' },
      {
        $set: {
          currentStep: step,
          progress: Math.min(100, Math.max(0, progress)),
          heartbeatAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );
  }

  /**
   * Refreshes heartbeatAt timestamp for an active running job.
   */
  public async touchJobHeartbeat(jobId: string): Promise<void> {
    await GenerationJob.updateOne(
      { _id: new mongoose.Types.ObjectId(jobId), status: 'running' },
      {
        $set: {
          heartbeatAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );
  }
}
