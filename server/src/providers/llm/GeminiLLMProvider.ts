import axios, { AxiosError } from 'axios';
import {
  LLMProvider,
  LLMRequest,
  LLMStructuredRequest,
  LLMHealthCheckResult,
  ProviderConfigurationError,
  ProviderRateLimitError,
  ProviderTimeoutError,
  ProviderNetworkError,
  ProviderResponseError,
  StructuredOutputParseError,
  StructuredOutputValidationError,
  executeWithRetry,
  TokenBucketRateLimiter,
} from '@trao/shared';

export interface GeminiProviderConfig {
  apiKey: string;
  defaultModel?: string;
  rateLimitRpm?: number; // Requests per minute
  defaultTimeoutMs?: number;
  rateLimiter?: TokenBucketRateLimiter;
}

export class GeminiLLMProvider implements LLMProvider {
  public readonly providerName = 'gemini';
  private apiKey: string;
  private defaultModel: string;
  private defaultTimeoutMs: number;
  private rateLimiter: TokenBucketRateLimiter;

  constructor(config: GeminiProviderConfig) {
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new ProviderConfigurationError(
        'Gemini API key is required but was not provided.',
        'gemini'
      );
    }

    this.apiKey = config.apiKey.trim();
    this.defaultModel = config.defaultModel || 'gemini-2.0-flash';
    this.defaultTimeoutMs = config.defaultTimeoutMs || 30000;

    const rpm = config.rateLimitRpm && config.rateLimitRpm > 0 ? config.rateLimitRpm : 15;
    this.rateLimiter =
      config.rateLimiter ||
      new TokenBucketRateLimiter({
        capacity: rpm,
        refillRatePerSecond: rpm / 60,
      });
  }

  public async generateText(request: LLMRequest): Promise<string> {
    const model = request.model || this.defaultModel;
    const timeoutMs = request.timeoutMs || this.defaultTimeoutMs;

    return executeWithRetry(
      async () => {
        await this.rateLimiter.acquire(1);
        return this.callGeminiApi(request, model, timeoutMs, false);
      },
      request.retryConfig
    );
  }

  public async generateStructured<T>(request: LLMStructuredRequest<T>): Promise<T> {
    const model = request.model || this.defaultModel;
    const timeoutMs = request.timeoutMs || this.defaultTimeoutMs;

    return executeWithRetry(
      async () => {
        await this.rateLimiter.acquire(1);
        const rawText = await this.callGeminiApi(request, model, timeoutMs, true);

        let parsedJson: unknown;
        try {
          // Strip markdown code fences if model returned ```json ... ```
          let cleaned = rawText.trim();
          if (cleaned.startsWith('```json')) {
            cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
          } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
          }
          parsedJson = JSON.parse(cleaned);
        } catch {
          throw new StructuredOutputParseError(
            `Failed to parse response as JSON from Gemini model: ${model}`,
            'gemini',
            rawText,
            model
          );
        }

        const validation = request.schema.safeParse(parsedJson);
        if (!validation.success) {
          throw new StructuredOutputValidationError(
            `Output failed Zod schema validation for ${request.schemaName || 'structured request'}: ${validation.error.message}`,
            'gemini',
            validation.error.issues,
            model
          );
        }

        return validation.data;
      },
      request.retryConfig
    );
  }

  public async healthCheck(): Promise<LLMHealthCheckResult> {
    const startTime = Date.now();
    try {
      await this.generateText({
        prompt: 'Ping. Respond with "pong".',
        maxTokens: 10,
        timeoutMs: 10000,
      });
      return {
        ok: true,
        provider: 'gemini',
        model: this.defaultModel,
        latencyMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        ok: false,
        provider: 'gemini',
        model: this.defaultModel,
        latencyMs: Date.now() - startTime,
        message: err.message,
      };
    }
  }

  private async callGeminiApi(
    request: LLMRequest,
    model: string,
    timeoutMs: number,
    isJson: boolean
  ): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const contents: any[] = [];
    if (request.systemPrompt) {
      contents.push({
        role: 'user',
        parts: [{ text: `[SYSTEM INSTRUCTIONS]: ${request.systemPrompt}` }],
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: request.prompt }],
    });

    const generationConfig: Record<string, any> = {
      temperature: request.temperature ?? 0.2,
    };
    if (request.maxTokens) {
      generationConfig.maxOutputTokens = request.maxTokens;
    }
    if (isJson) {
      generationConfig.responseMimeType = 'application/json';
    }

    try {
      const response = await axios.post(
        url,
        { contents, generationConfig },
        {
          params: { key: this.apiKey },
          timeout: timeoutMs,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const candidate = response.data?.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;

      if (!text && text !== '') {
        throw new ProviderResponseError(
          'Gemini returned empty or missing text in response candidates.',
          'gemini',
          response.status,
          model
        );
      }

      return text;
    } catch (error: any) {
      this.handleAxiosError(error, model);
    }
  }

  private handleAxiosError(error: any, model: string): never {
    if (axios.isAxiosError(error)) {
      const axiosErr = error as AxiosError<any>;
      const status = axiosErr.response?.status;
      const responseData = axiosErr.response?.data;
      const rawMessage = responseData?.error?.message || axiosErr.message;

      // Extract Retry-After or rate-limit reset headers if present
      let retryAfterSeconds: number | undefined;
      const headers = axiosErr.response?.headers;
      const retryAfterHeader = headers?.['retry-after'] || headers?.['Retry-After'];
      if (retryAfterHeader) {
        const num = parseFloat(String(retryAfterHeader));
        if (!isNaN(num) && num > 0) {
          retryAfterSeconds = Math.ceil(num);
        } else {
          // Parse HTTP-date format (RFC 7231)
          const dateMs = Date.parse(String(retryAfterHeader));
          if (!isNaN(dateMs)) {
            const diffSeconds = Math.ceil((dateMs - Date.now()) / 1000);
            if (diffSeconds > 0) {
              retryAfterSeconds = diffSeconds;
            }
          }
        }
      } else {
        // Fallback: check x-ratelimit-reset-requests / x-ratelimit-reset-tokens (e.g. "1.5s", "500ms")
        const resetHeader =
          headers?.['x-ratelimit-reset-requests'] ||
          headers?.['x-ratelimit-reset-tokens'] ||
          headers?.['x-ratelimit-reset'];
        if (resetHeader) {
          const str = String(resetHeader).trim();
          if (str.endsWith('ms')) {
            const ms = parseFloat(str.slice(0, -2));
            if (!isNaN(ms) && ms > 0) retryAfterSeconds = Math.ceil(ms / 1000);
          } else if (str.endsWith('s')) {
            const s = parseFloat(str.slice(0, -1));
            if (!isNaN(s) && s > 0) retryAfterSeconds = Math.ceil(s);
          } else {
            const s = parseFloat(str);
            if (!isNaN(s) && s > 0) retryAfterSeconds = Math.ceil(s);
          }
        }
      }

      if (status === 429) {
        // Notify shared rate limiter so concurrent callers pause during provider cooldown
        const cooldown = retryAfterSeconds && retryAfterSeconds > 0 ? retryAfterSeconds : 2;
        this.rateLimiter.notifyRateLimited(cooldown);

        throw new ProviderRateLimitError(
          `Gemini rate limit exceeded (HTTP 429): ${rawMessage}`,
          'gemini',
          model,
          retryAfterSeconds
        );
      }

      if (status === 408 || axiosErr.code === 'ECONNABORTED' || axiosErr.message.includes('timeout')) {
        throw new ProviderTimeoutError(
          `Gemini request timed out (HTTP ${status || 408}): ${rawMessage}`,
          'gemini',
          model
        );
      }

      if (!axiosErr.response) {
        throw new ProviderNetworkError(
          `Gemini network error: ${axiosErr.message}`,
          'gemini',
          model,
          axiosErr
        );
      }

      if (status && status >= 500) {
        if (retryAfterSeconds && retryAfterSeconds > 0) {
          this.rateLimiter.notifyRateLimited(retryAfterSeconds);
        }
        throw new ProviderResponseError(
          `Gemini server error (HTTP ${status}): ${rawMessage}`,
          'gemini',
          status,
          model
        );
      }

      if (status === 401 || status === 403) {
        throw new ProviderConfigurationError(
          `Gemini authentication failed (HTTP ${status}): ${rawMessage}`,
          'gemini'
        );
      }

      throw new ProviderResponseError(
        `Gemini client error (HTTP ${status}): ${rawMessage}`,
        'gemini',
        status || 400,
        model
      );
    }

    throw new ProviderNetworkError(
      `Unexpected error communicating with Gemini: ${error?.message || String(error)}`,
      'gemini',
      model,
      error
    );
  }
}
