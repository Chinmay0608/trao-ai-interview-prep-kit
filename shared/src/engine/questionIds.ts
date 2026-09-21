import { customAlphabet } from 'nanoid';

// Clean alphanumeric alphabet (lowercase + numbers) for stable, readable IDs
const nanoid8 = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);

/**
 * Generates a globally unique question ID in the format: q_${nanoid(8)}
 * Ensures collision avoidance if existingIds set is supplied.
 */
export function generateQuestionId(existingIds?: Set<string>): string {
  let id = `q_${nanoid8()}`;
  if (existingIds) {
    while (existingIds.has(id)) {
      id = `q_${nanoid8()}`;
    }
  }
  return id;
}

/**
 * Generates a batch of unique question IDs, avoiding collisions with
 * existing IDs and within the generated batch itself.
 */
export function generateBatchQuestionIds(
  count: number,
  existingIds?: Set<string>
): string[] {
  const result: string[] = [];
  const seen = new Set<string>(existingIds ? Array.from(existingIds) : []);

  for (let i = 0; i < count; i++) {
    const newId = generateQuestionId(seen);
    seen.add(newId);
    result.push(newId);
  }

  return result;
}
