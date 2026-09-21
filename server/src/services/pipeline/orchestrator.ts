import {
  AppendixAKit,
  InternalPrepKit,
  InternalRequirement,
  InternalQuestion,
  InternalFlashcard,
  calculateCoverage,
  findCoverageGaps,
  allocateSchedule,
  serializeToAppendixA,
  CoverageResult,
  Question,
  Requirement,
} from '@trao/shared';
import {
  PipelineInput,
  PipelineOptions,
  PipelineResult,
  PipelineContext,
  PipelineStepProgress,
  PipelineExecutionError,
} from './types.js';
import { executeExtractionStep } from './steps/extractionStep.js';
import { executeCrawlStep } from './steps/crawlStep.js';
import { executeResearchStep } from './steps/researchStep.js';
import { executeBriefStep } from './steps/briefStep.js';
import { executeQuestionGenerationStep } from './steps/questionStep.js';
import { executeGapGenerationStep } from './steps/gapStep.js';
import { executeFlashcardStep } from './steps/flashcardStep.js';

const TOTAL_PIPELINE_STEPS = 12;

/**
 * Executes the complete 12-step interview prep kit pipeline.
 *
 * Fully modular and reusable across:
 * - Web application API endpoints
 * - Batch evaluation CLI (npm run evaluate)
 * - Automated integration tests
 */
export async function runPrepKitPipeline(
  input: PipelineInput,
  options: PipelineOptions
): Promise<PipelineResult> {
  const startTime = Date.now();
  const context: PipelineContext = {
    input,
    stepProgress: [],
  };

  const reportProgress = (
    step: string,
    stepIndex: number,
    success: boolean,
    diagnostics?: Record<string, any>
  ): void => {
    const progress: PipelineStepProgress = {
      step,
      stepIndex,
      totalSteps: TOTAL_PIPELINE_STEPS,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      success,
      diagnostics,
    };
    context.stepProgress.push(progress);
    if (options.onStepProgress) {
      options.onStepProgress(progress);
    }
  };

  // =========================================================================
  // Step 1: Evidence-Grounded JD Extraction
  // =========================================================================
  const extraction = await executeExtractionStep(input.jobDescription, options.llmProvider);
  context.jdExtraction = extraction;
  reportProgress('EXTRACTING_JD', 1, true, {
    requirementsCount: extraction.requirements.length,
    mustHaveCount: extraction.requirements.filter((r) => r.priority === 'must').length,
  });

  // Extract company name candidate from URL or JD
  let inferredCompanyName = '';
  try {
    const parsedUrl = new URL(input.companyUrl);
    inferredCompanyName = parsedUrl.hostname.replace(/^www\./, '').split('.')[0];
    inferredCompanyName = inferredCompanyName.charAt(0).toUpperCase() + inferredCompanyName.slice(1);
  } catch {
    inferredCompanyName = 'Company';
  }

  // =========================================================================
  // Step 2: Company Crawl (Bounded Best-First)
  // =========================================================================
  const crawlResult = await executeCrawlStep(
    input.companyUrl,
    options.crawler,
    options.allowLocalCrawl
  );
  context.companyCrawl = crawlResult;
  reportProgress('CRAWLING_SITE', 2, true, {
    pagesCrawled: crawlResult.pages.length,
    hiringEvidenceFound: crawlResult.hiringEvidenceFound,
  });

  // =========================================================================
  // Step 3: Public Interview Research (Live Search)
  // =========================================================================
  const researchResults = await executeResearchStep(
    inferredCompanyName,
    extraction.roleTitle,
    options.researchProvider
  );
  context.interviewResearch = researchResults;
  reportProgress('SEARCHING_PUBLIC_INFO', 3, true, {
    discussionsFound: researchResults.length,
  });

  // =========================================================================
  // Step 4: Company Brief Synthesis
  // =========================================================================
  const companyBrief = await executeBriefStep(
    inferredCompanyName,
    input.companyUrl,
    crawlResult,
    researchResults,
    options.llmProvider
  );
  context.companyBrief = companyBrief;
  reportProgress('SYNTHESIZING_BRIEF', 4, true, {
    sourcesCount: companyBrief.sources.length,
  });

  // =========================================================================
  // Step 5: Initial Question Bank Generation
  // =========================================================================
  let candidateQuestions = await executeQuestionGenerationStep(
    extraction.requirements,
    extraction.responsibilities,
    extraction.roleTitle,
    extraction.seniority,
    companyBrief,
    options.llmProvider
  );
  context.initialQuestions = candidateQuestions;
  reportProgress('GENERATING_QUESTIONS', 5, true, {
    initialQuestionsCount: candidateQuestions.length,
  });

  // =========================================================================
  // Step 6: Deterministic Coverage Calculation
  // =========================================================================
  const initialCoverage = calculateCoverage(candidateQuestions, extraction.requirements);
  context.initialCoverage = initialCoverage;
  const gapRequirements = findCoverageGaps(extraction.requirements, initialCoverage);
  context.gapRequirements = gapRequirements;

  reportProgress('CHECKING_COVERAGE', 6, true, {
    mustCoveragePercentage: initialCoverage.mustCoveragePercentage,
    uncoveredMustCount: gapRequirements.length,
  });

  // =========================================================================
  // Step 7: Targeted Second-Pass Gap Generation (Loop)
  // =========================================================================
  let passes = 1;
  const maxPasses = options.maxGapPasses || 2;

  if (gapRequirements.length > 0 && maxPasses > 1) {
    passes = 2;
    const gapQuestions = await executeGapGenerationStep(
      gapRequirements,
      candidateQuestions,
      extraction.evidence,
      extraction.roleTitle,
      extraction.seniority,
      companyBrief,
      options.llmProvider
    );

    context.gapQuestions = gapQuestions;
    candidateQuestions = [...candidateQuestions, ...gapQuestions];

    reportProgress('SECOND_PASS_GAP_CLOSURE', 7, true, {
      gapQuestionsGenerated: gapQuestions.length,
    });
  } else {
    reportProgress('SECOND_PASS_GAP_CLOSURE', 7, true, { skipped: true });
  }

  // =========================================================================
  // Step 8: Deterministic Coverage Re-Check
  // =========================================================================
  const finalCoverage = calculateCoverage(candidateQuestions, extraction.requirements);
  context.finalCoverage = finalCoverage;

  reportProgress('RECHECKING_COVERAGE', 8, true, {
    finalMustCoveragePercentage: finalCoverage.mustCoveragePercentage,
    remainingUncoveredMust: finalCoverage.uncoveredMustIds.length,
  });

  if (finalCoverage.uncoveredMustIds.length > 0) {
    throw new PipelineExecutionError(
      'COVERAGE_GAP_UNRESOLVED',
      `Pipeline failed coverage invariant: must-have requirements remain uncovered after ${passes} passes: [${finalCoverage.uncoveredMustIds.join(', ')}]`,
      finalCoverage.uncoveredMustIds
    );
  }

  // =========================================================================
  // Step 9: Final Question-Bank Normalization & Deduplication
  // =========================================================================
  const finalQuestions = normalizeFinalQuestions(candidateQuestions, extraction.requirements);
  context.finalQuestions = finalQuestions;
  reportProgress('NORMALIZING_QUESTIONS', 9, true, {
    finalQuestionCount: finalQuestions.length,
  });

  // =========================================================================
  // Step 10: Flashcard Deck Generation (from FINAL Questions)
  // =========================================================================
  const flashcards = await executeFlashcardStep(
    finalQuestions,
    extraction.requirements,
    options.llmProvider
  );
  context.flashcards = flashcards;
  reportProgress('GENERATING_FLASHCARDS', 10, true, {
    flashcardsCount: flashcards.length,
  });

  // =========================================================================
  // Step 11: Deterministic Schedule Allocation
  // =========================================================================
  const schedule = allocateSchedule(
    finalQuestions,
    extraction.requirements,
    input.daysAvailable
  );
  context.schedule = schedule;
  reportProgress('ALLOCATING_SCHEDULE', 11, true, {
    daysAllocated: schedule.days.length,
  });

  // =========================================================================
  // Step 12: Internal Representation & Strict Appendix A Serialization
  // =========================================================================
  const internalRequirements: InternalRequirement[] = extraction.requirements.map((r) => ({
    ...r,
    _meta: {
      origin: 'generated',
      pinned: false,
      evidenceText: extraction.evidence[r.id],
    },
  }));

  const internalQuestions: InternalQuestion[] = finalQuestions.map((q) => ({
    ...q,
    _meta: {
      origin: 'generated',
      pinned: false,
    },
  }));

  const internalFlashcards: InternalFlashcard[] = flashcards.map((f) => ({
    ...f,
    _meta: {
      origin: 'generated',
      pinned: false,
    },
  }));

  const internalKit: InternalPrepKit = {
    source: {
      company: inferredCompanyName,
      company_url: input.companyUrl,
      role: extraction.roleTitle,
      location: 'Not specified in posting',
      jd_chars: input.jobDescription.length,
      researched_at: new Date().toISOString(),
      pages_used: crawlResult.pagesUsed,
    },
    company_brief: companyBrief,
    role: {
      title: extraction.roleTitle,
      seniority: extraction.seniority,
      responsibilities: extraction.responsibilities,
      requirements: internalRequirements,
    },
    questions: internalQuestions,
    flashcards: internalFlashcards,
    schedule,
    coverage: finalCoverage.toAppendixACoverage(passes),
  };

  // Strictly serialize through serializeToAppendixA() to guarantee Appendix A compliance
  const serializedKit: AppendixAKit = serializeToAppendixA(internalKit);
  reportProgress('VALIDATING_APPENDIX_A', 12, true);

  return {
    kit: serializedKit,
    internalKit,
    context,
  };
}

/**
 * Deterministically normalizes and deduplicates final questions.
 */
function normalizeFinalQuestions(
  questions: Question[],
  requirements: Requirement[]
): Question[] {
  const validReqIds = new Set(requirements.map((r) => r.id));
  const seenPrompts = new Map<string, Question>();
  const normalized: Question[] = [];

  for (const q of questions) {
    const validLinks = q.requirement_ids.filter((id) => validReqIds.has(id));
    if (validLinks.length === 0) continue;

    const normKey = q.prompt.trim().toLowerCase().replace(/\s+/g, ' ');
    if (seenPrompts.has(normKey)) {
      const existing = seenPrompts.get(normKey)!;
      for (const rId of validLinks) {
        if (!existing.requirement_ids.includes(rId)) {
          existing.requirement_ids.push(rId);
        }
      }
      continue;
    }

    const cleanQuestion: Question = {
      ...q,
      requirement_ids: validLinks.sort((a, b) => a.localeCompare(b)),
    };
    seenPrompts.set(normKey, cleanQuestion);
    normalized.push(cleanQuestion);
  }

  return normalized;
}
