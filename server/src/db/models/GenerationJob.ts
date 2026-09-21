import mongoose, { Document, Schema, Model } from 'mongoose';
import { JobStatus, JobStep } from '@trao/shared';

export interface IJobError {
  code: string;
  message: string;
}

export interface IGenerationJob {
  kitId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  deduplicationKey: string;
  status: JobStatus;
  currentStep: JobStep | string;
  progress: number;
  generationVersion: number;
  startedAt?: Date;
  heartbeatAt: Date;
  completedAt?: Date;
  retryAttempts: number;
  error?: IJobError;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGenerationJobDoc extends IGenerationJob, Document {
  _id: mongoose.Types.ObjectId;
}

const JobErrorSchema = new Schema<IJobError>(
  {
    code: { type: String, required: true },
    message: { type: String, required: true },
  },
  { _id: false }
);

const GenerationJobSchema = new Schema<IGenerationJobDoc>(
  {
    kitId: {
      type: Schema.Types.ObjectId,
      ref: 'Kit',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    deduplicationKey: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
      default: 'pending',
      required: true,
      index: true,
    },
    currentStep: {
      type: String,
      default: 'VALIDATING_INPUT',
      required: true,
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      required: true,
    },
    generationVersion: {
      type: Number,
      default: 1,
      min: 1,
      required: true,
    },
    startedAt: {
      type: Date,
    },
    heartbeatAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    completedAt: {
      type: Date,
    },
    retryAttempts: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
    },
    error: {
      type: JobErrorSchema,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes:
// 1. { kitId: 1, createdAt: -1 } — Job history for a kit ordered by latest.
GenerationJobSchema.index({ kitId: 1, createdAt: -1 });

// 2. { status: 1, heartbeatAt: 1 } — Essential for stale job recovery worker finding stalled running jobs.
GenerationJobSchema.index({ status: 1, heartbeatAt: 1 });

// 3. { userId: 1, createdAt: -1 } — Fast retrieval of user generation jobs.
GenerationJobSchema.index({ userId: 1, createdAt: -1 });

// 4. { deduplicationKey: 1, status: 1 } — Deduplication check for active in-progress jobs.
GenerationJobSchema.index({ deduplicationKey: 1, status: 1 });

// 5. { userId: 1, deduplicationKey: 1, status: 1 } — Scoped active generation check.
GenerationJobSchema.index({ userId: 1, deduplicationKey: 1, status: 1 });

export const GenerationJob: Model<IGenerationJobDoc> =
  mongoose.models.GenerationJob ||
  mongoose.model<IGenerationJobDoc>('GenerationJob', GenerationJobSchema);
