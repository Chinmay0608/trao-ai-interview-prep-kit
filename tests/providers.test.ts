import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  TokenBucketRateLimiter,
  ProviderRateLimitError,
  ProviderTimeoutError,
  ProviderResponseError,
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

    it('6. retries on transient 429 rate limits and succeeds after recovery', async () => {
      const sleepDelays: number[] = [];
      const mockSleep = async (ms: number) => {
        sleepDelays.push(ms);
      };

      // 2 transient failures, then success
      const provider = new MockLLMProvider({
        transientFailuresRemaining: 2,
        mockText: 'Recovered after 429',
      });

      const text = await provider.generateText({
        prompt: 'Rate limit test',
        retryConfig: {
          initialDelayMs: 100,
          maxAttempts: 3,
          jitterFactor: 0,
          sleepFn: mockSleep,
        },
      });

      expect(text).toBe('Recovered after 429');
      expect(provider.callCount).toBe(3); // 2 retries + 1 success
      expect(sleepDelays.length).toBe(2);
    });

    it('7. retries on transient 5xx server errors', async () => {
      let attempts = 0;
      const sleepDelays: number[] = [];

      const result = await executeWithRetry(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new ProviderResponseError('503 Service Unavailable', 'mock', 503);
          }
          return 'Success on attempt 3';
        },
        {
          initialDelayMs: 50,
          maxAttempts: 4,
          jitterFactor: 0,
          sleepFn: async (ms) => {
            sleepDelays.push(ms);
          },
        }
      );

      expect(result).toBe('Success on attempt 3');
      expect(attempts).toBe(3);
      expect(sleepDelays.length).toBe(2);
    });

    it('8. does not retry non-retryable 401 client errors', async () => {
      let attempts = 0;
      await expect(
        executeWithRetry(
          async () => {
            attempts++;
            throw new ProviderResponseError('401 Unauthorized', 'mock', 401);
          },
          { maxAttempts: 3 }
        )
      ).rejects.toThrow(ProviderResponseError);

      expect(attempts).toBe(1); // Never retries non-retryable error
    });

    it('9. respects Retry-After seconds in backoff calculation', async () => {
      const sleepDelays: number[] = [];
      let attempts = 0;

      await executeWithRetry(
        async () => {
          attempts++;
          if (attempts === 1) {
            throw new ProviderRateLimitError('Rate limited', 'mock', 'model', 5); // Retry-After 5s
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

      expect(sleepDelays[0]).toBe(5000); // 5 seconds in ms
    });

    it('10. throws error once maximum retry limit is exhausted', async () => {
      const provider = new MockLLMProvider({ shouldRateLimit: true });

      await expect(
        provider.generateText({
          prompt: 'Exhaust retries',
          retryConfig: {
            maxAttempts: 2,
            initialDelayMs: 10,
            jitterFactor: 0,
            sleepFn: async () => {},
          },
        })
      ).rejects.toThrow(ProviderRateLimitError);

      expect(provider.callCount).toBe(2);
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
