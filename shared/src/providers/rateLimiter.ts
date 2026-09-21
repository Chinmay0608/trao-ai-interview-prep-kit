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
   * Refills the token bucket based on elapsed time.
   */
  private refill(): void {
    const currentMs = this.now();
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
