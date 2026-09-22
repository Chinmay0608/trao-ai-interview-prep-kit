import { z } from 'zod';
import { LLMProviderError } from './errors.js';

export interface RetryConfig {
  initialDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  jitterFactor: number;
  sleepFn: (ms: number) => Promise<void>;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  initialDelayMs: 500,
  maxDelayMs: 5000,
  maxAttempts: 3,
  jitterFactor: 0.2,
  sleepFn: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  retryConfig?: Partial<RetryConfig>;
}

export interface LLMStructuredRequest<T> extends LLMRequest {
  schema: z.ZodType<T, any, any>;
  schemaName?: string;
}

export interface LLMHealthCheckResult {
  ok: boolean;
  provider: string;
  model: string;
  latencyMs: number;
  message?: string;
}

export interface LLMProvider {
  readonly providerName: string;
  generateStructured<T>(request: LLMStructuredRequest<T>): Promise<T>;
  generateText(request: LLMRequest): Promise<string>;
  healthCheck(): Promise<LLMHealthCheckResult>;
}

/**
 * Executes an async operation with deterministic exponential backoff and jitter.
 * Retries only when the error is classified as isRetryable.
 */
export async function executeWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  partialConfig?: Partial<RetryConfig>
): Promise<T> {
  const config: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...partialConfig,
  };

  let attempt = 1;

  while (true) {
    try {
      return await operation(attempt);
    } catch (error: any) {
      const isRetryable =
        error instanceof LLMProviderError ? error.isRetryable : false;

      if (!isRetryable || attempt >= config.maxAttempts) {
        throw error;
      }

      // Determine backoff duration
      let delayMs: number;
      if (error instanceof LLMProviderError && error.retryAfterSeconds && error.retryAfterSeconds > 0) {
        // Respect Retry-After header directly, bounded by safety ceiling (max 60 seconds)
        const MAX_SAFETY_RETRY_AFTER_MS = 60_000;
        delayMs = Math.min(MAX_SAFETY_RETRY_AFTER_MS, Math.round(error.retryAfterSeconds * 1000));
      } else {
        // Deterministic exponential backoff
        const baseDelay = Math.min(
          config.maxDelayMs,
          config.initialDelayMs * Math.pow(2, attempt - 1)
        );
        if (config.jitterFactor > 0) {
          // Apply jitter: +/- jitterFactor
          const jitter = 1 + (Math.random() * 2 - 1) * config.jitterFactor;
          delayMs = Math.max(1, Math.round(baseDelay * jitter));
        } else {
          delayMs = baseDelay;
        }
      }

      await config.sleepFn(delayMs);
      attempt++;
    }
  }
}
