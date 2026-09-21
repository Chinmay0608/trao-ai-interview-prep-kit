import { JobStatus } from '@trao/shared';
import { InvalidJobTransitionError } from './errors.js';

/**
 * Adjacency matrix of valid job lifecycle transitions.
 */
const VALID_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  pending: ['running', 'cancelled'],
  running: ['completed', 'failed', 'pending', 'cancelled'], // 'pending' allows recovery retry
  completed: [], // Terminal
  failed: [], // Terminal
  cancelled: [], // Terminal
};

/**
 * Validates that a job transition from fromStatus to toStatus is permissible.
 * Throws InvalidJobTransitionError if not allowed.
 */
export function assertValidTransition(
  fromStatus: JobStatus,
  toStatus: JobStatus
): void {
  const allowed = VALID_TRANSITIONS[fromStatus];
  if (!allowed || !allowed.includes(toStatus)) {
    throw new InvalidJobTransitionError(fromStatus, toStatus);
  }
}

/**
 * Checks whether a job status transition is valid without throwing.
 */
export function isValidTransition(
  fromStatus: JobStatus,
  toStatus: JobStatus
): boolean {
  const allowed = VALID_TRANSITIONS[fromStatus];
  return Boolean(allowed && allowed.includes(toStatus));
}
