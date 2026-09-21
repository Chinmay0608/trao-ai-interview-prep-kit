import { LLMProvider, Requirement, Question, CompanyBrief, generateQuestionId } from '@trao/shared';
import { QuestionsOutputSchema, QuestionsOutputType } from '../schemas.js';
import { PipelineExecutionError } from '../types.js';

export async function executeQuestionGenerationStep(
  requirements: Requirement[],
  responsibilities: string[],
  roleTitle: string,
  seniority: string,
  companyBrief: CompanyBrief,
  llmProvider: LLMProvider
): Promise<Question[]> {
  const reqListStr = requirements
    .map((r) => `[ID: ${r.id}] (${r.kind.toUpperCase()} | ${r.priority.toUpperCase()}): ${r.text}`)
    .join('\n');

  const systemPrompt = `You are a Principal Hiring Architect generating an interview question bank.
Your task is to generate realistic, in-depth interview questions across four categories:
1. "technical": Core coding, architecture, languages, algorithms, data structures.
2. "system-design": High-scale distributed systems, latency, storage, database partitioning, API design.
3. "behavioural": Leadership, mentorship, cross-team conflict, ambiguous specifications, STAR format questions.
4. "company-fit": Company alignment, domain problem solving, motivations.

CRITICAL RULES:
- Every question MUST reference at least one valid Requirement ID (e.g. ["r1"]) from the provided list.
- A requirement like "5+ years React" must lead to technical questions, while "Mentoring juniors" leads to behavioural questions.
- difficulty MUST be an integer: 1 (Fundamental), 2 (Intermediate/Applied), or 3 (Advanced/Architectural).
- answer_outline MUST provide concise, structured evaluation criteria for the interviewer.`;

  const prompt = `Generate an interview question bank for a ${seniority} ${roleTitle}.

--- REQUIREMENTS ---
${reqListStr}

--- ROLE RESPONSIBILITIES ---
${responsibilities.join('\n') || 'General engineering responsibilities.'}

--- COMPANY CONTEXT ---
${companyBrief.summary}
What they do: ${companyBrief.what_they_do}
-----------------------`;

  let output: QuestionsOutputType;
  try {
    output = await llmProvider.generateStructured({
      prompt,
      systemPrompt,
      schema: QuestionsOutputSchema,
      schemaName: 'InitialQuestionsOutput',
      temperature: 0.3,
    });
  } catch (err: any) {
    throw new PipelineExecutionError('GENERATING_QUESTIONS', `Question generation failed: ${err.message}`, err);
  }

  const validReqIds = new Set(requirements.map((r) => r.id));
  const seenPrompts = new Map<string, Question>();
  const questions: Question[] = [];

  for (const item of output.questions) {
    // Filter requirement IDs to only valid ones
    const linkedReqs = item.requirement_ids.filter((id) => validReqIds.has(id));
    if (linkedReqs.length === 0) {
      continue; // Skip questions with zero valid requirement links
    }

    // Deduplicate by normalized prompt
    const normPrompt = item.prompt.trim().toLowerCase().replace(/\s+/g, ' ');
    if (seenPrompts.has(normPrompt)) {
      const existing = seenPrompts.get(normPrompt)!;
      // Merge requirement IDs
      for (const rId of linkedReqs) {
        if (!existing.requirement_ids.includes(rId)) {
          existing.requirement_ids.push(rId);
        }
      }
      continue;
    }

    const newQuestion: Question = {
      id: generateQuestionId(),
      requirement_ids: linkedReqs,
      category: item.category,
      prompt: item.prompt.trim(),
      answer_outline: item.answer_outline.trim(),
      difficulty: item.difficulty,
    };

    seenPrompts.set(normPrompt, newQuestion);
    questions.push(newQuestion);
  }

  return questions;
}
