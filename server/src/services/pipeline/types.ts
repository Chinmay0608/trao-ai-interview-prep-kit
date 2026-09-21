import {
  AppendixAKit,
  InternalPrepKit,
  CoverageResult,
  Requirement,
  Question,
  Flashcard,
  Schedule,
  LLMProvider,
  ResearchProvider,
  ResearchResult,
} from '@trao/shared';
import { DynamicCrawler } from '../crawler/DynamicCrawler.js';
import { CrawlResult } from '../crawler/types.js';

export interface PipelineInput {
  jobDescription: string;
  companyUrl: string;
  daysAvailable: number;
}

export interface PipelineStepProgress {
  step: string;
  stepIndex: number;
  totalSteps: number;
  startedAt: string;
  completedAt?: string;
  success: boolean;
  diagnostics?: Record<string, any>;
}

export type StepProgressCallback = (progress: PipelineStepProgress) => void;

export interface PipelineOptions {
  llmProvider: LLMProvider;
  researchProvider: ResearchProvider;
  crawler?: DynamicCrawler;
  onStepProgress?: StepProgressCallback;
  maxGapPasses?: number; // Default: 2
  allowLocalCrawl?: boolean;
}

export interface PipelineContext {
  input: PipelineInput;
  jdExtraction?: {
    roleTitle: string;
    seniority: string;
    responsibilities: string[];
    requirements: Requirement[];
    evidence: Record<string, string>; // reqId -> verbatim evidence quote
  };
  companyCrawl?: CrawlResult;
  interviewResearch?: ResearchResult[];
  companyBrief?: AppendixAKit['company_brief'];
  initialQuestions?: Question[];
  initialCoverage?: CoverageResult;
  gapRequirements?: Requirement[];
  gapQuestions?: Question[];
  finalCoverage?: CoverageResult;
  finalQuestions?: Question[];
  flashcards?: Flashcard[];
  schedule?: Schedule;
  stepProgress: PipelineStepProgress[];
}

export interface PipelineResult {
  kit: AppendixAKit;
  internalKit: InternalPrepKit;
  context: PipelineContext;
}

export class PipelineExecutionError extends Error {
  public readonly step: string;
  public readonly details?: unknown;

  constructor(step: string, message: string, details?: unknown) {
    super(`[Pipeline Error at ${step}]: ${message}`);
    this.name = 'PipelineExecutionError';
    this.step = step;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
