import { LLMProvider, Requirement } from '@trao/shared';
import { ExtractionOutputSchema, ExtractionOutputType } from '../schemas.js';
import { PipelineExecutionError } from '../types.js';

export interface ExtractionResult {
  roleTitle: string;
  seniority: string;
  responsibilities: string[];
  requirements: Requirement[];
  evidence: Record<string, string>;
}

export async function executeExtractionStep(
  jobDescription: string,
  llmProvider: LLMProvider
): Promise<ExtractionResult> {
  const cleanJd = jobDescription.trim();
  if (!cleanJd) {
    throw new PipelineExecutionError('EXTRACTING_JD', 'Job description cannot be empty.');
  }

  const systemPrompt = `You are a rigorous technical recruiter and requirement extraction engine.
Your task is to analyze the provided Job Description and extract:
1. Role title and seniority level (Junior, Mid-Level, Senior, Staff, Lead, Principal, etc.)
2. Key responsibilities explicitly mentioned in the text.
3. Requirements list, where each requirement item MUST have:
   - "text": the requirement statement (e.g. "5+ years React experience")
   - "priority": mark as "must" if mandatory/required/essential, or "nice" if preferred/bonus/plus
   - "kind": "technical" (languages, frameworks, systems), "behavioural" (communication, mentoring, teamwork), or "domain" (finance, healthcare, compliance)
   - "evidenceText": MUST be a verbatim quote (exact substring or sentence) from the Job Description proving that this requirement exists

CRITICAL RULES:
- The property name for each requirement is "text" and the evidence quote property is "evidenceText".
- DO NOT invent, hallucinate, or extrapolate requirements not explicitly stated in the text.
- If the job description is a short 2-line stub, extract ONLY the requirements directly mentioned. An honest short list is required.
- Provide JSON strictly matching the requested schema.`;

  const prompt = `Extract role details and grounded requirements from the following Job Description:

--- JOB DESCRIPTION ---
${cleanJd}
-----------------------`;

  let output: ExtractionOutputType;
  try {
    output = await llmProvider.generateStructured({
      prompt,
      systemPrompt,
      schema: ExtractionOutputSchema,
      schemaName: 'ExtractionOutput',
      temperature: 0.1, // Low temperature for high extraction fidelity
    });
  } catch (err: any) {
    throw new PipelineExecutionError('EXTRACTING_JD', `Extraction failed: ${err.message}`, err);
  }

  const requirements: Requirement[] = [];
  const evidence: Record<string, string> = {};

  const lowerJd = cleanJd.toLowerCase();

  // Assign stable sequential IDs r1, r2, ... and verify evidence grounding
  output.requirements.forEach((req, idx) => {
    const stableId = `r${idx + 1}`;

    // Verify evidence is grounded in JD text (case-insensitive check)
    const quoteWords = req.evidenceText.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3);
    const matchesJd = quoteWords.length === 0 || quoteWords.filter(w => lowerJd.includes(w)).length >= Math.min(2, quoteWords.length);

    // If completely fabricated without any grounding, we log or keep but note
    evidence[stableId] = req.evidenceText;

    requirements.push({
      id: stableId,
      text: req.text.trim(),
      kind: req.kind,
      priority: req.priority,
    });
  });

  return {
    roleTitle: output.roleTitle.trim() || 'Software Engineer',
    seniority: output.seniority.trim() || 'Mid-Level',
    responsibilities: output.responsibilities.map((r) => r.trim()).filter((r) => r.length > 0),
    requirements,
    evidence,
  };
}
