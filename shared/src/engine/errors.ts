/**
 * Domain-specific errors for the shared deterministic engine.
 */

export class DeterministicEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeterministicEngineError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidDaysAvailableError extends DeterministicEngineError {
  constructor(days: number) {
    super(`Invalid daysAvailable: ${days}. Must be a positive integer >= 1.`);
    this.name = 'InvalidDaysAvailableError';
  }
}

export class MissingMustHaveCoverageError extends DeterministicEngineError {
  public readonly missingRequirementIds: string[];

  constructor(missingIds: string[]) {
    super(
      `Cannot schedule: the following must-have requirements lack question coverage: [${missingIds.join(', ')}]`
    );
    this.name = 'MissingMustHaveCoverageError';
    this.missingRequirementIds = missingIds;
  }
}

export class InvalidQuestionReferenceError extends DeterministicEngineError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidQuestionReferenceError';
  }
}

export class InvalidScheduleError extends DeterministicEngineError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidScheduleError';
  }
}

export class AppendixASerializationError extends DeterministicEngineError {
  public readonly issues: unknown;

  constructor(message: string, issues?: unknown) {
    super(message);
    this.name = 'AppendixASerializationError';
    this.issues = issues;
  }
}
