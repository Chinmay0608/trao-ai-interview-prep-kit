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
Your task is to generate realistic, natural interview questions across four categories:
1. "technical": project walkthroughs, debugging scenarios, programming fundamentals, implementation decisions, testing, trade-offs, practical coding patterns (reserve architecture for high-scale distributed systems requirements).
2. "system-design": high-scale distributed systems, latency, storage, database partitioning, API design.
3. "behavioural": STAR-style experience, teamwork, receiving/giving feedback, handling disagreement, learning unfamiliar technology, ownership, communication.
4. "company-fit": company alignment, domain problem solving, mission motivation, practical constraints.

CRITICAL QUALITY RULES:
- Requirements are BACKGROUND CONTEXT, NOT text to copy or quote into the question prompt.
- NEVER mechanically paste requirement text into questions. DO NOT write questions like:
  "Explain your experience and approach to <requirement text>" or "In-depth technical scenario regarding <requirement text>. How would you architect this system?".
- Questions must sound like real human interview questions: grammatically natural, conversational, directly testing candidate competency.
- Behavioural requirements (e.g. teamwork, feedback, communication) must produce natural behavioural/STAR questions (e.g. "Tell me about a time you received critical feedback from a teammate..."), NEVER ungrounded distributed architecture questions.
- Every question MUST reference at least one valid Requirement ID (e.g. ["r1"]) from the provided list.
- DO NOT leak internal IDs like "r1" or "[ID: r1]" into the question text.
- difficulty MUST be an integer: 1 (Fundamental), 2 (Intermediate/Applied), or 3 (Advanced/Architectural).
- answer_outline MUST provide concise, structured evaluation criteria for the interviewer.
- Return a JSON object with this shape: { "questions": [ { "category": "technical"|"system-design"|"behavioural"|"company-fit", "prompt": string, "answer_outline": string, "difficulty": 1|2|3, "requirement_ids": string[] } ] }`;

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
