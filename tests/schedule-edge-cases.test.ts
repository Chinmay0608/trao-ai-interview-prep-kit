import { describe, it, expect } from 'vitest';
import {
  allocateSchedule,
  Question,
  Requirement,
  MissingMustHaveCoverageError,
  InvalidDaysAvailableError,
  calculateQuestionScore,
  buildRequirementContext,
} from '../shared/src/index.js';

describe('Phase 2: Deterministic Schedule Engine & Edge Cases', () => {
  const sampleRequirements: Requirement[] = [
    { id: 'r1', text: '5+ years Node.js and distributed systems', kind: 'technical', priority: 'must' },
    { id: 'r2', text: 'Mentorship and leadership track record', kind: 'behavioural', priority: 'must' },
    { id: 'r3', text: 'Docker and CI/CD automation', kind: 'technical', priority: 'nice' },
    { id: 'r4', text: 'Domain knowledge in e-commerce workflows', kind: 'domain', priority: 'nice' },
  ];

  const sampleQuestions: Question[] = [
    {
      id: 'q1',
      requirement_ids: ['r1'],
      category: 'technical',
      prompt: 'How do you structure microservices in Node.js?',
      answer_outline: 'Event-driven architecture and clean architecture layers.',
      difficulty: 3,
    },
    {
      id: 'q2',
      requirement_ids: ['r2'],
      category: 'behavioural',
      prompt: 'Describe how you resolved a conflict between two engineers on system design.',
      answer_outline: 'STAR response highlighting active listening and design RFC consensus.',
      difficulty: 2,
    },
    {
      id: 'q3',
      requirement_ids: ['r3'],
      category: 'technical',
      prompt: 'Explain multi-stage Docker builds.',
      answer_outline: 'Separating builder stage from lean production runner image.',
      difficulty: 1,
    },
    {
      id: 'q4',
      requirement_ids: ['r4'],
      category: 'company-fit',
      prompt: 'How do you handle inventory race conditions in checkout?',
      answer_outline: 'Optimistic locking, Redis distributed locks, or transactional reservations.',
      difficulty: 2,
    },
  ];

  it('verifies question scoring dominates: must-have behavioural outranks nice-to-have technical', () => {
    const context = buildRequirementContext(sampleQuestions, sampleRequirements);
    const scoreQ2 = calculateQuestionScore(sampleQuestions[1], context); // must-have behavioural, diff 2
    const scoreQ3 = calculateQuestionScore(sampleQuestions[2], context); // nice-to-have technical, diff 1

    expect(scoreQ2.hasMustHave).toBe(true);
    expect(scoreQ3.hasMustHave).toBe(false);
    expect(scoreQ2.totalScore).toBeGreaterThan(scoreQ3.totalScore);
  });

  it('handles N = 1 (Single Intensive Day)', () => {
    const schedule = allocateSchedule(sampleQuestions, sampleRequirements, 1);

    expect(schedule.days_available).toBe(1);
    expect(schedule.days).toHaveLength(1);
    const day1 = schedule.days[0];
    expect(day1.day).toBe(1);
    expect(Number.isInteger(day1.minutes)).toBe(true);
    expect(day1.minutes).toBeGreaterThanOrEqual(30);

    // Must-have questions q1 and q2 must both be present
    expect(day1.question_ids).toContain('q1');
    expect(day1.question_ids).toContain('q2');
  });

  it('handles N = 5 (Standard Multi-Day Schedule)', () => {
    const schedule = allocateSchedule(sampleQuestions, sampleRequirements, 5);

    expect(schedule.days_available).toBe(5);
    expect(schedule.days).toHaveLength(5);

    // All days have integer minutes and non-empty questions
    for (const day of schedule.days) {
      expect(Number.isInteger(day.minutes)).toBe(true);
      expect(day.minutes).toBeGreaterThanOrEqual(30);
      expect(day.question_ids.length).toBeGreaterThan(0);
    }

    // Every must-have requirement must appear somewhere in the schedule
    const allScheduledQIds = new Set(schedule.days.flatMap((d) => d.question_ids));
    expect(allScheduledQIds).toContain('q1');
    expect(allScheduledQIds).toContain('q2');

    // Harder / higher-priority material lands earlier
    const day1QIds = schedule.days[0].question_ids;
    expect(day1QIds.some((id) => id === 'q1' || id === 'q2')).toBe(true);
  });

  it('handles N = 60 (Large Schedule with Spaced Repetition)', () => {
    const schedule = allocateSchedule(sampleQuestions, sampleRequirements, 60);

    expect(schedule.days_available).toBe(60);
    expect(schedule.days).toHaveLength(60);

    // Zero empty days in 60-day schedule!
    for (const day of schedule.days) {
      expect(day.question_ids.length).toBeGreaterThan(0);
      expect(Number.isInteger(day.minutes)).toBe(true);
      expect(day.day).toBeGreaterThanOrEqual(1);
      expect(day.day).toBeLessThanOrEqual(60);
    }

    // Must-haves appear in multiple spaced review days
    const q1Occurrences = schedule.days.filter((d) => d.question_ids.includes('q1'));
    const q2Occurrences = schedule.days.filter((d) => d.question_ids.includes('q2'));
    expect(q1Occurrences.length).toBeGreaterThan(1);
    expect(q2Occurrences.length).toBeGreaterThan(1);
  });

  it('handles questions < days (e.g. 2 questions for 7 days) without empty days', () => {
    // Only 2 questions covering must-haves
    const twoQuestions = [sampleQuestions[0], sampleQuestions[1]];
    const mustOnlyReqs = [sampleRequirements[0], sampleRequirements[1]];

    const schedule = allocateSchedule(twoQuestions, mustOnlyReqs, 7);

    expect(schedule.days_available).toBe(7);
    expect(schedule.days).toHaveLength(7);

    // Every day must have questions, using spaced review reuse
    for (const day of schedule.days) {
      expect(day.question_ids.length).toBeGreaterThan(0);
      expect(Number.isInteger(day.minutes)).toBe(true);
    }
  });

  it('handles questions >> days (e.g. 25 questions for 3 days) with prioritization', () => {
    // Create 20 questions
    const manyQuestions: Question[] = [
      ...sampleQuestions,
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `extra_nice_q_${i + 1}`,
        requirement_ids: ['r3', 'r4'],
        category: 'technical' as const,
        prompt: `Extra Prompt ${i + 1}`,
        answer_outline: `Extra Outline ${i + 1}`,
        difficulty: 1 as const,
      })),
    ];

    const schedule = allocateSchedule(manyQuestions, sampleRequirements, 3);

    expect(schedule.days_available).toBe(3);
    expect(schedule.days).toHaveLength(3);

    // Must-haves q1 and q2 are strictly preserved in schedule
    const allAssigned = new Set(schedule.days.flatMap((d) => d.question_ids));
    expect(allAssigned).toContain('q1');
    expect(allAssigned).toContain('q2');

    // Day durations remain reasonable and integer
    for (const day of schedule.days) {
      expect(day.minutes).toBeLessThanOrEqual(180);
      expect(Number.isInteger(day.minutes)).toBe(true);
    }
  });

  it('is 100% deterministic: running twice produces byte-for-byte identical schedules', () => {
    const run1 = allocateSchedule(sampleQuestions, sampleRequirements, 5);
    const run2 = allocateSchedule(sampleQuestions, sampleRequirements, 5);

    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });

  it('throws MissingMustHaveCoverageError when input questions do not cover must-haves', () => {
    // Missing question for r2 (must-have)
    const incompleteQuestions = [sampleQuestions[0], sampleQuestions[2]];

    expect(() => {
      allocateSchedule(incompleteQuestions, sampleRequirements, 5);
    }).toThrow(MissingMustHaveCoverageError);
  });

  it('throws InvalidDaysAvailableError when daysAvailable is invalid', () => {
    expect(() => {
      allocateSchedule(sampleQuestions, sampleRequirements, 0);
    }).toThrow(InvalidDaysAvailableError);

    expect(() => {
      allocateSchedule(sampleQuestions, sampleRequirements, -3);
    }).toThrow(InvalidDaysAvailableError);

    expect(() => {
      allocateSchedule(sampleQuestions, sampleRequirements, 4.5);
    }).toThrow(InvalidDaysAvailableError);
  });

  it('applies stable tie-breakers when questions have equal scores', () => {
    const tiedQ_A: Question = {
      id: 'q_alpha',
      requirement_ids: ['r1'],
      category: 'technical',
      prompt: 'Alpha',
      answer_outline: 'Out',
      difficulty: 2,
    };
    const tiedQ_B: Question = {
      id: 'q_beta',
      requirement_ids: ['r1'],
      category: 'technical',
      prompt: 'Beta',
      answer_outline: 'Out',
      difficulty: 2,
    };

    const questions = [tiedQ_B, tiedQ_A, sampleQuestions[1]];
    const schedule = allocateSchedule(questions, [sampleRequirements[0], sampleRequirements[1]], 2);

    // Stable tie-breaker: q_alpha before q_beta alphabetically
    const day1QIds = schedule.days[0].question_ids;
    if (day1QIds.includes('q_alpha') && day1QIds.includes('q_beta')) {
      const idxAlpha = day1QIds.indexOf('q_alpha');
      const idxBeta = day1QIds.indexOf('q_beta');
      expect(idxAlpha).toBeLessThan(idxBeta);
    }
  });
});
