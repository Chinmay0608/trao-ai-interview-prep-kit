import { describe, it, expect } from 'vitest';
import {
  serializeToAppendixA,
  AppendixASerializationError,
  AppendixAKitSchema,
  InternalPrepKit,
} from '../shared/src/index.js';

describe('Phase 2: Appendix A Serializer', () => {
  const internalKitWithMeta: InternalPrepKit & {
    _id: string;
    userId: string;
    generationVersion: number;
    activeJobId: string;
    createdAt: string;
    updatedAt: string;
  } = {
    _id: 'mongo_64f1a2b3c4d5e6f7',
    userId: 'user_123456789',
    generationVersion: 2,
    activeJobId: 'job_987654321',
    createdAt: '2026-09-21T09:00:00Z',
    updatedAt: '2026-09-21T09:15:00Z',
    source: {
      company: 'TechFlow Systems',
      company_url: 'https://techflow.example.com',
      role: 'Lead Backend Engineer',
      location: 'Hybrid, London',
      jd_chars: 1450,
      researched_at: '2026-09-21T09:05:00Z',
      pages_used: ['https://techflow.example.com/careers', 'https://techflow.example.com/about'],
    },
    company_brief: {
      summary: 'TechFlow develops enterprise cloud streaming pipelines.',
      what_they_do: 'They process real-time financial telemetry data.',
      sources: ['https://techflow.example.com/about'],
    },
    role: {
      title: 'Lead Backend Engineer',
      seniority: 'Lead',
      responsibilities: ['Lead telemetry pipeline architecture', 'Coach junior developers'],
      requirements: [
        {
          id: 'r1',
          text: 'Expertise in Kafka stream processing',
          kind: 'technical',
          priority: 'must',
          _meta: {
            origin: 'generated',
            pinned: true,
            evidenceText: 'Requirements: 5+ years building distributed streaming systems using Apache Kafka',
          },
        },
        {
          id: 'r2',
          text: 'Technical mentorship experience',
          kind: 'behavioural',
          priority: 'must',
          _meta: {
            origin: 'edited',
            pinned: false,
            evidenceText: 'Proven ability to mentor and grow engineering talent',
          },
        },
      ],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'How do you handle consumer group rebalancing storms in high-throughput Kafka clusters?',
        answer_outline: 'Explain cooperative sticky assignor, session timeouts, and heartbeat intervals.',
        difficulty: 3,
        _meta: {
          origin: 'edited',
          pinned: true,
        },
      },
      {
        id: 'q2',
        requirement_ids: ['r2'],
        category: 'behavioural',
        prompt: 'Describe a situation where you had to guide an engineer through a difficult architectural trade-off.',
        answer_outline: 'STAR framework: context, structured trade-off matrix, pairing, outcome.',
        difficulty: 2,
        _meta: {
          origin: 'custom',
          pinned: false,
        },
      },
    ],
    flashcards: [
      {
        id: 'f1',
        front: 'What is Cooperative Sticky Assignor in Kafka?',
        back: 'A rebalance protocol that allows consumers to continue processing partitions during rebalances.',
        requirement_ids: ['r1'],
        _meta: {
          origin: 'generated',
          pinned: false,
        },
      },
    ],
    schedule: {
      days_available: 2,
      days: [
        {
          day: 1,
          focus: 'Kafka Architecture & Distributed Must-Haves',
          question_ids: ['q1'],
          minutes: 60,
        },
        {
          day: 2,
          focus: 'Technical Mentorship & Scenario Drills',
          question_ids: ['q2'],
          minutes: 45,
        },
      ],
    },
    coverage: {
      uncovered_requirement_ids: [],
      passes: 2,
    },
  };

  it('strips all internal metadata and DB fields completely', () => {
    const serialized = serializeToAppendixA(internalKitWithMeta);

    // Verify top-level DB fields stripped
    expect((serialized as any)._id).toBeUndefined();
    expect((serialized as any).userId).toBeUndefined();
    expect((serialized as any).generationVersion).toBeUndefined();
    expect((serialized as any).activeJobId).toBeUndefined();
    expect((serialized as any).createdAt).toBeUndefined();
    expect((serialized as any).updatedAt).toBeUndefined();

    // Verify requirement _meta stripped
    for (const req of serialized.role.requirements) {
      expect((req as any)._meta).toBeUndefined();
      expect(req).toHaveProperty('id');
      expect(req).toHaveProperty('text');
      expect(req).toHaveProperty('kind');
      expect(req).toHaveProperty('priority');
    }

    // Verify question _meta stripped
    for (const q of serialized.questions) {
      expect((q as any)._meta).toBeUndefined();
      expect(q).toHaveProperty('id');
      expect(q).toHaveProperty('requirement_ids');
      expect(q).toHaveProperty('category');
      expect(q).toHaveProperty('prompt');
      expect(q).toHaveProperty('answer_outline');
      expect(q).toHaveProperty('difficulty');
    }

    // Verify flashcard _meta stripped
    for (const f of serialized.flashcards) {
      expect((f as any)._meta).toBeUndefined();
      expect(f).toHaveProperty('id');
      expect(f).toHaveProperty('front');
      expect(f).toHaveProperty('back');
      expect(f).toHaveProperty('requirement_ids');
    }
  });

  it('passes strict AppendixAKitSchema validation', () => {
    const serialized = serializeToAppendixA(internalKitWithMeta);
    const parsed = AppendixAKitSchema.safeParse(serialized);
    expect(parsed.success).toBe(true);
  });

  it('throws AppendixASerializationError when given invalid/null data', () => {
    expect(() => serializeToAppendixA(null)).toThrow(AppendixASerializationError);
    expect(() => serializeToAppendixA(undefined)).toThrow(AppendixASerializationError);
  });
});
