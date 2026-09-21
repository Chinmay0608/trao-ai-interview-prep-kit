import mongoose from 'mongoose';
import {
  BuilderViewModel,
  QuestionCategory,
  QuestionDifficulty,
  InternalQuestion,
  InternalFlashcard,
  InternalPrepKit,
  calculateCoverage,
  findCoverageGaps,
  allocateSchedule,
  generateQuestionId,
  serializeToAppendixA,
  AppendixAKitSchema,
  LLMProvider,
} from '@trao/shared';
import { Kit, IKitDoc } from '../../db/models/Kit.js';
import { toBuilderViewModel } from '../../db/converters/kitConverter.js';
import {
  KitNotFoundError,
  StaleGenerationError,
  UnauthorizedAccessError,
  UnknownQuestionIdError,
} from '../jobs/errors.js';
import {
  QuestionsOutputSchema,
  QuestionsOutputType,
  FlashcardsOutputSchema,
  FlashcardsOutputType,
} from '../pipeline/schemas.js';

export interface RegenerateKitOptions {
  kitId: string;
  userId: string;
  category?: QuestionCategory;
  questionIds?: string[];
  generationVersion?: number;
  forceRefresh?: boolean;
  llmProvider: LLMProvider;
}

export class RegenerationService {
  /**
   * Executes targeted regeneration for a category or set of question IDs,
   * preserving edited, custom, and pinned questions while reconciling
   * flashcards, schedule, and coverage under optimistic concurrency.
   */
  public async regenerate(options: RegenerateKitOptions): Promise<BuilderViewModel> {
    const { kitId, userId, category, questionIds, llmProvider } = options;

    if (!mongoose.Types.ObjectId.isValid(kitId)) {
      throw new KitNotFoundError(kitId);
    }

    const kit = await Kit.findById(kitId);
    if (!kit) {
      throw new KitNotFoundError(kitId);
    }

    if (kit.userId.toString() !== userId) {
      throw new UnauthorizedAccessError('Kit', kitId);
    }

    if (!kit.internalKit) {
      throw new Error(`Kit ${kitId} does not have a generated prep kit yet.`);
    }

    if (
      options.generationVersion !== undefined &&
      kit.generationVersion !== options.generationVersion
    ) {
      throw new StaleGenerationError(
        kit._id.toString(),
        options.generationVersion,
        kit.generationVersion
      );
    }

    const currentKit = kit.internalKit;
    const existingQuestions = currentKit.questions;
    const allExistingIds = new Set(existingQuestions.map((q) => q.id));

    // Validate requested question IDs if provided
    if (questionIds && questionIds.length > 0) {
      for (const qId of questionIds) {
        if (!allExistingIds.has(qId)) {
          throw new UnknownQuestionIdError(qId);
        }
      }
    }

    // =========================================================================
    // 1. Partition Questions: Preserve vs. Discard
    // =========================================================================
    const preservedQuestions: InternalQuestion[] = [];
    const discardedQuestions: InternalQuestion[] = [];

    const targetIdsSet = questionIds ? new Set(questionIds) : null;

    for (const q of existingQuestions) {
      const inScope =
        (!category || q.category === category) &&
        (!targetIdsSet || targetIdsSet.has(q.id));

      if (!inScope) {
        // Outside scope -> Always preserve
        preservedQuestions.push(q);
        continue;
      }

      // Inside scope -> Check preservation rules
      // MUST PRESERVE: edited, custom, or pinned questions!
      const isPreserved =
        q._meta.origin === 'edited' ||
        q._meta.origin === 'custom' ||
        q._meta.pinned === true;

      if (isPreserved) {
        preservedQuestions.push(q);
      } else {
        // Pristine generated question in scope -> Discard and regenerate
        discardedQuestions.push(q);
      }
    }

    // If nothing to discard (e.g. all in-scope questions were edited or pinned), return intact
    if (discardedQuestions.length === 0) {
      return toBuilderViewModel(kit);
    }

    const countToGenerate = Math.max(1, discardedQuestions.length);
    const targetCategory = category || discardedQuestions[0]?.category || 'technical';

    // =========================================================================
    // 2. Generate Replacement Questions via LLM
    // =========================================================================
    const requirements = currentKit.role.requirements;
    const systemPrompt = `You are an expert technical interviewer regenerating interview questions for a candidate.
Target Category: "${targetCategory}"
Generate exactly ${countToGenerate} challenging, highly relevant questions.
Link each question to 1-3 relevant requirement IDs: [${requirements.map((r) => r.id).join(', ')}].`;

    const prompt = `Company: "${currentKit.company_brief.summary}"
Role: "${currentKit.role.title}" (${currentKit.role.seniority})
Regenerate ${countToGenerate} questions for category "${targetCategory}".`;

    let newGeneratedQuestions: InternalQuestion[] = [];
    try {
      const response: QuestionsOutputType = await llmProvider.generateStructured({
        prompt,
        systemPrompt,
        schema: QuestionsOutputSchema,
        schemaName: 'InitialQuestionsOutput',
        temperature: 0.3,
      });

      newGeneratedQuestions = response.questions.map((cand) => ({
        id: generateQuestionId(), // Guaranteed collision-resistant q_${nanoid(8)}
        requirement_ids: cand.requirement_ids.filter((id) =>
          requirements.some((r) => r.id === id)
        ),
        category: targetCategory,
        prompt: cand.prompt.trim(),
        answer_outline: cand.answer_outline.trim(),
        difficulty: (cand.difficulty as QuestionDifficulty) || 2,
        _meta: {
          origin: 'generated',
          pinned: false,
        },
      }));
    } catch {
      // Fallback if LLM fails: create deterministic question using requirements
      const req = requirements[0] || { id: 'r1', text: 'Software Engineering' };
      newGeneratedQuestions = [
        {
          id: generateQuestionId(),
          requirement_ids: [req.id],
          category: targetCategory,
          prompt: `Explain your experience and approach to ${req.text}.`,
          answer_outline: 'Provide specific architecture examples, trade-offs, and metrics.',
          difficulty: 2,
          _meta: {
            origin: 'generated',
            pinned: false,
          },
        },
      ];
    }

    // Combine preserved + newly generated questions
    let combinedQuestions = [...preservedQuestions, ...newGeneratedQuestions];

    // =========================================================================
    // 3. Coverage Re-check & Gap Closure
    // =========================================================================
    const coverage = calculateCoverage(combinedQuestions, requirements);
    const gaps = findCoverageGaps(requirements, coverage);

    if (gaps.length > 0) {
      // Create targeted questions closing uncovered must-haves
      for (const gap of gaps) {
        combinedQuestions.push({
          id: generateQuestionId(),
          requirement_ids: [gap.id],
          category: targetCategory,
          prompt: `In-depth technical scenario regarding ${gap.text}. How would you architect this system?`,
          answer_outline: 'Key patterns, edge cases, error handling, and reliability.',
          difficulty: 3,
          _meta: {
            origin: 'generated',
            pinned: false,
          },
        });
      }
    }

    // =========================================================================
    // 4. Flashcard Reconciliation
    // =========================================================================
    const discardedQuestionIds = new Set(discardedQuestions.map((q) => q.id));
    const discardedFlashcardIds = new Set(
      discardedQuestions.map((q) => q.id.replace('q_', 'f_'))
    );

    // Remove flashcards tied to discarded questions
    const preservedFlashcards = currentKit.flashcards.filter((f) => {
      const qId = (f as any).question_id || (f as any)._meta?.questionId;
      if (qId && discardedQuestionIds.has(qId)) return false;
      if (discardedFlashcardIds.has(f.id)) return false;
      if (discardedQuestionIds.has(f.id)) return false;
      return true;
    });

    // Generate fresh flashcards for the newly generated questions
    const newFlashcards: InternalFlashcard[] = newGeneratedQuestions.map((q) => {
      const shortFront =
        q.prompt.length > 80 ? q.prompt.slice(0, 77) + '...' : q.prompt;
      return {
        id: generateQuestionId().replace('q_', 'f_'),
        question_id: q.id,
        requirement_ids: [...q.requirement_ids],
        front: shortFront,
        back: q.answer_outline,
        _meta: {
          origin: 'generated',
          pinned: false,
          questionId: q.id,
        },
      } as any;
    });

    const reconciledFlashcards = [...preservedFlashcards, ...newFlashcards];

    // Invariant: every flashcard's requirements must exist in final requirements
    const validReqIds = new Set(requirements.map((r) => r.id));
    const validFlashcards = reconciledFlashcards.filter((fc) =>
      fc.requirement_ids.every((rId) => validReqIds.has(rId))
    );

    // =========================================================================
    // 5. Deterministic Schedule Reconciliation
    // =========================================================================
    const finalSchedule = allocateSchedule(
      combinedQuestions,
      requirements,
      kit.daysAvailable
    );

    const finalCoverage = calculateCoverage(combinedQuestions, requirements);

    const updatedInternalKit: InternalPrepKit = {
      ...currentKit,
      questions: combinedQuestions,
      flashcards: validFlashcards,
      schedule: finalSchedule,
      coverage: {
        uncovered_requirement_ids: finalCoverage.uncoveredMustIds,
        passes: (currentKit.coverage?.passes || 1) + 1,
      },
    };

    // =========================================================================
    // 6. Appendix A Validation immediately before persistence
    // =========================================================================
    const serializedForCheck = serializeToAppendixA(updatedInternalKit);
    AppendixAKitSchema.parse(serializedForCheck);

    // =========================================================================
    // 7. Optimistic Concurrency Save with generationVersion check
    // =========================================================================
    const updatedKit = await Kit.findOneAndUpdate(
      {
        _id: kit._id,
        generationVersion: kit.generationVersion,
      },
      {
        $set: {
          internalKit: updatedInternalKit,
          status: 'ready',
          updatedAt: new Date(),
        },
        $inc: {
          generationVersion: 1,
        },
      },
      { new: true }
    );

    if (!updatedKit) {
      const refreshed = await Kit.findById(kit._id);
      throw new StaleGenerationError(
        kit._id.toString(),
        kit.generationVersion,
        refreshed?.generationVersion
      );
    }

    return toBuilderViewModel(updatedKit);
  }
}

export const regenerationService = new RegenerationService();
