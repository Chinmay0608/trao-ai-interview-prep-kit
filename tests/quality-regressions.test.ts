import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import {
  Requirement,
  Question,
  InternalRequirement,
  InternalQuestion,
  InternalFlashcard,
  InternalPrepKit,
  determineDayFocus,
  serializeToAppendixA,
  validateAppendixA,
  LLMProvider,
} from '../shared/src/index.js';
import {
  validateQuestion,
  validateQuestionBank,
  detectTemplateArtifacts,
  checkSemanticCategoryCompatibility,
  createDeterministicFallbackQuestion,
  regenerateSingleInvalidQuestion,
  calculateNormalizedTokenOverlap,
} from '../server/src/services/pipeline/questionValidator.js';
import {
  createSafeLookup,
  isAllowedContentType,
  safeFetch,
} from '../server/src/services/crawler/safeHttpClient.js';
import {
  validateAndNormalizeUrl,
  resolveAndValidateDns,
  isPrivateOrBlockedIp,
} from '../server/src/services/crawler/ssrfGuard.js';
import { DynamicCrawler } from '../server/src/services/crawler/DynamicCrawler.js';
import { executeBriefStep } from '../server/src/services/pipeline/steps/briefStep.js';
import { executeFlashcardStep } from '../server/src/services/pipeline/steps/flashcardStep.js';
import { SsrfSecurityError } from '../server/src/services/crawler/types.js';

describe('Quality Regressions & Crawler Enhancements Test Suite', () => {
  let localServer: http.Server;
  let serverPort: number;
  let serverUrl: string;

  beforeAll(async () => {
    // Spin up a deterministic local HTTP server for crawler, redirect, and robots.txt testing
    localServer = http.createServer((req, res) => {
      const url = req.url || '/';

      if (url === '/robots.txt') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('User-agent: *\nDisallow: /admin\nCrawl-delay: 0\n');
        return;
      }

      // Stripe-like regional redirect: /in -> 301 redirect to /in/overview
      if (url === '/in') {
        res.writeHead(301, { Location: '/in/overview' });
        res.end();
        return;
      }

      if (url === '/in/overview') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Stripe India Overview</title></head>
            <body>
              <h1>Stripe Financial Infrastructure</h1>
              <p>Stripe is a technology company that builds economic infrastructure for the internet.</p>
              <a href="/in/careers">Explore Engineering Careers in India</a>
            </body>
          </html>
        `);
        return;
      }

      if (url === '/in/careers') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Careers at Stripe India</title></head>
            <body>
              <h1>Engineering Careers at Stripe</h1>
              <p>Join Stripe engineering. Our interview process involves technical architecture and distributed systems problem solving.</p>
            </body>
          </html>
        `);
        return;
      }

      if (url === '/admin') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>Admin Secret</body></html>');
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<html><body>Not Found</body></html>');
    });

    await new Promise<void>((resolve) => {
      localServer.listen(0, '127.0.0.1', () => {
        const addr = localServer.address() as AddressInfo;
        serverPort = addr.port;
        serverUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      localServer.close(() => resolve());
    });
  });

  // =========================================================================
  // A. Questions do not mechanically copy requirements
  // =========================================================================
  describe('A. Mechanical Requirement Copying Prevention', () => {
    const requirement: Requirement = {
      id: 'r1',
      text: 'Proficiency in Python and distributed system design for asynchronous data ingestion pipelines',
      kind: 'technical',
      priority: 'must',
    };

    it('flags high token overlap when question prompt copies requirement verbatim', () => {
      const mechanicalQuestion: Question = {
        id: 'q_1',
        requirement_ids: ['r1'],
        category: 'system-design',
        prompt:
          'Demonstrate your proficiency in Python and distributed system design for asynchronous data ingestion pipelines.',
        answer_outline:
          'Candidate should discuss Python, distributed systems, and asynchronous data ingestion pipelines.',
        difficulty: 3,
      };

      const overlap = calculateNormalizedTokenOverlap(mechanicalQuestion.prompt, requirement.text);
      expect(overlap).toBeGreaterThan(0.6);

      const defects = validateQuestion(mechanicalQuestion, new Map([['r1', requirement]]));
      expect(
        defects.some((d) => d.includes('copies requirement') || d.includes('verbatim'))
      ).toBe(true);
    });

    it('passes natural interview question framing without verbatim repetition', () => {
      const naturalQuestion: Question = {
        id: 'q_2',
        requirement_ids: ['r1'],
        category: 'system-design',
        prompt:
          'How would you handle backpressure and consumer lag when building a high-throughput event processing queue in Python?',
        answer_outline:
          'Discuss buffering strategies, worker pool sizing, checkpointing, and downstream rate throttling.',
        difficulty: 3,
      };

      const overlap = calculateNormalizedTokenOverlap(naturalQuestion.prompt, requirement.text);
      expect(overlap).toBeLessThan(0.4);

      const defects = validateQuestion(naturalQuestion, new Map([['r1', requirement]]));
      expect(defects.length).toBe(0);
    });
  });

  // =========================================================================
  // B. Behavioural requirements do not produce architecture boilerplate
  // =========================================================================
  describe('B. Behavioural Requirements Avoid Architecture Boilerplate', () => {
    const behaviouralReq: Requirement = {
      id: 'r2',
      text: 'Demonstrated experience managing conflict and cross-functional team disagreements',
      kind: 'behavioural',
      priority: 'must',
    };

    it('flags architecture boilerplate on behavioural requirements', () => {
      const boilerplateQuestion: Question = {
        id: 'q_3',
        requirement_ids: ['r2'],
        category: 'behavioural',
        prompt:
          'In-depth technical scenario regarding managing conflict. How would you architect this system?',
        answer_outline:
          '1. Requirements Analysis 2. High-Level System Architecture 3. Data Flow & Schema 4. Scaling Bottlenecks',
        difficulty: 2,
      };

      const artifacts = detectTemplateArtifacts(boilerplateQuestion.prompt, [behaviouralReq]);
      expect(artifacts.length).toBeGreaterThan(0);
      expect(artifacts.some((a) => a.includes('In-depth technical scenario regarding'))).toBe(true);
    });

    it('accepts STAR-framed behavioural question without architecture patterns', () => {
      const starQuestion: Question = {
        id: 'q_4',
        requirement_ids: ['r2'],
        category: 'behavioural',
        prompt:
          'Tell me about a time when an engineering team and a product team disagreed on release timelines. How did you facilitate alignment?',
        answer_outline:
          'Candidate should describe the situation, competing priorities, communication techniques used, and the measurable outcome achieved.',
        difficulty: 2,
      };

      const artifacts = detectTemplateArtifacts(starQuestion.prompt, [behaviouralReq]);
      expect(artifacts.length).toBe(0);
    });
  });

  // =========================================================================
  // C. Semantic / category mismatch is detected
  // =========================================================================
  describe('C. Semantic Category Mismatch Detection', () => {
    const rBeh: Requirement = {
      id: 'r_beh',
      text: 'Ability to mentor junior developers and foster inclusive culture',
      kind: 'behavioural',
      priority: 'must',
    };

    it('flags system-design question mapped strictly to a behavioural requirement without team collaboration', () => {
      const mismatched: Question = {
        id: 'q_mis1',
        requirement_ids: ['r_beh'],
        category: 'system-design',
        prompt: 'Architect a scalable distributed database caching layer with Redis.',
        answer_outline: 'Explain write-through vs read-through cache and invalidation strategies.',
        difficulty: 4,
      };

      const compat = checkSemanticCategoryCompatibility(mismatched, [rBeh]);
      expect(compat).not.toBeNull();
      expect(compat).toContain('Purely behavioural requirement');
    });
  });

  // =========================================================================
  // D. Legitimate category variation is NOT falsely rejected
  // =========================================================================
  describe('D. Legitimate Category Variation Permitted', () => {
    const rTech: Requirement = {
      id: 'r_tech',
      text: 'Distributed data pipelines and concurrency in Go',
      kind: 'technical',
      priority: 'must',
    };
    const rBoth: Requirement = {
      id: 'r_both',
      text: 'Technical team leadership and architectural governance',
      kind: 'both',
      priority: 'must',
    };

    it('permits system-design, technical, and coding for technical requirements', () => {
      const qSys: Question = {
        id: 'q_sys',
        requirement_ids: ['r_tech'],
        category: 'system-design',
        prompt: 'Design a high throughput event pipeline.',
        answer_outline: 'Outline queue partitioning and worker workers.',
        difficulty: 3,
      };
      const qTech: Question = {
        id: 'q_tech',
        requirement_ids: ['r_tech'],
        category: 'technical',
        prompt: 'Explain channels and goroutine synchronization in Go.',
        answer_outline: 'Outline select statements, mutexes, and race condition detection.',
        difficulty: 3,
      };

      expect(checkSemanticCategoryCompatibility(qSys, [rTech])).toBeNull();
      expect(checkSemanticCategoryCompatibility(qTech, [rTech])).toBeNull();
    });

    it('permits behavioural and technical categories for "both" kind', () => {
      const qBeh: Question = {
        id: 'q_b',
        requirement_ids: ['r_both'],
        category: 'behavioural',
        prompt: 'How do you convince reluctant senior engineers to adopt a major architecture refactor?',
        answer_outline: 'Empathy, phased migration plan, and shared consensus building.',
        difficulty: 3,
      };
      const qSys: Question = {
        id: 'q_s',
        requirement_ids: ['r_both'],
        category: 'system-design',
        prompt: 'How do you design a governance system for cross-service API versioning?',
        answer_outline: 'Deprecation timelines, backward compatibility, and client SDKs.',
        difficulty: 4,
      };

      expect(checkSemanticCategoryCompatibility(qBeh, [rBoth])).toBeNull();
      expect(checkSemanticCategoryCompatibility(qSys, [rBoth])).toBeNull();
    });
  });

  // =========================================================================
  // E. Invalid questions trigger targeted regeneration
  // =========================================================================
  describe('E. Invalid Questions Trigger Targeted Regeneration', () => {
    const requirement: Requirement = {
      id: 'r1',
      text: 'Experience deploying Kubernetes production clusters',
      kind: 'technical',
      priority: 'must',
    };
    const reqMap = new Map([[requirement.id, requirement]]);

    const invalidQuestion: Question = {
      id: 'q_inv',
      requirement_ids: ['r1'],
      category: 'behavioural',
      prompt: 'In-depth technical scenario regarding Kubernetes. How would you architect this system?',
      answer_outline: 'Generic answer',
      difficulty: 3,
    };

    it('regenerates invalid question using targeted prompt and validates output', async () => {
      const mockLlm: LLMProvider = {
        name: 'mock',
        model: 'mock-model',
        generateText: async () => '',
        generateStructured: async ({ systemPrompt }) => {
          expect(systemPrompt).toContain('Detected template phrase');
          return {
            category: 'technical',
            prompt:
              'How do you manage pod disruption budgets and node drain strategies during automated zero-downtime Kubernetes cluster upgrades?',
            answer_outline:
              'Explain PDB configuration, cordon and drain commands, readiness probes, and rolling update strategy.',
            difficulty: 3,
          };
        },
      };

      const fixedQuestion = await regenerateSingleInvalidQuestion(
        invalidQuestion,
        ['Detected template phrase', 'Category mismatch'],
        [requirement],
        'Software Engineer',
        'Senior',
        mockLlm
      );

      expect(fixedQuestion.id).toBe(invalidQuestion.id);
      expect(fixedQuestion.category).toBe('technical');
      expect(fixedQuestion.prompt).not.toContain('In-depth technical scenario');
      const defects = validateQuestion(fixedQuestion, reqMap);
      expect(defects.length).toBe(0);
    });
  });

  // =========================================================================
  // F. Maximum two corrective regeneration attempts enforced
  // =========================================================================
  describe('F. Maximum Two Corrective Regeneration Attempts Enforced', () => {
    const requirement: Requirement = {
      id: 'r1',
      text: 'Production Kubernetes cluster management and node drain strategies',
      kind: 'technical',
      priority: 'must',
    };
    const reqMap = new Map([[requirement.id, requirement]]);

    it('enforces strictly at most 2 LLM corrective attempts before deterministic fallback', async () => {
      let callCount = 0;
      const stubbornBadLlm: LLMProvider = {
        name: 'stubborn',
        model: 'mock',
        generateText: async () => '',
        generateStructured: async () => {
          callCount++;
          return {
            category: 'system-design',
            prompt: 'In-depth technical scenario regarding Kubernetes. How would you architect this system?',
            answer_outline: 'Template answer',
            difficulty: 3,
          };
        },
      };

      const invalidQ: Question = {
        id: 'q_stubborn',
        requirement_ids: ['r1'],
        category: 'behavioural',
        prompt: 'In-depth technical scenario regarding Kubernetes. How would you architect this system?',
        answer_outline: 'Bad outline',
        difficulty: 3,
      };

      let candidate = invalidQ;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const defects = validateQuestion(candidate, reqMap);
        if (defects.length > 0) {
          candidate = await regenerateSingleInvalidQuestion(
            candidate,
            defects,
            [requirement],
            'Software Engineer',
            'Senior',
            stubbornBadLlm
          );
        }
      }

      const finalDefects = validateQuestion(candidate, reqMap);
      if (finalDefects.length > 0) {
        candidate = createDeterministicFallbackQuestion(candidate, [requirement]);
      }

      expect(callCount).toBe(2);
      expect(validateQuestion(candidate, reqMap).length).toBe(0);
      expect(candidate.id).toBe('q_stubborn');
      expect(candidate.prompt).not.toContain('In-depth technical scenario');
    });
  });

  // =========================================================================
  // G. Deterministic fallback preserves coverage
  // =========================================================================
  describe('G. Deterministic Fallback Preserves Coverage', () => {
    const req: Requirement = {
      id: 'r_data',
      text: 'Experience with real-time streaming using Apache Flink or Kafka Streams',
      kind: 'technical',
      priority: 'must',
    };
    const reqMap = new Map([[req.id, req]]);

    it('creates deterministic question preserving requirement IDs and valid schema', () => {
      const invalidQ: Question = {
        id: 'q_flink',
        requirement_ids: ['r_data'],
        category: 'behavioural',
        prompt: 'In-depth technical scenario regarding Flink.',
        answer_outline: 'bad',
        difficulty: 4,
      };

      const fallback = createDeterministicFallbackQuestion(invalidQ, [req]);
      expect(fallback.id).toBe('q_flink');
      expect(fallback.requirement_ids).toEqual(['r_data']);
      expect(fallback.category).toBe('technical');
      expect(fallback.prompt.length).toBeGreaterThan(15);
      expect(fallback.answer_outline.length).toBeGreaterThan(20);

      const defects = validateQuestion(fallback, reqMap);
      expect(defects.length).toBe(0);
    });
  });

  // =========================================================================
  // H. Schedule focus matches actual assigned question categories
  // =========================================================================
  describe('H. Schedule Focus Matches Assigned Categories', () => {
    it('assigns behavioural focus to day with strictly behavioural questions', () => {
      const q1: Question = {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'behavioural',
        prompt: 'Conflict resolution story?',
        answer_outline: 'STAR answer',
        difficulty: 2,
      };
      const q2: Question = {
        id: 'q2',
        requirement_ids: ['r1'],
        category: 'behavioural',
        prompt: 'Mentorship experience?',
        answer_outline: 'STAR answer',
        difficulty: 2,
      };

      const focus = determineDayFocus(1, 3, [q1, q2]);
      expect(focus).toBe('Behavioural & Team Collaboration');
      expect(focus).not.toContain('Core Technical Must-Haves');
    });

    it('assigns system architecture focus to day with system-design questions', () => {
      const qSys: Question = {
        id: 'qs1',
        requirement_ids: ['r2'],
        category: 'system-design',
        prompt: 'Design a distributed rate limiter.',
        answer_outline: 'Token bucket / Redis architecture.',
        difficulty: 4,
      };
      const focus = determineDayFocus(1, 3, [qSys]);
      expect(focus).toBe('System Architecture & Distributed Design');
    });

    it('assigns combined focus to mixed technical and behavioural days', () => {
      const qTech: Question = {
        id: 'qt1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'Explain SQL indexing.',
        answer_outline: 'B-trees.',
        difficulty: 3,
      };
      const qBeh: Question = {
        id: 'qb1',
        requirement_ids: ['r2'],
        category: 'behavioural',
        prompt: 'Collaboration story.',
        answer_outline: 'STAR.',
        difficulty: 2,
      };
      const focus = determineDayFocus(1, 3, [qTech, qBeh]);
      expect(focus).toBe('Technical Foundations & Collaboration');
    });
  });

  // =========================================================================
  // I. safeLookup standard callback works
  // =========================================================================
  describe('I. safeLookup Standard Callback Handling', () => {
    it('handles standard (hostname, callback) lookup and returns IPv4 address', async () => {
      const safeLookup = createSafeLookup(['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946']);

      const res = await new Promise<{ address: string; family: number }>((resolve, reject) => {
        safeLookup('example.com', (err: any, address: string, family?: number) => {
          if (err) return reject(err);
          resolve({ address, family: family || 4 });
        });
      });

      expect(res.address).toBe('93.184.216.34');
      expect(res.family).toBe(4);
    });

    it('returns error callback when validated IPs list is empty', async () => {
      const safeLookup = createSafeLookup([]);

      await expect(
        new Promise((resolve, reject) => {
          safeLookup('example.com', (err: any, address: string) => {
            if (err) return reject(err);
            resolve(address);
          });
        })
      ).rejects.toThrow('SSRF validation failed');
    });
  });

  // =========================================================================
  // J. safeLookup { all: true } works
  // =========================================================================
  describe('J. safeLookup { all: true } Callback Handling', () => {
    it('handles { all: true } option and returns array of LookupAddress objects', async () => {
      const safeLookup = createSafeLookup(['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946']);

      const addresses = await new Promise<any[]>((resolve, reject) => {
        safeLookup('example.com', { all: true }, (err: any, results: any[]) => {
          if (err) return reject(err);
          resolve(results);
        });
      });

      expect(Array.isArray(addresses)).toBe(true);
      expect(addresses.length).toBe(2);
      expect(addresses[0]).toEqual({ address: '93.184.216.34', family: 4 });
      expect(addresses[1]).toEqual({
        address: '2606:2800:220:1:248:1893:25c8:1946',
        family: 6,
      });
    });
  });

  // =========================================================================
  // K. Stripe-like redirect/crawl fixture works (local HTTP server)
  // =========================================================================
  describe('K. Stripe-Like Redirect Following on Local HTTP Server', () => {
    it('follows 301 redirect from /in to /in/overview using safeFetch with allowLocal', async () => {
      const targetUrl = `${serverUrl}/in`;
      const response = await safeFetch(targetUrl, { allowLocal: true });

      expect(response.statusCode).toBe(200);
      expect(response.finalUrl).toBe(`${serverUrl}/in/overview`);
      expect(response.body).toContain('Stripe Financial Infrastructure');
      expect(response.redirectChain.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // L. robots.txt text/plain works
  // =========================================================================
  describe('L. robots.txt text/plain Support', () => {
    it('fetches and permits text/plain robots.txt when allowTextPlain is true', async () => {
      const robotsUrl = `${serverUrl}/robots.txt`;
      const response = await safeFetch(robotsUrl, { allowLocal: true, allowTextPlain: true });

      expect(response.statusCode).toBe(200);
      expect(response.contentType).toContain('text/plain');
      expect(response.body).toContain('Disallow: /admin');
    });

    it('rejects text/plain for ordinary pages when allowTextPlain is false', () => {
      expect(isAllowedContentType('text/plain', false)).toBe(false);
      expect(isAllowedContentType('text/plain', true)).toBe(true);
    });
  });

  // =========================================================================
  // M. Crawler metrics are accurate
  // =========================================================================
  describe('M. Accurate Crawler Metrics Computation', () => {
    it('computes accurate pagesAttempted, pagesSucceeded, and pagesSkipped metrics', async () => {
      const crawler = new DynamicCrawler({
        budget: { maxPages: 5, maxDepth: 2 },
        safeFetchOptions: { allowLocal: true },
      });

      const result = await crawler.crawl(`${serverUrl}/in/overview`);

      expect(result.metrics).toBeDefined();
      expect(result.metrics.pagesAttempted).toBeGreaterThanOrEqual(2);
      expect(result.metrics.pagesSucceeded).toBeGreaterThanOrEqual(2);
      expect(result.metrics.pagesFailed).toBe(0);
      expect(result.metrics.blockedByRobots).toBe(0);
      expect(result.metrics.statusMessage).toContain('successfully indexed');
    });
  });

  // =========================================================================
  // N. Reachable local fixture: homepage -> linked page -> non-empty brief
  // =========================================================================
  describe('N. Reachable Crawl Evidence Leads to Non-Empty Company Brief', () => {
    it('crawls local fixture and synthesizes factual company brief with sources', async () => {
      const crawler = new DynamicCrawler({
        budget: { maxPages: 3 },
        safeFetchOptions: { allowLocal: true },
      });

      const crawlResult = await crawler.crawl(`${serverUrl}/in/overview`);
      expect(crawlResult.pages.length).toBeGreaterThan(0);

      const mockLlm: LLMProvider = {
        name: 'mock',
        model: 'mock',
        generateText: async () => '',
        generateStructured: async ({ prompt }) => {
          expect(prompt).toContain('Stripe Financial Infrastructure');
          return {
            summary:
              'Stripe develops global economic infrastructure and payment processing systems for internet businesses.',
            what_they_do:
              'Provides payment APIs, billing engines, and financial technology software for software developers.',
            sources: crawlResult.pagesUsed,
          };
        },
      };

      const brief = await executeBriefStep(
        'Stripe',
        `${serverUrl}/in`,
        crawlResult,
        [],
        mockLlm
      );

      expect(brief.summary).toContain('Stripe');
      expect(brief.what_they_do).toContain('payment APIs');
      expect(brief.sources.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // O. Unreachable crawler failure remains honest
  // =========================================================================
  describe('O. Unreachable Crawler Failure Degrades Honestly', () => {
    it('returns honest gap and accurate failure metrics when company site is unreachable', async () => {
      const unreachableUrl = 'http://127.0.0.1:1/unreachable';
      const crawler = new DynamicCrawler({
        budget: { maxPages: 2 },
        safeFetchOptions: { allowLocal: true, requestTimeoutMs: 500 },
      });

      const result = await crawler.crawl(unreachableUrl);

      expect(result.pages.length).toBe(0);
      expect(result.metrics.pagesSucceeded).toBe(0);
      expect(result.metrics.pagesFailed).toBeGreaterThan(0);
      expect(result.metrics.statusMessage).toContain('unreachable or returned no extractable text');

      const dummyLlm: LLMProvider = {
        name: 'fail',
        model: 'fail',
        generateText: async () => {
          throw new Error('LLM must not be called when zero evidence exists!');
        },
        generateStructured: async () => {
          throw new Error('LLM must not be called when zero evidence exists!');
        },
      };

      const brief = await executeBriefStep('UnreachableCorp', unreachableUrl, result, [], dummyLlm);

      expect(brief.summary).toContain('Limited or unreachable information for UnreachableCorp');
      expect(brief.sources).toEqual([]);
    });
  });

  // =========================================================================
  // P. Flashcards reference valid questions / requirements
  // =========================================================================
  describe('P. Flashcard Reference Integrity', () => {
    const requirements: Requirement[] = [
      { id: 'r1', text: 'Distributed systems design', kind: 'technical', priority: 'must' },
      { id: 'r2', text: 'Cross-functional collaboration', kind: 'behavioural', priority: 'must' },
    ];
    const questions: Question[] = [
      {
        id: 'q_dist',
        requirement_ids: ['r1'],
        category: 'system-design',
        prompt: 'Design a distributed consensus mechanism.',
        answer_outline: 'Raft outline.',
        difficulty: 4,
      },
    ];

    it('attaches sourceQuestionId and targetRequirementId internally', async () => {
      const mockLlm: LLMProvider = {
        name: 'mock',
        model: 'mock',
        generateText: async () => '',
        generateStructured: async () => ({
          flashcards: [
            {
              front: 'What are the two phases of 2PC?',
              back: 'Prepare phase and Commit phase.',
              requirement_ids: ['r1'],
              question_id: 'q_dist',
            },
          ],
        }),
      };

      const flashcards = await executeFlashcardStep(questions, requirements, mockLlm);

      expect(flashcards.length).toBe(1);
      expect(flashcards[0].requirement_ids).toEqual(['r1']);
      expect(flashcards[0].sourceQuestionId).toBe('q_dist');
      expect(flashcards[0].targetRequirementId).toBe('r1');
    });

    it('falls back to valid question linkage when LLM fails', async () => {
      const failingLlm: LLMProvider = {
        name: 'failing',
        model: 'failing',
        generateText: async () => {
          throw new Error('Timeout');
        },
        generateStructured: async () => {
          throw new Error('Timeout');
        },
      };

      const fallbackCards = await executeFlashcardStep(questions, requirements, failingLlm);
      expect(fallbackCards.length).toBe(1);
      expect(fallbackCards[0].sourceQuestionId).toBe('q_dist');
      expect(fallbackCards[0].targetRequirementId).toBe('r1');
      expect(fallbackCards[0].requirement_ids).toContain('r1');
    });
  });

  // =========================================================================
  // Q. Appendix A remains valid
  // =========================================================================
  describe('Q. Appendix A Contract Preservation', () => {
    it('serializes InternalPrepKit into valid Appendix A kit and strips internal metadata', () => {
      const internalReq: InternalRequirement = {
        id: 'r1',
        text: 'Distributed data consistency',
        kind: 'technical',
        priority: 'must',
        _meta: {
          origin: 'generated',
          pinned: false,
          evidenceText: 'Quote from JD',
        },
      };

      const internalQ: InternalQuestion = {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'system-design',
        prompt: 'How to handle split-brain in Raft cluster?',
        answer_outline: 'Use odd-numbered nodes and quorum voting.',
        difficulty: 4,
        _meta: {
          origin: 'generated',
          pinned: false,
        },
      };

      const internalF: InternalFlashcard = {
        id: 'f1',
        front: 'What is quorum in Raft?',
        back: 'N/2 + 1 nodes agreement.',
        requirement_ids: ['r1'],
        _meta: {
          origin: 'generated',
          pinned: false,
          sourceQuestionId: 'q1',
          targetRequirementId: 'r1',
        },
      };

      const internalKit: InternalPrepKit = {
        source: {
          company: 'Acme Corp',
          company_url: 'https://acme.com',
          role: 'Staff Engineer',
          location: 'Remote',
          jd_chars: 500,
          researched_at: new Date().toISOString(),
          pages_used: ['https://acme.com'],
        },
        company_brief: {
          summary: 'Acme builds distributed infrastructure.',
          what_they_do: 'Software tools.',
          sources: ['https://acme.com'],
        },
        role: {
          title: 'Staff Engineer',
          seniority: 'Senior',
          responsibilities: ['Build distributed systems'],
          requirements: [internalReq],
        },
        questions: [internalQ],
        flashcards: [internalF],
        schedule: {
          days_available: 1,
          days: [
            {
              day: 1,
              focus: 'System Architecture & Distributed Design',
              question_ids: ['q1'],
              minutes: 45,
            },
          ],
        },
        coverage: {
          uncovered_requirement_ids: [],
          passes: 1,
        },
        crawlMetrics: {
          pagesAttempted: 3,
          pagesSucceeded: 3,
          pagesFailed: 0,
          pagesSkipped: 0,
          blockedByRobots: 0,
          statusMessage: 'Completed',
        },
      };

      const serialized = serializeToAppendixA(internalKit);
      const validated = validateAppendixA(serialized);

      expect(validated).toBeDefined();
      expect(validated.role.title).toBe('Staff Engineer');

      expect((validated as any).crawlMetrics).toBeUndefined();
      expect((validated.role.requirements[0] as any)._meta).toBeUndefined();
      expect((validated.questions[0] as any)._meta).toBeUndefined();
      expect((validated.flashcards[0] as any)._meta).toBeUndefined();
      expect((validated.flashcards[0] as any).sourceQuestionId).toBeUndefined();
      expect((validated.flashcards[0] as any).targetRequirementId).toBeUndefined();
    });
  });

  // =========================================================================
  // R. Existing SSRF regression tests remain passing
  // =========================================================================
  describe('R. SSRF Guard Regression Invariants', () => {
    it('blocks loopback IPv4 addresses', () => {
      expect(isPrivateOrBlockedIp('127.0.0.1').blocked).toBe(true);
      expect(isPrivateOrBlockedIp('127.255.0.1').blocked).toBe(true);
    });

    it('blocks AWS/cloud metadata address 169.254.169.254', () => {
      expect(isPrivateOrBlockedIp('169.254.169.254').blocked).toBe(true);
    });

    it('blocks RFC 1918 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)', () => {
      expect(isPrivateOrBlockedIp('10.0.0.1').blocked).toBe(true);
      expect(isPrivateOrBlockedIp('172.16.0.1').blocked).toBe(true);
      expect(isPrivateOrBlockedIp('192.168.1.1').blocked).toBe(true);
    });

    it('rejects forbidden URI schemes', () => {
      expect(() => validateAndNormalizeUrl('file:///etc/shadow')).toThrow(SsrfSecurityError);
      expect(() => validateAndNormalizeUrl('ftp://example.com')).toThrow(SsrfSecurityError);
      expect(() => validateAndNormalizeUrl('javascript:alert(1)')).toThrow(SsrfSecurityError);
    });

    it('rejects embedded credentials in URL', () => {
      expect(() => validateAndNormalizeUrl('https://user:password@target.com')).toThrow(
        SsrfSecurityError
      );
    });

    it('rejects localhost DNS resolution in production mode (allowLocal: false)', async () => {
      await expect(resolveAndValidateDns('localhost', false)).rejects.toThrow(SsrfSecurityError);
    });
  });
});
