import {
  LLMProvider,
  ResearchProvider,
  BatchCaseResult,
  AppendixAKit,
} from '@trao/shared';
import { BatchEvaluator } from './batchEvaluator.js';
import { DynamicCrawler } from '../services/crawler/DynamicCrawler.js';

export interface ScenarioDefinition {
  name: string;
  description: string;
  input: {
    id: string;
    jd: string;
    company_url: string;
    days: number;
  };
  expectedStatus: 'ok' | 'failed';
  expectedErrorCode?: string;
  assertKit?: (kit: AppendixAKit) => void;
}

export interface ScenarioRunResult {
  scenario: string;
  passed: boolean;
  durationMs: number;
  result: BatchCaseResult;
  error?: string;
}

export interface ScenarioRunnerOptions {
  llmProvider: LLMProvider;
  researchProvider: ResearchProvider;
  crawler?: DynamicCrawler;
  allowLocalCrawl?: boolean;
}

/**
 * Programmatic Scenario Runner for deterministic and regression evaluation.
 * Decoupled from CLI argument parsing so Vitest tests can run scenarios directly.
 */
export class ScenarioRunner {
  private evaluator: BatchEvaluator;

  constructor(options: ScenarioRunnerOptions) {
    this.evaluator = new BatchEvaluator({
      llmProvider: options.llmProvider,
      researchProvider: options.researchProvider,
      crawler: options.crawler,
      allowLocalCrawl: options.allowLocalCrawl ?? true,
    });
  }

  /**
   * Executes a single scenario and runs semantic assertions on the generated kit.
   */
  public async runScenario(scenario: ScenarioDefinition): Promise<ScenarioRunResult> {
    const start = Date.now();
    try {
      const result = await this.evaluator.processCase(scenario.input);
      const durationMs = Date.now() - start;

      if (result.status !== scenario.expectedStatus) {
        return {
          scenario: scenario.name,
          passed: false,
          durationMs,
          result,
          error: `Expected status "${scenario.expectedStatus}" but received "${result.status}".`,
        };
      }

      if (result.status === 'failed') {
        if (scenario.expectedErrorCode && result.error.code !== scenario.expectedErrorCode) {
          return {
            scenario: scenario.name,
            passed: false,
            durationMs,
            result,
            error: `Expected error code "${scenario.expectedErrorCode}" but received "${result.error.code}".`,
          };
        }
        return {
          scenario: scenario.name,
          passed: true,
          durationMs,
          result,
        };
      }

      // Success case: run kit assertions if provided
      if (scenario.assertKit && result.kit) {
        try {
          scenario.assertKit(result.kit);
        } catch (assertErr: any) {
          return {
            scenario: scenario.name,
            passed: false,
            durationMs,
            result,
            error: `Assertion failed: ${assertErr.message}`,
          };
        }
      }

      return {
        scenario: scenario.name,
        passed: true,
        durationMs,
        result,
      };
    } catch (err: any) {
      return {
        scenario: scenario.name,
        passed: false,
        durationMs: Date.now() - start,
        result: {
          id: scenario.input.id,
          status: 'failed',
          kit: null,
          error: {
            code: 'RUNNER_EXCEPTION',
            message: err.message || 'Unexpected runner exception',
          },
        },
        error: err.message,
      };
    }
  }

  /**
   * Executes multiple scenarios and summarizes results.
   */
  public async runAll(scenarios: ScenarioDefinition[]): Promise<{
    passed: number;
    failed: number;
    total: number;
    results: ScenarioRunResult[];
  }> {
    const results: ScenarioRunResult[] = [];
    let passed = 0;
    let failed = 0;

    for (const scenario of scenarios) {
      const runResult = await this.runScenario(scenario);
      results.push(runResult);
      if (runResult.passed) passed++;
      else failed++;
    }

    return {
      passed,
      failed,
      total: scenarios.length,
      results,
    };
  }
}
