import { LLMProvider, Question, Requirement, Flashcard, generateQuestionId } from '@trao/shared';
import { FlashcardsOutputSchema, FlashcardsOutputType } from '../schemas.js';

export async function executeFlashcardStep(
  finalQuestions: Question[],
  requirements: Requirement[],
  llmProvider: LLMProvider
): Promise<Flashcard[]> {
  if (finalQuestions.length === 0) {
    return [];
  }

  const questionContext = finalQuestions
    .slice(0, 15) // Top questions for active-recall flashcard synthesis
    .map(
      (q) =>
        `[Question ID: ${q.id}] [Category: ${q.category}] [Requirements: ${q.requirement_ids.join(', ')}]\nQ: ${q.prompt}\nKey Answer Outline: ${q.answer_outline}`
    )
    .join('\n\n');

  const systemPrompt = `You are an Active Recall Learning Expert creating rapid-review interview flashcards.
Your task is to generate concise, high-impact flashcards based on the finalized interview questions and requirements.
- "front": A clear, sharp question or technical/behavioural concept prompt.
- "back": A concise, bulleted or direct answer outline highlighting core principles.
- "requirement_ids": Array of requirement IDs covered by this flashcard (must match provided requirements).

CRITICAL RULES:
- Flashcards must be rapid to review (front < 30 words, back < 80 words).
- Every flashcard must reference at least one valid Requirement ID.`;

  const prompt = `Generate an active-recall flashcard deck based on these finalized interview questions:

--- FINAL INTERVIEW QUESTIONS ---
${questionContext}
---------------------------------`;

  let output: FlashcardsOutputType;
  try {
    output = await llmProvider.generateStructured({
      prompt,
      systemPrompt,
      schema: FlashcardsOutputSchema,
      schemaName: 'FlashcardsOutput',
      temperature: 0.2,
    });
  } catch {
    // If LLM fails, generate deterministic flashcards from questions directly
    return finalQuestions.slice(0, 5).map((q) => ({
      id: generateQuestionId().replace('q_', 'f_'),
      front: q.prompt,
      back: q.answer_outline,
      requirement_ids: [...q.requirement_ids],
    }));
  }

  const validReqIds = new Set(requirements.map((r) => r.id));
  const flashcards: Flashcard[] = [];

  for (const card of output.flashcards) {
    const validLinkedReqs = card.requirement_ids.filter((id) => validReqIds.has(id));
    if (validLinkedReqs.length === 0) {
      // Fallback to first requirement if none valid
      validLinkedReqs.push(requirements[0]?.id || 'r1');
    }

    flashcards.push({
      id: generateQuestionId().replace('q_', 'f_'),
      front: card.front.trim(),
      back: card.back.trim(),
      requirement_ids: validLinkedReqs,
    });
  }

  return flashcards;
}
