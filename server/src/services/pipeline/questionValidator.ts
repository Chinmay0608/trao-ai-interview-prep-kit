import { Question, Requirement, QuestionCategory, LLMProvider } from '@trao/shared';
import { CandidateQuestionSchema } from './schemas.js';

export interface QuestionValidationIssue {
  question: Question;
  reasons: string[];
}

export interface QuestionBankValidationResult {
  valid: Question[];
  invalid: QuestionValidationIssue[];
}

/**
 * Normalized token overlap calculation between prompt and requirement text.
 */
export function calculateNormalizedTokenOverlap(prompt: string, requirementText: string): number {
  const cleanP = prompt.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  const cleanR = requirementText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2);

  if (cleanR.length === 0) return 0;

  const rSet = new Set(cleanR);
  let matchCount = 0;
  for (const token of cleanP) {
    if (rSet.has(token)) {
      matchCount++;
    }
  }

  return matchCount / cleanR.length;
}

/**
 * Checks whether text contains blatant internal requirement/question ID leakage.
 */
export function hasLeakedInternalIds(text: string): boolean {
  // Matches [ID: r1], (ID: r2), requirement r1, q_abc12345, etc.
  if (/\[(?:ID:\s*)?r\d+\]/i.test(text)) return true;
  if (/\b(?:ID|requirement|ref)\s*[:=]?\s*r\d+\b/i.test(text)) return true;
  if (/\bq_[a-zA-Z0-9]{6,}\b/.test(text)) return true;
  return false;
}

/**
 * Checks for known robotic template artifacts.
 */
export function detectTemplateArtifacts(
  prompt: string,
  reqs: Requirement[]
): string[] {
  const artifacts: string[] = [];

  // Known copy-paste prefixes
  if (/\bin-depth technical scenario regarding/i.test(prompt)) {
    artifacts.push('Contains boilerplate "In-depth technical scenario regarding" artifact.');
  }

  if (/\bexplain your experience and approach to/i.test(prompt)) {
    artifacts.push('Contains boilerplate "Explain your experience and approach to" artifact.');
  }

  if (/\bregarding\s+(?:A\s+|The\s+|Experience\s+|Proven\s+|Strong\s+|Ability\s+|Core\s+)/i.test(prompt)) {
    artifacts.push('Contains mechanical "regarding <Requirement>" artifact.');
  }

  // Blind architecture boilerplate on non-architecture requirements
  const hasArchitectClause = /\bhow would you architect (?:this|the|a) system\b/i.test(prompt);
  if (hasArchitectClause) {
    const isGenuinelyArchitectural = reqs.some((r) => {
      const lower = r.text.toLowerCase();
      return (
        r.kind === 'technical' &&
        (lower.includes('architect') ||
          lower.includes('distributed') ||
          lower.includes('scalability') ||
          lower.includes('high-throughput') ||
          lower.includes('microservice') ||
          lower.includes('infrastructure'))
      );
    });

    if (!isGenuinelyArchitectural) {
      artifacts.push('Contains ungrounded "How would you architect this system?" on non-architecture requirement.');
    }
  }

  return artifacts;
}

/**
 * Checks for clear semantic/category incompatibility between question and referenced requirements.
 * Does NOT enforce rigid 1-to-1 mapping (e.g. project questions for behavioural reqs are valid).
 */
export function checkSemanticCategoryCompatibility(
  question: Question,
  reqs: Requirement[]
): string | null {
  const isPurelyBehavioural = reqs.every((r) => r.kind === 'behavioural');
  const lowerPrompt = question.prompt.toLowerCase();

  // If requirement is purely behavioural (e.g. feedback, collaboration, teamwork, mentorship)
  if (isPurelyBehavioural) {
    // If the question is categorized as system-design and asks purely about distributed infrastructure
    // with no assessment of collaboration, team, conflict, or feedback -> INCOMPATIBLE.
    if (question.category === 'system-design') {
      const hasBehaviouralAspect =
        lowerPrompt.includes('team') ||
        lowerPrompt.includes('feedback') ||
        lowerPrompt.includes('collaborat') ||
        lowerPrompt.includes('disagree') ||
        lowerPrompt.includes('mentor') ||
        lowerPrompt.includes('conflict');

      if (!hasBehaviouralAspect) {
        return 'Purely behavioural requirement produced unrelated system-design question without collaboration/feedback assessment.';
      }
    }
  }

  return null;
}

/**
 * Validates an individual question against referenced requirements.
 */
export function validateQuestion(
  question: Question,
  requirementsMap: Map<string, Requirement>
): string[] {
  const reasons: string[] = [];

  // 1. Non-empty and natural length
  if (!question.prompt || question.prompt.trim().length < 15) {
    reasons.push('Prompt is empty or excessively short (< 15 characters).');
  }

  if (!question.answer_outline || question.answer_outline.trim().length < 15) {
    reasons.push('Answer outline is empty or excessively short (< 15 characters).');
  }

  // 2. Referenced requirements exist
  if (!question.requirement_ids || question.requirement_ids.length === 0) {
    reasons.push('Question does not link to any requirement ID.');
  } else {
    const missing = question.requirement_ids.filter((id) => !requirementsMap.has(id));
    if (missing.length > 0) {
      reasons.push(`Question links to non-existent requirement ID(s): ${missing.join(', ')}.`);
    }
  }

  const linkedReqs = (question.requirement_ids || [])
    .map((id) => requirementsMap.get(id))
    .filter((r): r is Requirement => Boolean(r));

  // 3. No leaked internal IDs
  if (hasLeakedInternalIds(question.prompt) || hasLeakedInternalIds(question.answer_outline)) {
    reasons.push('Question leaks raw internal requirement or question IDs in user-visible text.');
  }

  // 4. Template artifacts & excessive verbatim copying
  if (linkedReqs.length > 0) {
    const templateIssues = detectTemplateArtifacts(question.prompt, linkedReqs);
    reasons.push(...templateIssues);

    // Check if prompt simply copies a requirement clause verbatim
    for (const req of linkedReqs) {
      if (req.text.length > 25) {
        // If requirement text appears verbatim as a substring of prompt
        const cleanReq = req.text.trim().toLowerCase();
        const cleanPrompt = question.prompt.trim().toLowerCase();
        if (cleanPrompt.includes(cleanReq)) {
          reasons.push(`Question mechanically copies requirement "${req.text.slice(0, 30)}..." verbatim.`);
        }
      }
    }

    // 5. Semantic / category compatibility check (non-rigid)
    const categoryIssue = checkSemanticCategoryCompatibility(question, linkedReqs);
    if (categoryIssue) {
      reasons.push(categoryIssue);
    }
  }

  return reasons;
}

/**
 * Validates a full question bank.
 */
export function validateQuestionBank(
  questions: Question[],
  requirements: Requirement[]
): QuestionBankValidationResult {
  const reqMap = new Map(requirements.map((r) => [r.id, r]));
  const valid: Question[] = [];
  const invalid: QuestionValidationIssue[] = [];

  for (const q of questions) {
    const reasons = validateQuestion(q, reqMap);
    if (reasons.length === 0) {
      valid.push(q);
    } else {
      invalid.push({ question: q, reasons });
    }
  }

  return { valid, invalid };
}

/**
 * Deterministic category-aware fallback for questions when LLM regeneration fails or exhausts attempts.
 * Guarantees coverage preservation, natural phrasing, no leaked IDs, and valid Appendix A compliance.
 */
export function createDeterministicFallbackQuestion(
  invalidQuestion: Question,
  requirements: Requirement[]
): Question {
  const reqMap = new Map(requirements.map((r) => [r.id, r]));
  const primaryReq = invalidQuestion.requirement_ids
    .map((id) => reqMap.get(id))
    .find(Boolean) || requirements[0];

  const kind = primaryReq?.kind || 'technical';
  let category: QuestionCategory = invalidQuestion.category;
  let prompt: string;
  let answer_outline: string;

  if (kind === 'behavioural') {
    category = 'behavioural';
    prompt = 'Tell me about a project or team experience that demonstrated this skill. What specific actions did you take, and what was the outcome?';
    answer_outline = 'Candidate should use STAR format: clear context, specific personal contribution, proactive communication, and measurable team impact.';
  } else if (kind === 'domain') {
    category = 'company-fit';
    prompt = 'How have you explored or applied this domain knowledge in your previous work or coursework? What unique constraints did you consider?';
    answer_outline = 'Evaluate candidate understanding of real-world domain constraints, user requirements, and practical application depth.';
  } else {
    category = category === 'system-design' ? 'system-design' : 'technical';
    prompt = 'Walk me through a project where you applied this technical concept. What architectural and implementation trade-offs did you evaluate?';
    answer_outline = 'Look for clear technical rationale, data flow breakdown, testing strategies, edge case handling, and awareness of alternatives.';
  }

  return {
    id: invalidQuestion.id,
    requirement_ids: invalidQuestion.requirement_ids.length > 0
      ? invalidQuestion.requirement_ids
      : [primaryReq.id],
    category,
    prompt,
    answer_outline,
    difficulty: invalidQuestion.difficulty || 2,
  };
}

/**
 * Regenerates a single invalid question with targeted corrective instructions.
 */
export async function regenerateSingleInvalidQuestion(
  invalidQuestion: Question,
  reasons: string[],
  requirements: Requirement[],
  roleTitle: string,
  seniority: string,
  llmProvider: LLMProvider
): Promise<Question> {
  const reqMap = new Map(requirements.map((r) => [r.id, r]));
  const linkedReqs = invalidQuestion.requirement_ids
    .map((id) => reqMap.get(id))
    .filter((r): r is Requirement => Boolean(r));

  const primaryReq = linkedReqs[0] || requirements[0];
  const reqContextStr = linkedReqs.length > 0
    ? linkedReqs.map((r) => `- [${r.id}] (${r.kind}): ${r.text}`).join('\n')
    : `- [${primaryReq.id}] (${primaryReq.kind}): ${primaryReq.text}`;

  const targetCategory = primaryReq.kind === 'behavioural'
    ? 'behavioural'
    : primaryReq.kind === 'domain'
    ? 'company-fit'
    : invalidQuestion.category === 'system-design'
    ? 'system-design'
    : 'technical';

  const systemPrompt = `You are a Principal Interviewer correcting an interview question.
The previous question had these quality validation issues:
${reasons.map((r) => `* ${r}`).join('\n')}

CRITICAL CORRECTION RULES:
1. Treat the requirement as BACKGROUND CONTEXT, NOT text to copy or quote into the question prompt.
2. Produce a natural, grammatically sound question that directly assesses the candidate on the concept.
3. Category must be "${targetCategory}".
4. DO NOT copy the requirement text mechanically.
5. DO NOT say "regarding <requirement>" or append "How would you architect this system?" unless it is a genuine distributed architecture requirement.
6. DO NOT leak internal IDs like "r1" or "[ID: r1]" into the question text.
7. Return valid JSON matching the schema.`;

  const prompt = `Generate a single natural interview question for a ${seniority} ${roleTitle} targeting:
${reqContextStr}`;

  const generated = await llmProvider.generateStructured({
    prompt,
    systemPrompt,
    schema: CandidateQuestionSchema,
    schemaName: 'CorrectiveSingleQuestion',
    temperature: 0.3,
  });

  return {
    id: invalidQuestion.id,
    requirement_ids: invalidQuestion.requirement_ids,
    category: generated.category || targetCategory,
    prompt: generated.prompt.trim(),
    answer_outline: generated.answer_outline.trim(),
    difficulty: generated.difficulty || invalidQuestion.difficulty || 2,
  };
}
