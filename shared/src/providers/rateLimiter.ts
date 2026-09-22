import { setTimeout } from 'node:timers';

export interface RateLimiterOptions {
  capacity: number; // Maximum burst capacity
  refillRatePerSecond: number; // Tokens added per second
  injectableNow?: () => number;
  injectableSleep?: (ms: number) => Promise<void>;
}

/**
 * Token-bucket rate limiter shared across concurrent requests.
 * Ensures that concurrent calls wait rather than bypassing the rate limit.
 */
export class TokenBucketRateLimiter {
  private capacity: number;
  private refillRatePerSecond: number;
  private currentTokens: number;
  private lastRefillMs: number;
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;
  private pausedUntilMs: number = 0;

  // Queue to preserve strict FIFO ordering across concurrent async callers
  private queue: Promise<void> = Promise.resolve();

  constructor(options: RateLimiterOptions) {
    if (options.capacity <= 0) {
      throw new Error('RateLimiter capacity must be greater than 0.');
    }
    if (options.refillRatePerSecond <= 0) {
      throw new Error('RateLimiter refillRatePerSecond must be greater than 0.');
    }

    this.capacity = options.capacity;
    this.refillRatePerSecond = options.refillRatePerSecond;
    this.currentTokens = options.capacity;
    this.now = options.injectableNow || (() => Date.now());
    this.sleep =
      options.injectableSleep ||
      ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.lastRefillMs = this.now();
  }

  /**
   * Signals that an upstream provider has rate-limited requests (e.g. HTTP 429).
   * Drains remaining tokens and pauses the rate limiter for the specified cooldown window.
   */
  public notifyRateLimited(cooldownSeconds: number): void {
    if (cooldownSeconds <= 0) return;
    const cooldownMs = Math.min(60_000, Math.round(cooldownSeconds * 1000));
    const currentMs = this.now();
    const resumeAt = currentMs + cooldownMs;
    if (resumeAt > this.pausedUntilMs) {
      this.pausedUntilMs = resumeAt;
    }
    // Drain tokens so waiting callers cannot fire prematurely into a rate-limited provider
    this.currentTokens = 0;
    this.lastRefillMs = currentMs;
  }

  /**
   * Returns whether the rate limiter is currently in an upstream cooldown pause.
   */
  public isPaused(): boolean {
    return this.now() < this.pausedUntilMs;
  }

  /**
   * Refills the token bucket based on elapsed time if not paused.
   */
  private refill(): void {
    const currentMs = this.now();
    if (currentMs < this.pausedUntilMs) {
      // Still in cooldown period from an upstream 429
      this.lastRefillMs = currentMs;
      return;
    }

    const elapsedSeconds = Math.max(0, (currentMs - this.lastRefillMs) / 1000);
    if (elapsedSeconds > 0) {
      const tokensToAdd = elapsedSeconds * this.refillRatePerSecond;
      this.currentTokens = Math.min(this.capacity, this.currentTokens + tokensToAdd);
      this.lastRefillMs = currentMs;
    }
  }

  /**
   * Acquires the specified number of tokens.
   * Serializes requests through a FIFO queue to prevent concurrent bypass.
   */
  public acquire(tokensRequired = 1): Promise<void> {
    const acquireOperation = async (): Promise<void> => {
      while (true) {
        const currentMs = this.now();
        if (currentMs < this.pausedUntilMs) {
          const pauseRemaining = this.pausedUntilMs - currentMs;
          await this.sleep(pauseRemaining);
          continue;
        }

        this.refill();

        if (this.currentTokens >= tokensRequired) {
          this.currentTokens -= tokensRequired;
          return;
        }

        // Calculate time needed to accumulate the remaining tokens
        const tokensNeeded = tokensRequired - this.currentTokens;
        const waitSeconds = tokensNeeded / this.refillRatePerSecond;
        const waitMs = Math.max(1, Math.ceil(waitSeconds * 1000));

        await this.sleep(waitMs);
      }
    };

    // Chain onto queue to guarantee FIFO execution
    const result = this.queue.then(acquireOperation);
    // Keep queue progressing even on errors
    this.queue = result.catch(() => {});
    return result;
  }

  public getAvailableTokens(): number {
    this.refill();
    return this.currentTokens;
  }

  public getCapacity(): number {
    return this.capacity;
  }
}
