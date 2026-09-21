import { describe, it, expect } from 'vitest';
import { generateQuestionId, generateBatchQuestionIds } from '../shared/src/index.js';

describe('Phase 2: Collision-Proof Question ID Generator', () => {
  it('generates IDs matching the q_${nanoid(8)} format', () => {
    const id = generateQuestionId();
    expect(id).toMatch(/^q_[a-z0-9]{8}$/);
  });

  it('generates unique IDs across a batch of 1,000 IDs without collisions', () => {
    const batch = generateBatchQuestionIds(1000);
    expect(batch).toHaveLength(1000);
    const uniqueSet = new Set(batch);
    expect(uniqueSet.size).toBe(1000);
  });

  it('never generates an ID that exists in the supplied existingIds set', () => {
    const existing = new Set(['q_existing1', 'q_existing2']);
    const newId = generateQuestionId(existing);
    expect(existing.has(newId)).toBe(false);

    const batch = generateBatchQuestionIds(50, existing);
    for (const id of batch) {
      expect(existing.has(id)).toBe(false);
    }
  });
});
