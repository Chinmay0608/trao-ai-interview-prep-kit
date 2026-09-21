import { describe, it, expect } from 'vitest';
import {
  calculateCoverage,
  findCoverageGaps,
  Requirement,
  Question,
} from '../shared/src/index.js';

describe('Phase 2: Coverage Engine', () => {
  const sampleRequirements: Requirement[] = [
    { id: 'r1', text: '5+ years distributed systems', kind: 'technical', priority: 'must' },
    { id: 'r2', text: 'Mentoring experience', kind: 'behavioural', priority: 'must' },
    { id: 'r3', text: 'Kubernetes operators knowledge', kind: 'technical', priority: 'nice' },
    { id: 'r4', text: 'Fintech compliance knowledge', kind: 'domain', priority: 'nice' },
  ];

  it('calculates 100% coverage when all requirements are referenced', () => {
    const questions: Question[] = [
      {
        id: 'q1',
        requirement_ids: ['r1', 'r3'],
        category: 'technical',
        prompt: 'Distributed consensus?',
        answer_outline: 'Raft outline',
        difficulty: 3,
      },
      {
        id: 'q2',
        requirement_ids: ['r2'],
        category: 'behavioural',
        prompt: 'Mentoring story?',
        answer_outline: 'STAR answer',
        difficulty: 2,
      },
      {
        id: 'q3',
        requirement_ids: ['r4'],
        category: 'company-fit',
        prompt: 'Fintech regulations?',
        answer_outline: 'Compliance outline',
        difficulty: 1,
      },
    ];

    const result = calculateCoverage(questions, sampleRequirements);

    expect(result.coveredRequirementIds).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(result.uncoveredRequirementIds).toEqual([]);
    expect(result.coveredMustIds).toEqual(['r1', 'r2']);
    expect(result.uncoveredMustIds).toEqual([]);
    expect(result.coveredNiceIds).toEqual(['r3', 'r4']);
    expect(result.uncoveredNiceIds).toEqual([]);
    expect(result.mustCoveragePercentage).toBe(100);
    expect(result.niceCoveragePercentage).toBe(100);
    expect(result.overallCoveragePercentage).toBe(100);

    const gaps = findCoverageGaps(sampleRequirements, result);
    expect(gaps).toEqual([]);
  });

  it('detects uncovered must-have requirements as coverage gaps', () => {
    const questions: Question[] = [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'Distributed locks?',
        answer_outline: 'Redlock outline',
        difficulty: 2,
      },
      // r2 (must-have) is not covered
      {
        id: 'q3',
        requirement_ids: ['r3'],
        category: 'technical',
        prompt: 'K8s custom resource?',
        answer_outline: 'CRD outline',
        difficulty: 2,
      },
    ];

    const result = calculateCoverage(questions, sampleRequirements);

    expect(result.coveredMustIds).toEqual(['r1']);
    expect(result.uncoveredMustIds).toEqual(['r2']);
    expect(result.mustCoveragePercentage).toBe(50);
    expect(result.uncoveredRequirementIds).toEqual(['r2', 'r4']);

    const gaps = findCoverageGaps(sampleRequirements, result);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].id).toBe('r2');
    expect(gaps[0].priority).toBe('must');
  });

  it('tracks uncovered nice-to-have requirements without marking them as must-have gaps', () => {
    const questions: Question[] = [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'P1',
        answer_outline: 'A1',
        difficulty: 2,
      },
      {
        id: 'q2',
        requirement_ids: ['r2'],
        category: 'behavioural',
        prompt: 'P2',
        answer_outline: 'A2',
        difficulty: 2,
      },
      // r3 and r4 are nice-to-haves and uncovered
    ];

    const result = calculateCoverage(questions, sampleRequirements);

    expect(result.coveredMustIds).toEqual(['r1', 'r2']);
    expect(result.uncoveredMustIds).toEqual([]);
    expect(result.mustCoveragePercentage).toBe(100);
    expect(result.uncoveredNiceIds).toEqual(['r3', 'r4']);
    expect(result.niceCoveragePercentage).toBe(0);

    // Gaps only return must-haves for second pass targeting
    const gaps = findCoverageGaps(sampleRequirements, result);
    expect(gaps).toEqual([]);
  });

  it('ignores references to non-existent requirement IDs', () => {
    const questions: Question[] = [
      {
        id: 'q1',
        requirement_ids: ['r1', 'r999_fake', 'non_existent_id'],
        category: 'technical',
        prompt: 'P1',
        answer_outline: 'A1',
        difficulty: 2,
      },
    ];

    const result = calculateCoverage(questions, sampleRequirements);

    expect(result.coveredRequirementIds).toEqual(['r1']);
    expect(result.requirementToQuestionIds['r999_fake']).toBeUndefined();
    expect(result.requirementToQuestionIds['r1']).toEqual(['q1']);
  });

  it('produces byte-for-byte deterministic output regardless of question bank order', () => {
    const qA: Question = {
      id: 'q1',
      requirement_ids: ['r1'],
      category: 'technical',
      prompt: 'P1',
      answer_outline: 'A1',
      difficulty: 1,
    };
    const qB: Question = {
      id: 'q2',
      requirement_ids: ['r2'],
      category: 'behavioural',
      prompt: 'P2',
      answer_outline: 'A2',
      difficulty: 2,
    };

    const run1 = calculateCoverage([qA, qB], sampleRequirements);
    const run2 = calculateCoverage([qB, qA], sampleRequirements);

    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });
});
