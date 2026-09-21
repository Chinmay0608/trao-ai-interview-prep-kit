import {
  AppendixAKit,
  InternalPrepKit,
  BuilderViewModel,
  GenerationJobInfo,
  serializeToAppendixA,
} from '@trao/shared';
import { IKitDoc } from '../models/Kit.js';
import { IGenerationJobDoc } from '../models/GenerationJob.js';

/**
 * Extracts and validates the InternalPrepKit from a MongoDB Kit document.
 */
export function toInternalPrepKit(kitDoc: IKitDoc): InternalPrepKit {
  if (!kitDoc.internalKit) {
    throw new Error(`Kit ${kitDoc._id.toString()} has no internal prep kit generated yet.`);
  }
  return kitDoc.internalKit;
}

/**
 * Transforms a MongoDB Kit document into a client-facing BuilderViewModel.
 * Never leaks internal Mongoose methods, buffers, or connection states.
 */
export function toBuilderViewModel(
  kitDoc: IKitDoc,
  activeJobId?: string
): BuilderViewModel {
  const internalKit = kitDoc.internalKit;

  return {
    id: kitDoc._id.toString(),
    userId: kitDoc.userId.toString(),
    generationVersion: kitDoc.generationVersion,
    activeJobId,
    createdAt: kitDoc.createdAt.toISOString(),
    updatedAt: kitDoc.updatedAt.toISOString(),
    source: internalKit?.source || {
      company: '',
      company_url: kitDoc.companyUrl,
      role: '',
      location: '',
      jd_chars: kitDoc.jobDescription.length,
      researched_at: kitDoc.createdAt.toISOString(),
      pages_used: [],
    },
    company_brief: internalKit?.company_brief || {
      summary: '',
      what_they_do: '',
      sources: [],
    },
    role: internalKit?.role || {
      title: '',
      seniority: '',
      responsibilities: [],
      requirements: [],
    },
    questions: internalKit?.questions || [],
    flashcards: internalKit?.flashcards || [],
    schedule: internalKit?.schedule || {
      days_available: kitDoc.daysAvailable,
      days: [],
    },
    coverage: internalKit?.coverage || {
      uncovered_requirement_ids: [],
      passes: 0,
    },
  };
}

/**
 * Converts a MongoDB Kit document to a strict Appendix A kit.
 * GUARANTEE: Zero internal fields (_meta, Mongo IDs) escape this boundary.
 */
export function toAppendixAKit(kitDoc: IKitDoc): AppendixAKit {
  const internalKit = toInternalPrepKit(kitDoc);
  return serializeToAppendixA(internalKit);
}

/**
 * Converts a MongoDB GenerationJob document into a clean DTO.
 */
export function toGenerationJobInfo(jobDoc: IGenerationJobDoc): GenerationJobInfo {
  return {
    id: jobDoc._id.toString(),
    kitId: jobDoc.kitId.toString(),
    userId: jobDoc.userId.toString(),
    status: jobDoc.status,
    currentStep: jobDoc.currentStep as any,
    progress: jobDoc.progress,
    generationVersion: jobDoc.generationVersion,
    startedAt: jobDoc.startedAt ? jobDoc.startedAt.toISOString() : jobDoc.createdAt.toISOString(),
    updatedAt: jobDoc.updatedAt.toISOString(),
    heartbeatAt: jobDoc.heartbeatAt.toISOString(),
    completedAt: jobDoc.completedAt ? jobDoc.completedAt.toISOString() : undefined,
    retryAttempts: jobDoc.retryAttempts,
    error: jobDoc.error
      ? {
          code: jobDoc.error.code,
          message: jobDoc.error.message,
        }
      : undefined,
  };
}
