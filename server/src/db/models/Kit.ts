import mongoose, { Document, Schema, Model } from 'mongoose';
import { InternalPrepKit } from '@trao/shared';

export type KitStatus = 'generating' | 'ready' | 'failed';

export interface IKit {
  userId: mongoose.Types.ObjectId;
  deduplicationKey: string;
  jobDescription: string;
  companyUrl: string;
  daysAvailable: number;
  internalKit: InternalPrepKit | null;
  generationVersion: number;
  status: KitStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IKitDoc extends IKit, Document {
  _id: mongoose.Types.ObjectId;
}

const KitSchema = new Schema<IKitDoc>(
  {
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
    jobDescription: {
      type: String,
      required: true,
    },
    companyUrl: {
      type: String,
      required: true,
    },
    daysAvailable: {
      type: Number,
      required: true,
      min: 1,
    },
    internalKit: {
      type: Schema.Types.Mixed,
      default: null,
    },
    generationVersion: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    status: {
      type: String,
      enum: ['generating', 'ready', 'failed'],
      default: 'generating',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes:
// 1. { userId: 1, updatedAt: -1 } — Rapid dashboard queries retrieving kits owned by user sorted by recency.
KitSchema.index({ userId: 1, updatedAt: -1 });

// 2. { deduplicationKey: 1, generationVersion: -1 } — Fast lookup of existing generations for caching and deduplication.
KitSchema.index({ deduplicationKey: 1, generationVersion: -1 });

// 3. { userId: 1, deduplicationKey: 1 } — Deduplication check scoped to user.
KitSchema.index({ userId: 1, deduplicationKey: 1 });

export const Kit: Model<IKitDoc> =
  mongoose.models.Kit || mongoose.model<IKitDoc>('Kit', KitSchema);
