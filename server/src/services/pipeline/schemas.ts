import { z } from 'zod';
import {
  RequirementKindSchema,
  RequirementPrioritySchema,
  QuestionCategorySchema,
  QuestionDifficultySchema,
} from '@trao/shared';

/**
 * Step 1: JD Extraction Schema with Verbatim Evidence Quotes
 */
export const ExtractedRequirementSchema = z.preprocess(
  (val: any) => {
    if (typeof val === 'object' && val !== null) {
      const text = val.text || val.requirement || val.description || val.title || val.name || '';
      const evidenceText = val.evidenceText || val.evidence || val.quote || val.verbatim || text;
      return {
        ...val,
        text: typeof text === 'string' ? text : String(text),
        evidenceText: typeof evidenceText === 'string' ? evidenceText : String(evidenceText),
      };
    }
    return val;
  },
  z.object({
    id: z.string().default(''),
    text: z.string().min(1, 'Requirement text cannot be empty'),
    kind: RequirementKindSchema,
    priority: RequirementPrioritySchema,
    evidenceText: z.string().min(1, 'Verbatim supporting quote from JD is required'),
  })
);

export const ExtractionOutputSchema = z.object({
  roleTitle: z.string().default('Software Engineer'),
  seniority: z.string().default('Mid-Level'),
  responsibilities: z.array(z.string()).default([]),
  requirements: z.array(ExtractedRequirementSchema).min(1, 'At least one requirement must be extracted'),
});

export type ExtractionOutputType = z.infer<typeof ExtractionOutputSchema>;

/**
 * Step 4: Company Brief Output Schema
 */
export const CompanyBriefOutputSchema = z.preprocess(
  (val: any) => {
    if (typeof val === 'object' && val !== null) {
      const summary = val.summary || val.overview || val.companySummary || '';
      const what_they_do = val.what_they_do || val.whatTheyDo || val.description || val.business || summary;
      return {
        ...val,
        summary,
        what_they_do,
      };
    }
    return val;
  },
  z.object({
    summary: z.string().min(1, 'Company summary cannot be empty'),
    what_they_do: z.string().min(1, 'What they do description cannot be empty'),
    sources: z.array(z.string()).default([]),
  })
);

export type CompanyBriefOutputType = z.infer<typeof CompanyBriefOutputSchema>;

/**
 * Step 5 & 7: Question Generation Schema
 * Note: Application code assigns canonical q_${nanoid(8)} IDs.
 */
export const CandidateQuestionSchema = z.preprocess(
  (val: any) => {
    if (typeof val === 'object' && val !== null) {
      const prompt = val.prompt || val.question || val.text || '';
      const answer_outline = val.answer_outline || val.outline || val.answer || val.evaluation || '';
      let reqIds = val.requirement_ids || val.requirementIds || val.requirements || [];
      if (typeof reqIds === 'string') {
        reqIds = [reqIds];
      }
      if (!Array.isArray(reqIds) || reqIds.length === 0) {
        reqIds = ['r1'];
      }
      return {
        ...val,
        prompt,
        answer_outline,
        requirement_ids: reqIds,
      };
    }
    return val;
  },
  z.object({
    temp_id: z.string().optional(),
    requirement_ids: z.array(z.string()).min(1, 'Every question must link to at least one requirement ID'),
    category: QuestionCategorySchema,
    prompt: z.string().min(5, 'Question prompt must be at least 5 characters'),
    answer_outline: z.string().min(5, 'Answer outline must provide structured guidance'),
    difficulty: QuestionDifficultySchema,
  })
);

export const QuestionsOutputSchema = z.preprocess(
  (val: any) => {
    if (Array.isArray(val)) {
      return { questions: val };
    }
    return val;
  },
  z.object({
    questions: z.array(CandidateQuestionSchema).min(1, 'At least one question must be generated'),
  })
);

export type QuestionsOutputType = z.infer<typeof QuestionsOutputSchema>;

/**
 * Step 10: Flashcard Deck Schema
 */
export const CandidateFlashcardSchema = z.preprocess(
  (val: any) => {
    if (typeof val === 'object' && val !== null) {
      const front = val.front || val.question || val.prompt || '';
      const back = val.back || val.answer || val.outline || '';
      let reqIds = val.requirement_ids || val.requirementIds || val.requirements || [];
      if (typeof reqIds === 'string') {
        reqIds = [reqIds];
      }
      if (!Array.isArray(reqIds) || reqIds.length === 0) {
        reqIds = ['r1'];
      }
      return {
        ...val,
        front,
        back,
        requirement_ids: reqIds,
      };
    }
    return val;
  },
  z.object({
    front: z.string().min(3, 'Flashcard front prompt required'),
    back: z.string().min(3, 'Flashcard back answer required'),
    requirement_ids: z.array(z.string()).min(1, 'Flashcard must reference at least one requirement ID'),
    question_id: z.string().optional(),
  })
);

export const FlashcardsOutputSchema = z.preprocess(
  (val: any) => {
    if (Array.isArray(val)) {
      return { flashcards: val };
    }
    return val;
  },
  z.object({
    flashcards: z.array(CandidateFlashcardSchema).min(1, 'At least one flashcard must be generated'),
  })
);

export type FlashcardsOutputType = z.infer<typeof FlashcardsOutputSchema>;
