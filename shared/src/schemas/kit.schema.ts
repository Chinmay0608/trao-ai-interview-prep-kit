import { z } from 'zod';

/**
 * Zod Schema for Appendix A — Strict Contract Validation
 */

export const RequirementKindSchema = z.enum(['technical', 'behavioural', 'domain']);
export const RequirementPrioritySchema = z.enum(['must', 'nice']);

export const RequirementSchema = z.object({
  id: z.string().min(1, 'Requirement ID is required'),
  text: z.string().min(1, 'Requirement text is required'),
  kind: RequirementKindSchema,
  priority: RequirementPrioritySchema,
});

export const QuestionCategorySchema = z.enum([
  'technical',
  'behavioural',
  'system-design',
  'company-fit',
]);

export const QuestionDifficultySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

export const QuestionSchema = z.object({
  id: z.string().min(1, 'Question ID is required'),
  requirement_ids: z.array(z.string()),
  category: QuestionCategorySchema,
  prompt: z.string().min(1, 'Question prompt is required'),
  answer_outline: z.string().min(1, 'Answer outline is required'),
  difficulty: QuestionDifficultySchema,
});

export const FlashcardSchema = z.object({
  id: z.string().min(1, 'Flashcard ID is required'),
  front: z.string().min(1, 'Flashcard front is required'),
  back: z.string().min(1, 'Flashcard back is required'),
  requirement_ids: z.array(z.string()),
});

export const ScheduleDaySchema = z.object({
  day: z.number().int().min(1, 'Day must be an integer >= 1'),
  focus: z.string().min(1, 'Day focus is required'),
  question_ids: z.array(z.string()),
  minutes: z.number().int().min(1, 'Minutes must be an integer > 0'),
});

export const ScheduleSchema = z.object({
  days_available: z.number().int().min(1, 'days_available must be an integer >= 1'),
  days: z.array(ScheduleDaySchema),
});

export const CoverageSchema = z.object({
  uncovered_requirement_ids: z.array(z.string()),
  passes: z.number().int().min(1, 'passes must be an integer >= 1'),
});

export const SourceInfoSchema = z.object({
  company: z.string(),
  company_url: z.string(),
  role: z.string(),
  location: z.string(),
  jd_chars: z.number().int().nonnegative('jd_chars must be a non-negative integer'),
  researched_at: z.string(),
  pages_used: z.array(z.string()),
});

export const CompanyBriefSchema = z.object({
  summary: z.string(),
  what_they_do: z.string(),
  sources: z.array(z.string()),
});

export const RoleInfoSchema = z.object({
  title: z.string(),
  seniority: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(RequirementSchema),
});

export const AppendixAKitSchema = z
  .object({
    source: SourceInfoSchema,
    company_brief: CompanyBriefSchema,
    role: RoleInfoSchema,
    questions: z.array(QuestionSchema),
    flashcards: z.array(FlashcardSchema),
    schedule: ScheduleSchema,
    coverage: CoverageSchema,
  })
  .superRefine((data, ctx) => {
    // Assessment rule: "the number of days in the schedule equals the number of days requested"
    if (data.schedule.days.length !== data.schedule.days_available) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['schedule', 'days'],
        message: `Schedule days count (${data.schedule.days.length}) does not match days_available (${data.schedule.days_available})`,
      });
    }

    // Assessment rule: "every question_ids entry in the schedule must refer to a question that exists"
    const existingQuestionIds = new Set(data.questions.map((q) => q.id));
    data.schedule.days.forEach((day, dayIndex) => {
      day.question_ids.forEach((qId, qIndex) => {
        if (!existingQuestionIds.has(qId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['schedule', 'days', dayIndex, 'question_ids', qIndex],
            message: `Schedule references non-existent question ID: "${qId}"`,
          });
        }
      });
    });

    // Assessment rule: "Every requirement gets a stable id, and every question references the requirement ids it covers"
    const existingRequirementIds = new Set(data.role.requirements.map((r) => r.id));
    data.questions.forEach((q, qIndex) => {
      q.requirement_ids.forEach((rId, rIndex) => {
        if (!existingRequirementIds.has(rId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['questions', qIndex, 'requirement_ids', rIndex],
            message: `Question references non-existent requirement ID: "${rId}"`,
          });
        }
      });
    });
  });

export type AppendixAKitType = z.infer<typeof AppendixAKitSchema>;
