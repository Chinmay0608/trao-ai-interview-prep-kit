import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  TokenBucketRateLimiter,
  ProviderRateLimitError,
  ProviderTimeoutError,
  ProviderResponseError,
  ProviderNetworkError,
  ProviderConfigurationError,
  StructuredOutputParseError,
  StructuredOutputValidationError,
  sanitizeErrorMessage,
  executeWithRetry,
} from '../shared/src/index.js';
import { MockLLMProvider } from '../server/src/providers/mocks/MockLLMProvider.js';
import { MockResearchProvider } from '../server/src/providers/mocks/MockResearchProvider.js';
import {
  DuckDuckGoHtmlSearchProvider,
  isValidResearchUrl,
  calculateRelevance,
  resolveDuckDuckGoUrl,
} from '../server/src/providers/research/DuckDuckGoHtmlSearchProvider.js';
import { TavilySearchProvider } from '../server/src/providers/research/TavilySearchProvider.js';
import { GroqLLMProvider } from '../server/src/providers/llm/GroqLLMProvider.js';

describe('Phase 3: External Providers & Contracts', () => {
  describe('LLM Provider & Retry Engine', () => {
    const testSchema = z.object({
      role: z.string(),
      seniority: z.string(),
      yearsExperience: z.number(),
    });

    it('1. performs successful structured generation', async () => {
      const mockData = { role: 'Backend Engineer', seniority: 'Senior', yearsExperience: 5 };
      const provider = new MockLLMProvider({ mockStructured: mockData });

      const result = await provider.generateStructured({
        prompt: 'Extract details',
        schema: testSchema,
        schemaName: 'RoleDetails',
      });

      expect(result).toEqual(mockData);
      expect(provider.callCount).toBe(1);
    });

    it('2. performs successful text generation', async () => {
      const provider = new MockLLMProvider({ mockText: 'Company brief summary text' });
      const text = await provider.generateText({ prompt: 'Summarize Acme' });

      expect(text).toBe('Company brief summary text');
      expect(provider.callCount).toBe(1);
    });

    it('3. throws StructuredOutputParseError on malformed JSON', async () => {
      const provider = new MockLLMProvider({ shouldReturnMalformedJson: true });

      await expect(
        provider.generateStructured({
          prompt: 'Extract details',
          schema: testSchema,
        })
      ).rejects.toThrow(StructuredOutputParseError);
    });

    it('4. throws StructuredOutputValidationError when output fails schema', async () => {
      // Invalid data: yearsExperience is string instead of number
      const invalidData = { role: 'Backend', seniority: 'Junior', yearsExperience: 'not_a_number' };
      const provider = new MockLLMProvider({ mockStructured: invalidData });

      await expect(
        provider.generateStructured({
          prompt: 'Extract details',
          schema: testSchema,
        })
      ).rejects.toThrow(StructuredOutputValidationError);
    });

    it('5. handles timeout with ProviderTimeoutError', async () => {
      const provider = new MockLLMProvider({ shouldTimeout: true });

      await expect(
        provider.generateText({
          prompt: 'Timeout test',
          retryConfig: { maxAttempts: 1 },
        })
      ).rejects.toThrow(ProviderTimeoutError);
    });

    it('6. 429 -> 429 -> 200: retries on transient 429 rate limits and succeeds on attempt 3', async () => {
      const sleepDelays: number[] = [];
      const mockSleep = async (ms: number) => {
        sleepDelays.push(ms);
      };

      // 2 transient 429 failures, then 200 success
      const provider = new MockLLMProvider({
        transientFailuresRemaining: 2,
        mockText: 'Recovered after two 429 errors',
      });

      const text = await provider.generateText({
        prompt: 'Rate limit recovery test',
        retryConfig: {
          initialDelayMs: 100,
          maxAttempts: 3,
          jitterFactor: 0,
          sleepFn: mockSleep,
        },
      });

      expect(text).toBe('Recovered after two 429 errors');
      expect(provider.callCount).toBe(3); // Attempt 1 (429), Attempt 2 (429), Attempt 3 (200)
      expect(sleepDelays.length).toBe(2);
    });

    it('7. retries on transient 5xx server errors (500, 502, 503, 504)', async () => {
      for (const status of [500, 502, 503, 504]) {
        let attempts = 0;
        const sleepDelays: number[] = [];

        const result = await executeWithRetry(
          async () => {
            attempts++;
            if (attempts < 2) {
              throw new ProviderResponseError(`HTTP ${status} Server Error`, 'mock', status);
            }
            return `Success after ${status}`;
          },
          {
            initialDelayMs: 20,
            maxAttempts: 3,
            jitterFactor: 0,
            sleepFn: async (ms) => {
              sleepDelays.push(ms);
            },
          }
        );

        expect(result).toBe(`Success after ${status}`);
        expect(attempts).toBe(2);
        expect(sleepDelays.length).toBe(1);
      }
    });

    it('8. retries on timeout (HTTP 408, ECONNABORTED) and network connection errors', async () => {
      // 8a. HTTP 408 Request Timeout
      let attempts408 = 0;
      const res408 = await executeWithRetry(
        async () => {
          attempts408++;
          if (attempts408 < 2) {
            throw new ProviderTimeoutError('HTTP 408 Request Timeout', 'mock');
          }
          return 'Success after 408';
        },
        { initialDelayMs: 10, maxAttempts: 3, jitterFactor: 0, sleepFn: async () => {} }
      );
      expect(res408).toBe('Success after 408');
      expect(attempts408).toBe(2);

      // 8b. Network connection error
      let attemptsNet = 0;
      const resNet = await executeWithRetry(
        async () => {
          attemptsNet++;
          if (attemptsNet < 2) {
            throw new ProviderNetworkError('ECONNRESET connection reset', 'mock');
          }
          return 'Success after network error';
        },
        { initialDelayMs: 10, maxAttempts: 3, jitterFactor: 0, sleepFn: async () => {} }
      );
      expect(resNet).toBe('Success after network error');
      expect(attemptsNet).toBe(2);
    });

    it('9. does not retry non-retryable 400, 401, 403, and schema/parse errors', async () => {
      // 400 Bad Request
      let attempts400 = 0;
      await expect(
        executeWithRetry(
          async () => {
            attempts400++;
            throw new ProviderResponseError('400 Bad Request', 'mock', 400);
          },
          { maxAttempts: 3, sleepFn: async () => {} }
        )
      ).rejects.toThrow(ProviderResponseError);
      expect(attempts400).toBe(1);

      // 401 Unauthorized
      let attempts401 = 0;
      await expect(
        executeWithRetry(
          async () => {
            attempts401++;
            throw new ProviderConfigurationError('401 Unauthorized API key', 'mock');
          },
          { maxAttempts: 3, sleepFn: async () => {} }
        )
      ).rejects.toThrow(ProviderConfigurationError);
      expect(attempts401).toBe(1);

      // 403 Forbidden
      let attempts403 = 0;
      await expect(
        executeWithRetry(
          async () => {
            attempts403++;
            throw new ProviderConfigurationError('403 Forbidden', 'mock');
          },
          { maxAttempts: 3, sleepFn: async () => {} }
        )
      ).rejects.toThrow(ProviderConfigurationError);
      expect(attempts403).toBe(1);

      // Structured schema validation failure
      let attemptsSchema = 0;
      await expect(
        executeWithRetry(
          async () => {
            attemptsSchema++;
            throw new StructuredOutputValidationError('Schema failure', 'mock', []);
          },
          { maxAttempts: 3, sleepFn: async () => {} }
        )
      ).rejects.toThrow(StructuredOutputValidationError);
      expect(attemptsSchema).toBe(1);
    });

    it('10. respects Retry-After header seconds in backoff calculation and rate limiter', async () => {
      const sleepDelays: number[] = [];
      let attempts = 0;

      await executeWithRetry(
        async () => {
          attempts++;
          if (attempts === 1) {
            throw new ProviderRateLimitError('Rate limited', 'mock', 'model', 4); // Retry-After 4s
          }
          return 'Done';
        },
        {
          initialDelayMs: 100,
          maxAttempts: 2,
          jitterFactor: 0,
          sleepFn: async (ms) => {
            sleepDelays.push(ms);
          },
        }
      );

      expect(sleepDelays[0]).toBe(4000); // 4 seconds in ms
      expect(attempts).toBe(2);
    });

    it('10b. 429 -> exhausted retries fails cleanly at maxAttempts and never retries indefinitely', async () => {
      const provider = new MockLLMProvider({ shouldRateLimit: true });
      const sleepDelays: number[] = [];

      await expect(
        provider.generateText({
          prompt: 'Exhaust retries',
          retryConfig: {
            maxAttempts: 3,
            initialDelayMs: 10,
            jitterFactor: 0,
            sleepFn: async (ms) => {
              sleepDelays.push(ms);
            },
          },
        })
      ).rejects.toThrow(ProviderRateLimitError);

      expect(provider.callCount).toBe(3); // Exactly maxAttempts, never retries indefinitely
      expect(sleepDelays.length).toBe(2); // 2 delays between 3 attempts
    });

    it('10c. prevents retry multiplication between provider and caller', async () => {
      // Calling provider with maxAttempts=3 must result in exactly 3 calls total,
      // proving that no outer layer multiplies attempts (e.g. 3x3=9).
      const provider = new MockLLMProvider({ shouldRateLimit: true });

      try {
        await provider.generateStructured({
          prompt: 'Extraction step prompt',
          schema: testSchema,
          retryConfig: {
            maxAttempts: 3,
            initialDelayMs: 5,
            jitterFactor: 0,
            sleepFn: async () => {},
          },
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ProviderRateLimitError);
      }

      expect(provider.callCount).toBe(3); // Strictly 3, no multiplication
    });

    it('10d. notifyRateLimited pauses rate limiter and drains tokens during cooldown', async () => {
      let simulatedTime = 1000;
      const sleepDelays: number[] = [];

      const limiter = new TokenBucketRateLimiter({
        capacity: 5,
        refillRatePerSecond: 1,
        injectableNow: () => simulatedTime,
        injectableSleep: async (ms) => {
          sleepDelays.push(ms);
          simulatedTime += ms;
        },
      });

      expect(limiter.getAvailableTokens()).toBe(5);

      // Upstream 429 occurs with 3s cooldown
      limiter.notifyRateLimited(3);

      expect(limiter.isPaused()).toBe(true);
      expect(limiter.getAvailableTokens()).toBe(0); // Drained

      // Acquire must wait for the 3s cooldown to elapse
      await limiter.acquire(1);

      expect(sleepDelays.length).toBeGreaterThanOrEqual(1);
      expect(sleepDelays[0]).toBe(3000); // Waited 3 seconds cooldown
      expect(limiter.isPaused()).toBe(false);
    });

    it('11. token bucket rate limiter enforces capacity and refill pacing', async () => {
      let simulatedTime = 1000000;
      const sleepEvents: number[] = [];

      const limiter = new TokenBucketRateLimiter({
        capacity: 2,
        refillRatePerSecond: 1, // 1 token per second
        injectableNow: () => simulatedTime,
        injectableSleep: async (ms) => {
          sleepEvents.push(ms);
          simulatedTime += ms;
        },
      });

      // Acquire 2 tokens (capacity used up)
      await limiter.acquire(1);
      await limiter.acquire(1);

      // Third token requires waiting 1 second
      await limiter.acquire(1);

      expect(sleepEvents.length).toBe(1);
      expect(sleepEvents[0]).toBe(1000); // Waited 1,000 ms
    });

    it('12. concurrent requests share the same rate limiter in FIFO order', async () => {
      let simulatedTime = 0;
      const executionOrder: number[] = [];

      const limiter = new TokenBucketRateLimiter({
        capacity: 1,
        refillRatePerSecond: 2, // 1 token every 500ms
        injectableNow: () => simulatedTime,
        injectableSleep: async (ms) => {
          simulatedTime += ms;
        },
      });

      const p1 = limiter.acquire(1).then(() => executionOrder.push(1));
      const p2 = limiter.acquire(1).then(() => executionOrder.push(2));
      const p3 = limiter.acquire(1).then(() => executionOrder.push(3));

      await Promise.all([p1, p2, p3]);

      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it('13. health check returns structured status without leaking secrets', async () => {
      const provider = new MockLLMProvider();
      const status = await provider.healthCheck();

      expect(status.ok).toBe(true);
      expect(status.provider).toBe('mock-llm');
      expect(status.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('14. API keys and auth headers never appear in sanitized error messages', () => {
      const mockKey = ['AI', 'za', 'SySecretApiKey123'].join('');
      const leaked = `Failed request with key=${mockKey} and Bearer eyJhbGciOiJIUzI1NiJ9`;
      const clean = sanitizeErrorMessage(leaked);

      expect(clean).not.toContain(mockKey);
      expect(clean).not.toContain('eyJhbGciOiJIUzI1NiJ9');
      expect(clean).toContain('key=[REDACTED]');
      expect(clean).toContain('Bearer [REDACTED]');
    });
  });

  describe('Research Provider & DuckDuckGo HTML Parsing', () => {
    const mockHtmlFixture = `
      <!DOCTYPE html>
      <html>
        <body>
          <div class="results">
            <div class="result">
              <h2 class="result__title">
                <a class="result__a" href="/l/?uddg=https%3A%2F%2Fwww.glassdoor.com%2FInterview%2FAcme-Engineering-Interview-Questions.htm">
                  Acme Corp Software Engineer Interview Questions
                </a>
              </h2>
              <a class="result__snippet" href="#">
                Detailed breakdown of the 4 rounds: 1 recruiter screen, 1 take-home coding challenge, 1 system design round, and 1 behavioural interview.
              </a>
            </div>
            <div class="result">
              <h2 class="result__title">
                <a class="result__a" href="/l/?uddg=https%3A%2F%2Fblog.acme.com%2Fengineering%2Four-hiring-process">
                  Our Engineering Hiring Process at Acme
                </a>
              </h2>
              <a class="result__snippet" href="#">
                How we evaluate candidates with take-home projects and pair programming.
              </a>
            </div>
            <div class="result">
              <h2 class="result__title">
                <a class="result__a" href="/l/?uddg=http%3A%2F%2Flocalhost%3A8080%2Fbad-url">
                  Internal Server Localhost
                </a>
              </h2>
              <a class="result__snippet" href="#">Invalid local URL should be ignored.</a>
            </div>
          </div>
        </body>
      </html>
    `;

    it('15. successfully parses real DuckDuckGo HTML structure', () => {
      const ddg = new DuckDuckGoHtmlSearchProvider();
      const results = ddg.parseHtmlResults(mockHtmlFixture);

      expect(results).toHaveLength(2); // Localhost item filtered out
      expect(results[0].url).toBe('https://www.glassdoor.com/Interview/Acme-Engineering-Interview-Questions.htm');
      expect(results[0].title).toContain('Acme Corp Software Engineer Interview Questions');
      expect(results[0].snippet).toContain('Detailed breakdown of the 4 rounds');
      expect(results[0].sourceType).toBe('public_discussion');
      expect(results[0].relevance).toBeGreaterThan(50);

      expect(results[1].url).toBe('https://blog.acme.com/engineering/our-hiring-process');
      expect(results[1].sourceType).toBe('company_blog');
    });

    it('16. returns an empty array when no results are found', () => {
      const ddg = new DuckDuckGoHtmlSearchProvider();
      const results = ddg.parseHtmlResults('<html><body><div class="no-results">No results</div></body></html>');

      expect(results).toEqual([]);
    });

    it('17. handles malformed HTML without crashing', () => {
      const ddg = new DuckDuckGoHtmlSearchProvider();
      expect(ddg.parseHtmlResults('')).toEqual([]);
      expect(ddg.parseHtmlResults('<<<malformed>>>')).toEqual([]);
    });

    it('18. network failure degrades to honest empty result without throwing or inventing rounds', async () => {
      const ddg = new DuckDuckGoHtmlSearchProvider({ timeoutMs: 1 });
      // Search with invalid/empty company name
      const results = await ddg.searchInterviewProcess('', 'Engineer');
      expect(results).toEqual([]);
    });

    it('19. validates research result URLs strictly (rejects credentials, invalid schemes, local IPs)', () => {
      expect(isValidResearchUrl('https://glassdoor.com/interview/123')).toBe(true);
      expect(isValidResearchUrl('http://techblog.acme.com/post')).toBe(true);

      expect(isValidResearchUrl('ftp://example.com')).toBe(false);
      expect(isValidResearchUrl('https://user:pass@example.com')).toBe(false);
      expect(isValidResearchUrl('http://localhost:3000')).toBe(false);
      expect(isValidResearchUrl('http://127.0.0.1/evil')).toBe(false);
      expect(isValidResearchUrl('http://192.168.1.1/secret')).toBe(false);
      expect(isValidResearchUrl('not_a_url')).toBe(false);
    });

    it('20. resolves DuckDuckGo redirect uddg parameters correctly', () => {
      const raw = '/l/?uddg=https%3A%2F%2Fexample.com%2Finterview%3Fref%3Dtest';
      const resolved = resolveDuckDuckGoUrl(raw);
      expect(resolved).toBe('https://example.com/interview?ref=test');

      const direct = 'https://direct.com/page';
      expect(resolveDuckDuckGoUrl(direct)).toBe(direct);
    });

    it('21. computes deterministic keyword relevance scores', () => {
      const scoreHigh = calculateRelevance(
        'Staff Engineer Interview Process',
        'Detailed technical coding round, take-home assessment, system design, and hiring rounds.'
      );
      const scoreLow = calculateRelevance('Acme Company Overview', 'A generic technology company.');

      expect(scoreHigh).toBeGreaterThan(scoreLow);
      expect(scoreHigh).toBeLessThanOrEqual(100);
      expect(scoreLow).toBeGreaterThanOrEqual(40);
    });

    it('22. TavilySearchProvider implements ResearchProvider interface and handles missing key honestly', async () => {
      const tavily = new TavilySearchProvider({ apiKey: undefined });
      expect(tavily.providerName).toBe('tavily');

      const results = await tavily.searchInterviewProcess('Acme', 'Engineer');
      expect(results).toEqual([]); // Degrades honestly without API key
    });

    it('23. MockResearchProvider provides deterministic test behavior', async () => {
      const mockResult = {
        url: 'https://test.com/interview',
        title: 'Interview Experience',
        snippet: 'Coding and system design rounds',
        sourceType: 'interview_experience' as const,
        relevance: 90,
        retrievedAt: '2026-09-21T10:00:00Z',
      };

      const mock = new MockResearchProvider({ mockResults: [mockResult] });
      const results = await mock.searchInterviewProcess('Acme', 'Lead Engineer');

      expect(results).toHaveLength(1);
      expect(results[0].url).toBe('https://test.com/interview');
      expect(mock.callCount).toBe(1);
      expect(mock.lastQuery?.companyName).toBe('Acme');
    });

    it('24. GroqLLMProvider validates API key and sets providerName to groq', () => {
      expect(() => new GroqLLMProvider({ apiKey: '' })).toThrow();

      const groq = new GroqLLMProvider({ apiKey: 'gsk_mock_test_key_123456789' });
      expect(groq.providerName).toBe('groq');
    });

    it('25. GroqLLMProvider accepts custom model configuration', () => {
      const groq = new GroqLLMProvider({
        apiKey: 'gsk_mock_test_key_123456789',
        defaultModel: 'llama-3.1-8b-instant',
        rateLimitRpm: 60,
      });
      expect(groq.providerName).toBe('groq');
    });
  });
});
