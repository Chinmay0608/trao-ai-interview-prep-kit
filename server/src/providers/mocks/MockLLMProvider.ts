import {
  LLMProvider,
  LLMRequest,
  LLMStructuredRequest,
  LLMHealthCheckResult,
  ProviderTimeoutError,
  ProviderRateLimitError,
  ProviderNetworkError,
  ProviderResponseError,
  ProviderConfigurationError,
  StructuredOutputParseError,
  StructuredOutputValidationError,
  TokenBucketRateLimiter,
  executeWithRetry,
} from '@trao/shared';

export interface MockLLMConfig {
  mockText?: string;
  mockStructured?: any;
  shouldTimeout?: boolean;
  shouldRateLimit?: boolean;
  should5xx?: boolean;
  should401?: boolean;
  should403?: boolean;
  should408?: boolean;
  shouldNetworkError?: boolean;
  shouldReturnMalformedJson?: boolean;
  rateLimiter?: TokenBucketRateLimiter;
  transientFailuresRemaining?: number;
  retryAfterSeconds?: number;
}

export class MockLLMProvider implements LLMProvider {
  public readonly providerName = 'mock-llm';
  public callCount = 0;
  public lastRequest?: LLMRequest;
  public config: MockLLMConfig;

  constructor(config: MockLLMConfig = {}) {
    this.config = { ...config };
  }

  public async generateText(request: LLMRequest): Promise<string> {
    return executeWithRetry(
      async () => {
        this.callCount++;
        this.lastRequest = request;

        if (this.config.rateLimiter) {
          await this.config.rateLimiter.acquire(1);
        }

        this.checkSimulatedErrors();

        return this.config.mockText ?? 'Mock text response';
      },
      request.retryConfig
    );
  }

  public async generateStructured<T>(request: LLMStructuredRequest<T>): Promise<T> {
    return executeWithRetry(
      async () => {
        this.callCount++;
        this.lastRequest = request;

        if (this.config.rateLimiter) {
          await this.config.rateLimiter.acquire(1);
        }

        this.checkSimulatedErrors();

        if (this.config.shouldReturnMalformedJson) {
          throw new StructuredOutputParseError(
            'Simulated malformed JSON response',
            'mock-llm',
            '{"incomplete": true'
          );
        }

        const rawData = this.config.mockStructured ?? {};
        const validation = request.schema.safeParse(rawData);
        if (!validation.success) {
          throw new StructuredOutputValidationError(
            'Simulated schema validation failure',
            'mock-llm',
            validation.error.issues
          );
        }

        return validation.data;
      },
      request.retryConfig
    );
  }

  public async healthCheck(): Promise<LLMHealthCheckResult> {
    return {
      ok: !this.config.shouldNetworkError && !this.config.should5xx,
      provider: 'mock-llm',
      model: 'mock-model-v1',
      latencyMs: 5,
    };
  }

  private checkSimulatedErrors(): void {
    if (this.config.should401) {
      throw new ProviderConfigurationError('Simulated 401 Unauthorized API key', 'mock-llm');
    }

    if (this.config.should403) {
      throw new ProviderConfigurationError('Simulated 403 Forbidden access', 'mock-llm');
    }

    if (this.config.should408) {
      throw new ProviderTimeoutError('Simulated HTTP 408 Request Timeout', 'mock-llm');
    }

    if (this.config.transientFailuresRemaining && this.config.transientFailuresRemaining > 0) {
      this.config.transientFailuresRemaining--;
      const retryAfter = this.config.retryAfterSeconds ?? 1;
      throw new ProviderRateLimitError('Simulated transient 429 error', 'mock-llm', 'mock-model', retryAfter);
    }

    if (this.config.shouldRateLimit) {
      const retryAfter = this.config.retryAfterSeconds ?? 1;
      throw new ProviderRateLimitError('Simulated rate limit exceeded (HTTP 429)', 'mock-llm', 'mock-model', retryAfter);
    }

    if (this.config.shouldTimeout) {
      throw new ProviderTimeoutError('Simulated request timeout', 'mock-llm');
    }

    if (this.config.shouldNetworkError) {
      throw new ProviderNetworkError('Simulated network connection reset', 'mock-llm');
    }

    if (this.config.should5xx) {
      throw new ProviderResponseError('Simulated internal server error', 'mock-llm', 503);
    }
  }
}
