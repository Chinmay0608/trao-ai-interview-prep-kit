import { AppendixAKit } from '../types/kit.js';
import { AppendixAKitSchema } from '../schemas/kit.schema.js';
import { AppendixASerializationError } from './errors.js';

/**
 * Pure function to serialize an internal kit (or DB document) into a strict Appendix A kit.
 *
 * Guarantees:
 * - Strips all internal metadata (_meta, origin, pinned, edited, database IDs, job IDs).
 * - Preserves exact Appendix A property names and types.
 * - Enforces integer minutes and difficulty.
 * - Validates against AppendixAKitSchema before returning.
 */
export function serializeToAppendixA(rawKit: any): AppendixAKit {
  if (!rawKit || typeof rawKit !== 'object') {
    throw new AppendixASerializationError('Cannot serialize null or non-object kit.');
  }

  // Handle nested internalKit if passed from a mongoose document
  const kit = rawKit.internalKit ? rawKit.internalKit : rawKit;

  try {
    const serialized: AppendixAKit = {
      source: {
        company: String(kit.source?.company || ''),
        company_url: String(kit.source?.company_url || ''),
        role: String(kit.source?.role || ''),
        location: String(kit.source?.location || ''),
        jd_chars: Math.max(0, Math.round(Number(kit.source?.jd_chars) || 0)),
        researched_at: String(kit.source?.researched_at || ''),
        pages_used: Array.isArray(kit.source?.pages_used)
          ? kit.source.pages_used.map((p: any) => String(p))
          : [],
      },
      company_brief: {
        summary: String(kit.company_brief?.summary || ''),
        what_they_do: String(kit.company_brief?.what_they_do || ''),
        sources: Array.isArray(kit.company_brief?.sources)
          ? kit.company_brief.sources.map((s: any) => String(s))
          : [],
      },
      role: {
        title: String(kit.role?.title || ''),
        seniority: String(kit.role?.seniority || ''),
        responsibilities: Array.isArray(kit.role?.responsibilities)
          ? kit.role.responsibilities.map((r: any) => String(r))
          : [],
        requirements: Array.isArray(kit.role?.requirements)
          ? kit.role.requirements.map((req: any) => ({
              id: String(req.id),
              text: String(req.text),
              kind: req.kind,
              priority: req.priority,
            }))
          : [],
      },
      questions: Array.isArray(kit.questions)
        ? kit.questions.map((q: any) => ({
            id: String(q.id),
            requirement_ids: Array.isArray(q.requirement_ids)
              ? q.requirement_ids.map((rId: any) => String(rId))
              : [],
            category: q.category,
            prompt: String(q.prompt),
            answer_outline: String(q.answer_outline),
            difficulty: Math.max(1, Math.min(3, Math.round(Number(q.difficulty) || 2))) as 1 | 2 | 3,
          }))
        : [],
      flashcards: Array.isArray(kit.flashcards)
        ? kit.flashcards.map((f: any) => ({
            id: String(f.id),
            front: String(f.front),
            back: String(f.back),
            requirement_ids: Array.isArray(f.requirement_ids)
              ? f.requirement_ids.map((rId: any) => String(rId))
              : [],
          }))
        : [],
      schedule: {
        days_available: Math.max(1, Math.round(Number(kit.schedule?.days_available) || 1)),
        days: Array.isArray(kit.schedule?.days)
          ? kit.schedule.days.map((d: any) => ({
              day: Math.max(1, Math.round(Number(d.day) || 1)),
              focus: String(d.focus || ''),
              question_ids: Array.isArray(d.question_ids)
                ? d.question_ids.map((qId: any) => String(qId))
                : [],
              minutes: Math.max(1, Math.round(Number(d.minutes) || 30)),
            }))
          : [],
      },
      coverage: {
        uncovered_requirement_ids: Array.isArray(kit.coverage?.uncovered_requirement_ids)
          ? kit.coverage.uncovered_requirement_ids.map((id: any) => String(id))
          : [],
        passes: Math.max(1, Math.round(Number(kit.coverage?.passes) || 1)),
      },
    };

    // Strict validation against AppendixAKitSchema
    return AppendixAKitSchema.parse(serialized);
  } catch (error: any) {
    throw new AppendixASerializationError(
      `Appendix A serialization failed: ${error.message}`,
      error.issues || error
    );
  }
}
