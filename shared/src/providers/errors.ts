/**
 * Provider-specific error classes for LLM and Research providers.
 * Sanitizes sensitive data (API keys, authorization headers) from all messages.
 */

export interface ProviderErrorDetails {
  provider: string;
  model?: string;
  statusCode?: number;
  isRetryable: boolean;
  retryAfterSeconds?: number;
  cause?: unknown;
}

/**
 * Strips potential API keys or query params from strings to avoid leaking secrets.
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return '';
  return message
    .replace(/(key|api[_-]?key|token|auth|secret)=[^&\s]+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [REDACTED]');
}

export class LLMProviderError extends Error {
  public readonly provider: string;
  public readonly model?: string;
  public readonly statusCode?: number;
  public readonly isRetryable: boolean;
  public readonly retryAfterSeconds?: number;

  constructor(message: string, details: ProviderErrorDetails) {
    super(sanitizeErrorMessage(message));
    this.name = 'LLMProviderError';
    this.provider = details.provider;
    this.model = details.model;
    this.statusCode = details.statusCode;
    this.isRetryable = details.isRetryable;
    this.retryAfterSeconds = details.retryAfterSeconds;
    if (details.cause) {
      this.cause = details.cause;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ProviderConfigurationError extends LLMProviderError {
  constructor(message: string, provider: string) {
    super(message, { provider, isRetryable: false });
    this.name = 'ProviderConfigurationError';
  }
}

export class ProviderTimeoutError extends LLMProviderError {
  constructor(message: string, provider: string, model?: string) {
    super(message, { provider, model, statusCode: 408, isRetryable: true });
    this.name = 'ProviderTimeoutError';
  }
}

export class ProviderRateLimitError extends LLMProviderError {
  constructor(message: string, provider: string, model?: string, retryAfterSeconds?: number) {
    super(message, { provider, model, statusCode: 429, isRetryable: true, retryAfterSeconds });
    this.name = 'ProviderRateLimitError';
  }
}

export class ProviderNetworkError extends LLMProviderError {
  constructor(message: string, provider: string, model?: string, cause?: unknown) {
    super(message, { provider, model, isRetryable: true, cause });
    this.name = 'ProviderNetworkError';
  }
}

export class ProviderResponseError extends LLMProviderError {
  constructor(message: string, provider: string, statusCode: number, model?: string) {
    const isRetryable = (statusCode >= 500 && statusCode < 600) || statusCode === 408;
    super(message, { provider, model, statusCode, isRetryable });
    this.name = 'ProviderResponseError';
  }
}

export class StructuredOutputParseError extends LLMProviderError {
  public readonly rawResponse: string;

  constructor(message: string, provider: string, rawResponse: string, model?: string) {
    super(message, { provider, model, isRetryable: false });
    this.name = 'StructuredOutputParseError';
    this.rawResponse = rawResponse;
  }
}

export class StructuredOutputValidationError extends LLMProviderError {
  public readonly validationIssues: unknown;

  constructor(message: string, provider: string, validationIssues: unknown, model?: string) {
    super(message, { provider, model, isRetryable: false });
    this.name = 'StructuredOutputValidationError';
    this.validationIssues = validationIssues;
  }
}

export class ResearchProviderError extends Error {
  public readonly provider: string;
  public readonly isRetryable: boolean;

  constructor(message: string, provider: string, isRetryable = false) {
    super(sanitizeErrorMessage(message));
    this.name = 'ResearchProviderError';
    this.provider = provider;
    this.isRetryable = isRetryable;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
