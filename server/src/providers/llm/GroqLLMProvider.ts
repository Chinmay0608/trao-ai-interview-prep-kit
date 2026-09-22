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

export interface GroqProviderConfig {
  apiKey: string;
  defaultModel?: string;
  rateLimitRpm?: number;
  defaultTimeoutMs?: number;
  rateLimiter?: TokenBucketRateLimiter;
  baseUrl?: string;
}

export class GroqLLMProvider implements LLMProvider {
  public readonly providerName = 'groq';
  private apiKey: string;
  private defaultModel: string;
  private defaultTimeoutMs: number;
  private rateLimiter: TokenBucketRateLimiter;
  private baseUrl: string;

  constructor(config: GroqProviderConfig) {
    if (!config.apiKey || config.apiKey.trim() === '') {
      throw new ProviderConfigurationError(
        'Groq API key is required but was not provided.',
        'groq'
      );
    }

    this.apiKey = config.apiKey.trim();
    this.defaultModel = config.defaultModel || 'openai/gpt-oss-120b';
    this.defaultTimeoutMs = config.defaultTimeoutMs || 30000;
    this.baseUrl = config.baseUrl || 'https://api.groq.com/openai/v1';

    const rpm = config.rateLimitRpm && config.rateLimitRpm > 0 ? config.rateLimitRpm : 30;
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
        return this.callGroqApi(request, model, timeoutMs, false);
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
        const rawText = await this.callGroqApi(request, model, timeoutMs, true);

        let parsedJson: unknown;
        try {
          let cleaned = rawText.trim();
          if (cleaned.startsWith('```json')) {
            cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
          } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
          }
          parsedJson = JSON.parse(cleaned);
        } catch {
          throw new StructuredOutputParseError(
            `Failed to parse response as JSON from Groq model: ${model}`,
            'groq',
            rawText,
            model
          );
        }

        const validation = request.schema.safeParse(parsedJson);
        if (!validation.success) {
          throw new StructuredOutputValidationError(
            `Output failed Zod schema validation for ${request.schemaName || 'structured request'}: ${validation.error.message}`,
            'groq',
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
        prompt: 'Ping. Respond with pong.',
        maxTokens: 10,
        timeoutMs: 10000,
      });
      return {
        ok: true,
        provider: 'groq',
        model: this.defaultModel,
        latencyMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        ok: false,
        provider: 'groq',
        model: this.defaultModel,
        latencyMs: Date.now() - startTime,
        message: err.message,
      };
    }
  }

  private async callGroqApi(
    request: LLMRequest,
    model: string,
    timeoutMs: number,
    isJson: boolean
  ): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt,
      });
    }

    if (isJson) {
      // Groq requires the word "json" to appear in messages when response_format is { type: "json_object" }
      const hasJsonMention =
        (request.systemPrompt && /json/i.test(request.systemPrompt)) ||
        /json/i.test(request.prompt);
      if (!hasJsonMention) {
        if (messages.length > 0 && messages[0].role === 'system') {
          messages[0].content += '\nYou must respond in valid JSON format.';
        } else {
          messages.unshift({
            role: 'system',
            content: 'You are a helpful assistant that outputs only valid JSON conforming strictly to the requested schema.',
          });
        }
      }
    }

    messages.push({
      role: 'user',
      content: request.prompt,
    });

    const body: Record<string, any> = {
      model,
      messages,
      temperature: request.temperature ?? 0.2,
    };

    if (request.maxTokens) {
      body.max_tokens = request.maxTokens;
    }

    if (isJson) {
      body.response_format = { type: 'json_object' };
    }

    try {
      const response = await axios.post(url, body, {
        timeout: timeoutMs,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      const choice = response.data?.choices?.[0];
      const text = choice?.message?.content;

      if (typeof text !== 'string') {
        throw new ProviderResponseError(
          'Groq returned empty or missing message content in choices.',
          'groq',
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

      // Extract Retry-After if present
      let retryAfterSeconds: number | undefined;
      const retryAfterHeader = axiosErr.response?.headers?.['retry-after'];
      if (retryAfterHeader) {
        const parsed = parseInt(String(retryAfterHeader), 10);
        if (!isNaN(parsed) && parsed > 0) {
          retryAfterSeconds = parsed;
        }
      }

      if (status === 429) {
        throw new ProviderRateLimitError(
          `Groq rate limit exceeded: ${rawMessage}`,
          'groq',
          model,
          retryAfterSeconds
        );
      }

      if (axiosErr.code === 'ECONNABORTED' || axiosErr.message.includes('timeout')) {
        throw new ProviderTimeoutError(
          `Groq request timed out: ${rawMessage}`,
          'groq',
          model
        );
      }

      if (!axiosErr.response) {
        throw new ProviderNetworkError(
          `Groq network error: ${axiosErr.message}`,
          'groq',
          model,
          axiosErr
        );
      }

      if (status && status >= 500) {
        throw new ProviderResponseError(
          `Groq server error (HTTP ${status}): ${rawMessage}`,
          'groq',
          status,
          model
        );
      }

      if (status === 401 || status === 403) {
        throw new ProviderConfigurationError(
          `Groq authentication failed (HTTP ${status}): ${rawMessage}`,
          'groq'
        );
      }

      throw new ProviderResponseError(
        `Groq client error (HTTP ${status}): ${rawMessage}`,
        'groq',
        status || 400,
        model
      );
    }

    throw new ProviderNetworkError(
      `Unexpected error communicating with Groq: ${error?.message || String(error)}`,
      'groq',
      model,
      error
    );
  }
}
