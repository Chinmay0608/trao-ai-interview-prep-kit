import { describe, it, expect } from 'vitest';
import { AppendixAKitSchema, BatchOutputFileSchema, BatchInputListSchema } from '../shared/src/index.js';
import type { AppendixAKit, BatchOutputFile, BatchInputCase } from '../shared/src/index.js';

describe('Phase 1: Appendix A & B Schema Validation', () => {
  const validKit: AppendixAKit = {
    source: {
      company: 'Acme Corp',
      company_url: 'https://acme.example.com',
      role: 'Staff Backend Engineer',
      location: 'Remote',
      jd_chars: 1250,
      researched_at: '2026-09-21T10:00:00Z',
      pages_used: ['https://acme.example.com/careers', 'https://acme.example.com/about'],
    },
    company_brief: {
      summary: 'Acme builds cloud infrastructure automation tools.',
      what_they_do: 'They deliver high-throughput distributed messaging systems.',
      sources: ['https://acme.example.com/about'],
    },
    role: {
      title: 'Staff Backend Engineer',
      seniority: 'Staff',
      responsibilities: [
        'Architect high-scale microservices',
        'Mentor senior engineers',
      ],
      requirements: [
        {
          id: 'r1',
          text: '5+ years experience with distributed systems',
          kind: 'technical',
          priority: 'must',
        },
        {
          id: 'r2',
          text: 'Experience mentoring junior and senior engineers',
          kind: 'behavioural',
          priority: 'must',
        },
        {
          id: 'r3',
          text: 'Familiarity with Kubernetes operators',
          kind: 'technical',
          priority: 'nice',
        },
      ],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'How do you guarantee exactly-once message processing across distributed partitions?',
        answer_outline: 'Explain idempotency keys, transactional outbox pattern, and Kafka partition rebalancing.',
        difficulty: 3,
      },
      {
        id: 'q2',
        requirement_ids: ['r2'],
        category: 'behavioural',
        prompt: 'Tell me about a time you coached an engineer struggling with architectural design.',
        answer_outline: 'Use STAR format: Situation, Action taken in 1-on-1s and paired design docs, Outcome.',
        difficulty: 2,
      },
    ],
    flashcards: [
      {
        id: 'f1',
        front: 'What is the Transactional Outbox Pattern?',
        back: 'A design pattern where database mutations and message events are saved in the same atomic transaction.',
        requirement_ids: ['r1'],
      },
    ],
    schedule: {
      days_available: 2,
      days: [
        {
          day: 1,
          focus: 'Distributed Systems & Must-Haves',
          question_ids: ['q1'],
          minutes: 45,
        },
        {
          day: 2,
          focus: 'Leadership & Mentorship Behavioural Scenarios',
          question_ids: ['q2'],
          minutes: 30,
        },
      ],
    },
    coverage: {
      uncovered_requirement_ids: ['r3'],
      passes: 2,
    },
  };

  it('validates a conformant Appendix A kit', () => {
    const result = AppendixAKitSchema.safeParse(validKit);
    expect(result.success).toBe(true);
  });

  it('rejects an Appendix A kit when schedule days do not match days_available', () => {
    const invalidKit = {
      ...validKit,
      schedule: {
        days_available: 3, // specified 3, but provided 2 days
        days: validKit.schedule.days,
      },
    };
    const result = AppendixAKitSchema.safeParse(invalidKit);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('Schedule days count'))).toBe(true);
    }
  });

  it('rejects an Appendix A kit referencing a non-existent question in schedule', () => {
    const invalidKit = {
      ...validKit,
      schedule: {
        days_available: 2,
        days: [
          { day: 1, focus: 'Day 1', question_ids: ['q1'], minutes: 45 },
          { day: 2, focus: 'Day 2', question_ids: ['q_non_existent'], minutes: 30 },
        ],
      },
    };
    const result = AppendixAKitSchema.safeParse(invalidKit);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('non-existent question ID'))).toBe(true);
    }
  });

  it('rejects non-integer minutes in schedule', () => {
    const invalidKit = {
      ...validKit,
      schedule: {
        days_available: 2,
        days: [
          { day: 1, focus: 'Day 1', question_ids: ['q1'], minutes: 45.5 },
          { day: 2, focus: 'Day 2', question_ids: ['q2'], minutes: 30 },
        ],
      },
    };
    const result = AppendixAKitSchema.safeParse(invalidKit);
    expect(result.success).toBe(false);
  });

  it('validates a conformant Appendix B input cases list', () => {
    const inputCases: BatchInputCase[] = [
      {
        id: 'case-01',
        jd: 'Senior Backend Engineer\n\nWe are looking for...',
        company_url: 'http://localhost:8099/acme/',
        days: 5,
      },
    ];
    const result = BatchInputListSchema.safeParse(inputCases);
    expect(result.success).toBe(true);
  });

  it('validates a conformant Appendix B output file with success and failure records', () => {
    const batchOutput: BatchOutputFile = {
      version: '1.0',
      generated_at: '2026-09-21T10:30:00Z',
      kits: [
        {
          id: 'case-01',
          status: 'ok',
          kit: validKit,
          error: null,
        },
        {
          id: 'case-04',
          status: 'failed',
          kit: null,
          error: {
            code: 'COMPANY_UNREACHABLE',
            message: 'Company site unreachable after 3 retries.',
          },
        },
      ],
    };
    const result = BatchOutputFileSchema.safeParse(batchOutput);
    expect(result.success).toBe(true);
  });
});
