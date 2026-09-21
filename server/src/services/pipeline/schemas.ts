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
export const ExtractedRequirementSchema = z.object({
  id: z.string().default(''),
  text: z.string().min(1, 'Requirement text cannot be empty'),
  kind: RequirementKindSchema,
  priority: RequirementPrioritySchema,
  evidenceText: z.string().min(1, 'Verbatim supporting quote from JD is required'),
});

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
export const CompanyBriefOutputSchema = z.object({
  summary: z.string().min(1, 'Company summary cannot be empty'),
  what_they_do: z.string().min(1, 'What they do description cannot be empty'),
  sources: z.array(z.string()).default([]),
});

export type CompanyBriefOutputType = z.infer<typeof CompanyBriefOutputSchema>;

/**
 * Step 5 & 7: Question Generation Schema
 * Note: Application code assigns canonical q_${nanoid(8)} IDs.
 */
export const CandidateQuestionSchema = z.object({
  temp_id: z.string().optional(),
  requirement_ids: z.array(z.string()).min(1, 'Every question must link to at least one requirement ID'),
  category: QuestionCategorySchema,
  prompt: z.string().min(5, 'Question prompt must be at least 5 characters'),
  answer_outline: z.string().min(5, 'Answer outline must provide structured guidance'),
  difficulty: QuestionDifficultySchema,
});

export const QuestionsOutputSchema = z.object({
  questions: z.array(CandidateQuestionSchema).min(1, 'At least one question must be generated'),
});

export type QuestionsOutputType = z.infer<typeof QuestionsOutputSchema>;

/**
 * Step 10: Flashcard Deck Schema
 */
export const CandidateFlashcardSchema = z.object({
  front: z.string().min(3, 'Flashcard front prompt required'),
  back: z.string().min(3, 'Flashcard back answer required'),
  requirement_ids: z.array(z.string()).min(1, 'Flashcard must reference at least one requirement ID'),
  question_id: z.string().optional(),
});

export const FlashcardsOutputSchema = z.object({
  flashcards: z.array(CandidateFlashcardSchema).min(1, 'At least one flashcard must be generated'),
});

export type FlashcardsOutputType = z.infer<typeof FlashcardsOutputSchema>;
