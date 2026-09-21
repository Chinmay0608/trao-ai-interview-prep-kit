import { GenerationJob, IGenerationJobDoc } from '../../db/models/GenerationJob.js';

export interface RecoveryResult {
  recoveredCount: number;
  failedCount: number;
  processedJobIds: string[];
}

export const DEFAULT_STALE_THRESHOLD_MS = 90_000; // 90 seconds without heartbeat
export const DEFAULT_MAX_RETRIES = 2; // Up to 2 retries (3 total attempts)

/**
 * Executes an atomic sweep for stalled/abandoned running generation jobs.
 *
 * Race-Condition Guarantee:
 * Multiple recovery workers running simultaneously will never double-recover
 * or double-increment a stale job. Every transition uses an atomic
 * findOneAndUpdate with the condition `{ status: 'running', heartbeatAt: { $lt: cutoff } }`.
 * The first worker to match transitions the status, causing all competing workers
 * to receive null and skip.
 */
export async function recoverStaleJobs(
  staleThresholdMs: number = DEFAULT_STALE_THRESHOLD_MS,
  maxRetries: number = DEFAULT_MAX_RETRIES
): Promise<RecoveryResult> {
  const cutoff = new Date(Date.now() - staleThresholdMs);

  // Identify candidates currently running with expired heartbeats
  const staleCandidates = await GenerationJob.find({
    status: 'running',
    heartbeatAt: { $lt: cutoff },
  });

  let recoveredCount = 0;
  let failedCount = 0;
  const processedJobIds: string[] = [];

  for (const candidate of staleCandidates) {
    if (candidate.retryAttempts < maxRetries) {
      // Atomic retry transition: 'running' -> 'pending'
      const recovered = await GenerationJob.findOneAndUpdate(
        {
          _id: candidate._id,
          status: 'running',
          heartbeatAt: { $lt: cutoff },
        },
        {
          $set: {
            status: 'pending',
            heartbeatAt: new Date(),
            updatedAt: new Date(),
          },
          $inc: {
            retryAttempts: 1,
          },
        },
        { new: true }
      );

      if (recovered) {
        recoveredCount++;
        processedJobIds.push(candidate._id.toString());
      }
    } else {
      // Atomic terminal failure: 'running' -> 'failed'
      const failed = await GenerationJob.findOneAndUpdate(
        {
          _id: candidate._id,
          status: 'running',
          heartbeatAt: { $lt: cutoff },
        },
        {
          $set: {
            status: 'failed',
            completedAt: new Date(),
            updatedAt: new Date(),
            error: {
              code: 'JOB_TIMEOUT',
              message: 'Pipeline stalled without heartbeat.',
            },
          },
        },
        { new: true }
      );

      if (failed) {
        failedCount++;
        processedJobIds.push(candidate._id.toString());
      }
    }
  }

  return {
    recoveredCount,
    failedCount,
    processedJobIds,
  };
}

/**
 * Starts a recurring recovery worker that runs every sweepIntervalMs.
 */
export function startRecoveryWorker(
  sweepIntervalMs: number = 30_000,
  staleThresholdMs: number = DEFAULT_STALE_THRESHOLD_MS,
  maxRetries: number = DEFAULT_MAX_RETRIES
): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      await recoverStaleJobs(staleThresholdMs, maxRetries);
    } catch {
      // Log / suppress uncaught errors in recovery loop
    }
  }, sweepIntervalMs);
}
