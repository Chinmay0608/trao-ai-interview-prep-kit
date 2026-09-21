import { Requirement, Question, Coverage } from '../types/kit.js';

/**
 * Detailed coverage metrics and mapping structure.
 */
export interface CoverageResult {
  coveredRequirementIds: string[];
  uncoveredRequirementIds: string[];
  coveredMustIds: string[];
  uncoveredMustIds: string[];
  coveredNiceIds: string[];
  uncoveredNiceIds: string[];
  mustCoveragePercentage: number;
  niceCoveragePercentage: number;
  overallCoveragePercentage: number;
  requirementToQuestionIds: Record<string, string[]>;
  toAppendixACoverage: (passes: number) => Coverage;
}

/**
 * Deterministically calculates requirement coverage from the question bank.
 *
 * Rules:
 * - A requirement is covered if and only if at least one valid question references it.
 * - Question references to non-existent requirement IDs are strictly ignored.
 * - All returned ID arrays are deterministically sorted.
 * - Pure function, no external I/O or LLM judgment.
 */
export function calculateCoverage(
  questionBank: Question[],
  requirements: Requirement[]
): CoverageResult {
  const validRequirementMap = new Map<string, Requirement>();
  for (const req of requirements) {
    validRequirementMap.set(req.id, req);
  }

  // Initialize mapping for all valid requirements
  const requirementToQuestionIds: Record<string, string[]> = {};
  for (const req of requirements) {
    requirementToQuestionIds[req.id] = [];
  }

  // Populate references, ignoring invalid / non-existent requirement IDs
  for (const question of questionBank) {
    for (const reqId of question.requirement_ids) {
      if (validRequirementMap.has(reqId)) {
        if (!requirementToQuestionIds[reqId].includes(question.id)) {
          requirementToQuestionIds[reqId].push(question.id);
        }
      }
    }
  }

  // Ensure deterministic sort for question IDs within each requirement
  for (const reqId of Object.keys(requirementToQuestionIds)) {
    requirementToQuestionIds[reqId].sort((a, b) => a.localeCompare(b));
  }

  const coveredRequirementIds: string[] = [];
  const uncoveredRequirementIds: string[] = [];
  const coveredMustIds: string[] = [];
  const uncoveredMustIds: string[] = [];
  const coveredNiceIds: string[] = [];
  const uncoveredNiceIds: string[] = [];

  for (const req of requirements) {
    const isCovered = requirementToQuestionIds[req.id].length > 0;
    if (isCovered) {
      coveredRequirementIds.push(req.id);
      if (req.priority === 'must') {
        coveredMustIds.push(req.id);
      } else {
        coveredNiceIds.push(req.id);
      }
    } else {
      uncoveredRequirementIds.push(req.id);
      if (req.priority === 'must') {
        uncoveredMustIds.push(req.id);
      } else {
        uncoveredNiceIds.push(req.id);
      }
    }
  }

  // Deterministic sorting of all lists
  coveredRequirementIds.sort((a, b) => a.localeCompare(b));
  uncoveredRequirementIds.sort((a, b) => a.localeCompare(b));
  coveredMustIds.sort((a, b) => a.localeCompare(b));
  uncoveredMustIds.sort((a, b) => a.localeCompare(b));
  coveredNiceIds.sort((a, b) => a.localeCompare(b));
  uncoveredNiceIds.sort((a, b) => a.localeCompare(b));

  const totalMust = coveredMustIds.length + uncoveredMustIds.length;
  const totalNice = coveredNiceIds.length + uncoveredNiceIds.length;
  const totalReqs = requirements.length;

  const mustCoveragePercentage =
    totalMust === 0 ? 100 : Math.round((coveredMustIds.length / totalMust) * 100);
  const niceCoveragePercentage =
    totalNice === 0 ? 100 : Math.round((coveredNiceIds.length / totalNice) * 100);
  const overallCoveragePercentage =
    totalReqs === 0 ? 100 : Math.round((coveredRequirementIds.length / totalReqs) * 100);

  return {
    coveredRequirementIds,
    uncoveredRequirementIds,
    coveredMustIds,
    uncoveredMustIds,
    coveredNiceIds,
    uncoveredNiceIds,
    mustCoveragePercentage,
    niceCoveragePercentage,
    overallCoveragePercentage,
    requirementToQuestionIds,
    toAppendixACoverage: (passes: number): Coverage => ({
      uncovered_requirement_ids: [...uncoveredRequirementIds],
      passes,
    }),
  };
}

/**
 * Deterministically returns uncovered must-have requirements suitable for
 * targeted second-pass generation.
 */
export function findCoverageGaps(
  requirements: Requirement[],
  coverage: CoverageResult
): Requirement[] {
  const uncoveredMustSet = new Set(coverage.uncoveredMustIds);
  return requirements
    .filter((req) => req.priority === 'must' && uncoveredMustSet.has(req.id))
    .sort((a, b) => a.id.localeCompare(b.id));
}
