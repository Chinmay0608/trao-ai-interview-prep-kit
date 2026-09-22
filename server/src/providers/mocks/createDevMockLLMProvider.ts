import { LLMProvider, LLMStructuredRequest } from '@trao/shared';
import { MockLLMProvider } from './MockLLMProvider.js';

/**
 * Creates an intelligent development mock LLM provider.
 * When a user runs the application locally without an external LLM API key,
 * this provider dynamically extracts information from the supplied Job Description
 * to synthesize a complete, grounded, realistic interview prep kit.
 */
export function createDevMockLLMProvider(): LLMProvider {
  const mock = new MockLLMProvider();

  mock.generateStructured = (async <T>(request: LLMStructuredRequest<T>): Promise<T> => {
    const prompt = request.prompt || '';
    const schemaName = request.schemaName;

    // 1. JD Extraction Step
    if (schemaName === 'ExtractionOutput') {
      const jdMatch = prompt.match(/--- JOB DESCRIPTION ---\s*([\s\S]*?)\s*-----------------------/);
      const jdText = (jdMatch ? jdMatch[1] : prompt).trim();
      const lines = jdText.split('\n').map((l) => l.trim()).filter(Boolean);

      const firstLine = lines[0] || 'Software Engineer';
      const roleTitle = firstLine.slice(0, 50).replace(/[^\w\s-]/g, '') || 'Software Engineer';

      // Pick quotes from the JD for evidence grounding
      const quote1 = lines[0] || 'Software development';
      const quote2 = lines.length > 1 ? lines[1] : quote1;
      const quote3 = lines.length > 2 ? lines[2] : quote1;

      const result = {
        roleTitle,
        seniority: 'Mid-Senior',
        responsibilities: [
          'Design, build, and maintain high-performance, reliable applications and services',
          'Collaborate with cross-functional engineering, product, and operations teams',
          'Contribute to technical architecture, design discussions, and code quality standards',
        ],
        requirements: [
          {
            id: 'r1',
            text: `Core competency in ${roleTitle} architecture and engineering best practices`,
            kind: 'technical' as const,
            priority: 'must' as const,
            evidenceText: quote1,
          },
          {
            id: 'r2',
            text: 'Proven collaboration, clear communication, and team execution skills',
            kind: 'behavioural' as const,
            priority: 'must' as const,
            evidenceText: quote2,
          },
          {
            id: 'r3',
            text: 'Experience with modern distributed systems, automated testing, and scalability',
            kind: 'technical' as const,
            priority: 'nice' as const,
            evidenceText: quote3,
          },
        ],
      };

      return result as unknown as T;
    }

    // 2. Company Brief Step
    if (schemaName === 'CompanyBriefOutput') {
      const companyMatch = prompt.match(/Company:\s*([^\n]+)/i);
      const companyName = companyMatch ? companyMatch[1].trim() : 'The Company';

      const result = {
        summary: `${companyName} is an industry-leading technology organization delivering secure, high-scale digital infrastructure and services.`,
        what_they_do: `Provides platform infrastructure, cloud APIs, and mission-critical developer tools for high-volume internet commerce and technology operations.`,
        sources: ['https://example.com/about', 'https://example.com/careers'],
      };

      return result as unknown as T;
    }

    // 3. Question Bank Generation (Initial)
    if (schemaName === 'InitialQuestionsOutput') {
      const result = {
        questions: [
          {
            requirement_ids: ['r1'],
            category: 'technical' as const,
            prompt: 'Walk through your approach to designing a high-throughput, fault-tolerant backend service from requirements to deployment.',
            answer_outline: 'Candidates should structure their answer around API boundaries, data models, concurrency control, caching tiers (e.g. Redis), asynchronous queues, database indexes, and observability.',
            difficulty: 3 as const,
          },
          {
            requirement_ids: ['r2'],
            category: 'behavioural' as const,
            prompt: 'Describe a situation where you had a disagreement with a peer or technical lead regarding an architectural decision. How did you resolve it?',
            answer_outline: 'Look for structured STAR communication: establishing shared objective metrics, validating trade-offs with benchmarks, active listening, and committing to team decisions without friction.',
            difficulty: 2 as const,
          },
          {
            requirement_ids: ['r1', 'r3'],
            category: 'system-design' as const,
            prompt: 'How would you architect a distributed rate-limiting and quota-management service handling 100k requests per second?',
            answer_outline: 'Discuss sliding-window counter vs token bucket algorithms, Redis cluster with Lua scripts, in-memory local caching with probabilistic sync, and degradation strategies during network partitions.',
            difficulty: 3 as const,
          },
          {
            requirement_ids: ['r1'],
            category: 'company-fit' as const,
            prompt: 'What engineering principles do you prioritize when building scalable systems in a fast-paced environment?',
            answer_outline: 'Candidate should emphasize simplicity (YAGNI), automated CI/CD safety nets, clear ownership, pragmatic abstractions, and observable instrumentation over premature complexity.',
            difficulty: 2 as const,
          },
        ],
      };

      return result as unknown as T;
    }

    // 4. Targeted Gap Questions
    if (schemaName === 'TargetedGapQuestionsOutput') {
      const result = {
        questions: [
          {
            requirement_ids: ['r2'],
            category: 'behavioural' as const,
            prompt: 'Tell me about a time you had to adapt quickly to changing project requirements midway through a major deliverable.',
            answer_outline: 'Evaluate prioritization, communication with stakeholders, transparent milestone updates, and pragmatic scope management.',
            difficulty: 2 as const,
          },
        ],
      };

      return result as unknown as T;
    }

    // 5. Flashcards Deck
    if (schemaName === 'FlashcardsOutput') {
      const result = {
        flashcards: [
          {
            front: 'What is the transactional outbox pattern and what problem does it solve?',
            back: 'It guarantees reliable event publishing across distributed systems by writing both the state mutation and the outbound event into the same atomic database transaction before a background processor sends it to a message broker.',
            requirement_ids: ['r1'],
          },
          {
            front: 'What is the difference between latency and throughput in distributed systems?',
            back: 'Latency is the time taken to complete a single operation or request. Throughput is the number of operations completed per unit of time (e.g., RPS). Optimizing for one often requires trade-offs with the other.',
            requirement_ids: ['r1'],
          },
          {
            front: 'What is the STAR framework used for in behavioural interviews?',
            back: 'Situation (context/background), Task (challenge/responsibility), Action (specific steps taken by candidate), Result (measurable positive outcome and learning).',
            requirement_ids: ['r2'],
          },
          {
            front: 'What is eventual consistency vs strong consistency?',
            back: 'Strong consistency guarantees all readers see the most recent write immediately. Eventual consistency allows temporary replication lag across nodes, guaranteeing convergence over time in exchange for higher availability and lower latency.',
            requirement_ids: ['r3'],
          },
        ],
      };

      return result as unknown as T;
    }

    // Fallback
    return {} as unknown as T;
  }) as any;

  return mock;
}
