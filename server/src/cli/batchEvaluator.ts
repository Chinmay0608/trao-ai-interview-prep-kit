import {
  BatchInputCase,
  BatchCaseResult,
  BatchOutputFile,
  LLMProvider,
  ResearchProvider,
} from '@trao/shared';
import { runPrepKitPipeline } from '../services/pipeline/index.js';
import { DynamicCrawler } from '../services/crawler/DynamicCrawler.js';
import {
  serializeSuccessCase,
  serializeFailedCase,
  formatAppendixBOutput,
} from './appendixBSerializer.js';

export interface BatchEvaluatorOptions {
  llmProvider: LLMProvider;
  researchProvider: ResearchProvider;
  crawler?: DynamicCrawler;
  allowLocalCrawl?: boolean;
  onProgress?: (index: number, total: number, result: BatchCaseResult) => void;
}

export class BatchEvaluator {
  private llmProvider: LLMProvider;
  private researchProvider: ResearchProvider;
  private crawler?: DynamicCrawler;
  private allowLocalCrawl: boolean;
  private onProgress?: (index: number, total: number, result: BatchCaseResult) => void;

  constructor(options: BatchEvaluatorOptions) {
    this.llmProvider = options.llmProvider;
    this.researchProvider = options.researchProvider;
    this.crawler = options.crawler;
    this.allowLocalCrawl = options.allowLocalCrawl ?? true;
    this.onProgress = options.onProgress;
  }

  /**
   * Processes a single input case using the exact production pipeline.
   * Never throws; maps all unexpected errors to standardized failed case results.
   */
  public async processCase(inputCase: unknown): Promise<BatchCaseResult> {
    const raw = inputCase as Record<string, any>;
    const caseId = typeof raw?.id === 'string' && raw.id.trim().length > 0
      ? raw.id.trim()
      : 'unknown-case';

    // 1. Case-level validation
    if (!raw || typeof raw !== 'object') {
      return serializeFailedCase(caseId, 'INVALID_INPUT', 'Input case is null or not an object.');
    }

    if (typeof raw.jd !== 'string' || raw.jd.trim().length === 0) {
      return serializeFailedCase(caseId, 'INVALID_JD', 'Job description string is missing or empty.');
    }

    if (typeof raw.company_url !== 'string' || raw.company_url.trim().length === 0) {
      return serializeFailedCase(caseId, 'INVALID_URL', 'Company URL is missing or empty.');
    }

    const days = Number(raw.days);
    if (!Number.isInteger(days) || days < 1) {
      return serializeFailedCase(caseId, 'INVALID_DAYS', 'Days must be an integer >= 1.');
    }

    // 2. Invoke identical production pipeline: runPrepKitPipeline()
    try {
      const pipelineResult = await runPrepKitPipeline(
        {
          jobDescription: raw.jd.trim(),
          companyUrl: raw.company_url.trim(),
          daysAvailable: days,
        },
        {
          llmProvider: this.llmProvider,
          researchProvider: this.researchProvider,
          crawler: this.crawler,
          allowLocalCrawl: this.allowLocalCrawl,
          maxGapPasses: 2,
        }
      );

      // 3. Serialize through strict Appendix A validation boundary
      return serializeSuccessCase(caseId, pipelineResult.kit);
    } catch (err: any) {
      const code = err.code || err.name || 'PIPELINE_FAILED';
      const message = err.message || 'Pipeline execution failed.';
      return serializeFailedCase(caseId, code, message);
    }
  }

  /**
   * Evaluates an array of input cases sequentially.
   * Guarantees:
   * - One case failure never halts subsequent cases.
   * - Preserves input case ordering in the output array.
   * - Generates complete Appendix B output file.
   */
  public async evaluateBatch(rawCases: unknown[]): Promise<BatchOutputFile> {
    if (!Array.isArray(rawCases)) {
      throw new Error('Input must be a JSON array of case objects.');
    }

    const results: BatchCaseResult[] = [];
    const total = rawCases.length;

    for (let i = 0; i < total; i++) {
      const rawCase = rawCases[i];
      const caseResult = await this.processCase(rawCase);
      results.push(caseResult);

      if (this.onProgress) {
        this.onProgress(i + 1, total, caseResult);
      }
    }

    return formatAppendixBOutput(results);
  }
}
