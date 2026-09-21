import { AppendixAKit } from './kit.js';

/**
 * Appendix B — Batch Input and Output Contracts
 */

export interface BatchInputCase {
  id: string;
  jd: string;
  company_url: string;
  days: number;
}

export type BatchCaseStatus = 'ok' | 'failed';

export interface BatchCaseError {
  code: string;
  message: string;
}

export interface BatchCaseSuccessResult {
  id: string;
  status: 'ok';
  kit: AppendixAKit;
  error: null;
}

export interface BatchCaseFailedResult {
  id: string;
  status: 'failed';
  kit: null;
  error: BatchCaseError;
}

export type BatchCaseResult = BatchCaseSuccessResult | BatchCaseFailedResult;

export interface BatchOutputFile {
  version: '1.0';
  generated_at: string; // ISO 8601 timestamp string
  kits: BatchCaseResult[];
}
