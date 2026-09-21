import { JobStatus } from '@trao/shared';

export class InvalidJobTransitionError extends Error {
  constructor(
    public readonly currentStatus: JobStatus,
    public readonly targetStatus: JobStatus,
    message?: string
  ) {
    super(
      message ||
        `Invalid job status transition from '${currentStatus}' to '${targetStatus}'.`
    );
    this.name = 'InvalidJobTransitionError';
  }
}

export class StaleGenerationError extends Error {
  constructor(
    public readonly kitId: string,
    public readonly expectedVersion: number,
    public readonly currentVersion?: number,
    message?: string
  ) {
    super(
      message ||
        `Optimistic concurrency conflict on Kit ${kitId}: expected generationVersion ${expectedVersion} has been superseded.`
    );
    this.name = 'StaleGenerationError';
  }
}

export class JobNotFoundError extends Error {
  constructor(public readonly jobId: string) {
    super(`Generation job '${jobId}' was not found.`);
    this.name = 'JobNotFoundError';
  }
}

export class KitNotFoundError extends Error {
  constructor(public readonly kitId: string) {
    super(`Prep kit '${kitId}' was not found.`);
    this.name = 'KitNotFoundError';
  }
}

export class UnauthorizedAccessError extends Error {
  constructor(public readonly resource: string, public readonly id: string) {
    super(`Unauthorized access to ${resource} '${id}'.`);
    this.name = 'UnauthorizedAccessError';
  }
}

export class JobClaimConflictError extends Error {
  constructor(public readonly jobId: string) {
    super(`Job '${jobId}' has already been claimed by another worker.`);
    this.name = 'JobClaimConflictError';
  }
}

export class UnknownQuestionIdError extends Error {
  constructor(public readonly questionId: string) {
    super(`Question ID '${questionId}' was not found in this prep kit.`);
    this.name = 'UnknownQuestionIdError';
  }
}
