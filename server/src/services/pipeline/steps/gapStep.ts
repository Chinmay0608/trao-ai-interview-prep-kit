import { LLMProvider, Requirement, Question, CompanyBrief, generateQuestionId } from '@trao/shared';
import { QuestionsOutputSchema, QuestionsOutputType } from '../schemas.js';

export async function executeGapGenerationStep(
  uncoveredMustReqs: Requirement[],
  existingQuestions: Question[],
  evidenceMap: Record<string, string>,
  roleTitle: string,
  seniority: string,
  companyBrief: CompanyBrief,
  llmProvider: LLMProvider
): Promise<Question[]> {
  if (uncoveredMustReqs.length === 0) {
    return [];
  }

  const gapDescriptions = uncoveredMustReqs
    .map(
      (r) =>
        `[REQUIRED MUST-HAVE ID: ${r.id}] (${r.kind.toUpperCase()}): "${r.text}"\n  Evidence from JD: "${evidenceMap[r.id] || r.text}"`
    )
    .join('\n\n');

  const systemPrompt = `You are a Technical Assessment Specialist performing a targeted second-pass generation.
The following MUST-HAVE requirements currently lack interview questions in the candidate preparation kit.
Your task is to generate 1-2 focused, high-quality interview questions specifically targeting each missing requirement ID.

CRITICAL RULES:
- Every question MUST explicitly set requirement_ids to include the target requirement ID it addresses.
- Match requirement kind: technical requirements MUST produce technical or system-design questions; behavioural/leadership requirements MUST produce behavioural questions.
- Assign appropriate difficulty (1 to 3).
- Provide concise, structured answer_outline guidance.`;

  const prompt = `Generate targeted interview questions to close the coverage gap for these uncovered MUST-HAVE requirements for a ${seniority} ${roleTitle}:

--- UNCOVERED MUST-HAVE REQUIREMENTS ---
${gapDescriptions}

--- COMPANY CONTEXT ---
${companyBrief.summary}
----------------------------------------`;

  let output: QuestionsOutputType;
  try {
    output = await llmProvider.generateStructured({
      prompt,
      systemPrompt,
      schema: QuestionsOutputSchema,
      schemaName: 'TargetedGapQuestionsOutput',
      temperature: 0.2,
    });
  } catch {
    // If second pass LLM fails, return empty array rather than failing the whole pipeline
    return [];
  }

  const targetReqIds = new Set(uncoveredMustReqs.map((r) => r.id));
  const existingPromptSet = new Set(
    existingQuestions.map((q) => q.prompt.trim().toLowerCase().replace(/\s+/g, ' '))
  );

  const newQuestions: Question[] = [];

  for (const item of output.questions) {
    const validTargets = item.requirement_ids.filter((id) => targetReqIds.has(id));
    if (validTargets.length === 0) {
      continue;
    }

    const normPrompt = item.prompt.trim().toLowerCase().replace(/\s+/g, ' ');
    if (existingPromptSet.has(normPrompt)) {
      continue;
    }
    existingPromptSet.add(normPrompt);

    newQuestions.push({
      id: generateQuestionId(),
      requirement_ids: validTargets,
      category: item.category,
      prompt: item.prompt.trim(),
      answer_outline: item.answer_outline.trim(),
      difficulty: item.difficulty,
    });
  }

  return newQuestions;
}
