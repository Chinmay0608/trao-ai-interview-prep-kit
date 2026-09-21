import { Question, Requirement } from '../types/kit.js';

export interface RequirementContext {
  requirementsMap: Map<string, Requirement>;
  requirementToQuestionIds: Record<string, string[]>;
}

export interface QuestionScoreBreakdown {
  priorityMultiplier: number;
  difficulty: number;
  coverageImportance: number;
  categoryWeight: number;
  totalScore: number;
  hasMustHave: boolean;
  isSoleCoverage: boolean;
}

/**
 * Builds a RequirementContext from question bank and requirements.
 */
export function buildRequirementContext(
  questionBank: Question[],
  requirements: Requirement[]
): RequirementContext {
  const requirementsMap = new Map<string, Requirement>();
  const requirementToQuestionIds: Record<string, string[]> = {};

  for (const req of requirements) {
    requirementsMap.set(req.id, req);
    requirementToQuestionIds[req.id] = [];
  }

  for (const q of questionBank) {
    for (const rId of q.requirement_ids) {
      if (requirementsMap.has(rId)) {
        if (!requirementToQuestionIds[rId].includes(q.id)) {
          requirementToQuestionIds[rId].push(q.id);
        }
      }
    }
  }

  return { requirementsMap, requirementToQuestionIds };
}

/**
 * Deterministically computes the priority score for a question.
 *
 * Formula:
 * Score = PriorityMultiplier × Difficulty + CoverageImportance + CategoryWeight
 *
 * Approved Constants:
 * - PriorityMultiplier: 10 if question covers any must-have, 3 if only nice-to-have, 0 if none.
 * - Difficulty: integer 1, 2, or 3.
 * - CoverageImportance: +5 if question is the sole question covering any requirement it links to.
 * - CategoryWeight: +1 for system-design/technical, 0 for behavioural/company-fit (secondary factor only).
 */
export function calculateQuestionScore(
  question: Question,
  context: RequirementContext
): QuestionScoreBreakdown {
  const validLinkedReqs: Requirement[] = [];
  for (const rId of question.requirement_ids) {
    const req = context.requirementsMap.get(rId);
    if (req) {
      validLinkedReqs.push(req);
    }
  }

  const hasMustHave = validLinkedReqs.some((r) => r.priority === 'must');
  const hasNiceToHave = validLinkedReqs.some((r) => r.priority === 'nice');

  let priorityMultiplier = 0;
  if (hasMustHave) {
    priorityMultiplier = 10;
  } else if (hasNiceToHave) {
    priorityMultiplier = 3;
  }

  const difficulty = question.difficulty;

  // Sole coverage check: is this question the only one covering any of its linked requirements?
  let isSoleCoverage = false;
  for (const req of validLinkedReqs) {
    const questionsForReq = context.requirementToQuestionIds[req.id];
    if (questionsForReq && questionsForReq.length === 1 && questionsForReq[0] === question.id) {
      isSoleCoverage = true;
      break;
    }
  }

  const coverageImportance = isSoleCoverage ? 5 : 0;

  let categoryWeight = 0;
  if (question.category === 'system-design' || question.category === 'technical') {
    categoryWeight = 1;
  }

  const totalScore = priorityMultiplier * difficulty + coverageImportance + categoryWeight;

  return {
    priorityMultiplier,
    difficulty,
    coverageImportance,
    categoryWeight,
    totalScore,
    hasMustHave,
    isSoleCoverage,
  };
}

/**
 * Deterministically compares two questions for schedule allocation.
 *
 * Stable Tie-breakers:
 * 1. Total score (descending)
 * 2. Must-have presence (must before nice)
 * 3. Difficulty (descending)
 * 4. Sole coverage (true before false)
 * 5. Stable question ID (ascending lexicographical)
 */
export function compareQuestionsDeterministic(
  a: Question,
  b: Question,
  context: RequirementContext
): number {
  const scoreA = calculateQuestionScore(a, context);
  const scoreB = calculateQuestionScore(b, context);

  // 1. Higher total score first
  if (scoreB.totalScore !== scoreA.totalScore) {
    return scoreB.totalScore - scoreA.totalScore;
  }

  // 2. Must-have before nice-to-have
  if (scoreA.hasMustHave !== scoreB.hasMustHave) {
    return scoreA.hasMustHave ? -1 : 1;
  }

  // 3. Higher difficulty first
  if (b.difficulty !== a.difficulty) {
    return b.difficulty - a.difficulty;
  }

  // 4. Sole coverage first
  if (scoreA.isSoleCoverage !== scoreB.isSoleCoverage) {
    return scoreA.isSoleCoverage ? -1 : 1;
  }

  // 5. Stable question ID tie-breaker
  return a.id.localeCompare(b.id);
}
