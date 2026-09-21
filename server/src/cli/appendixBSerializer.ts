import {
  AppendixAKit,
  BatchCaseSuccessResult,
  BatchCaseFailedResult,
  BatchCaseResult,
  BatchOutputFile,
  serializeToAppendixA,
  validateAppendixA,
} from '@trao/shared';

/**
 * Transforms a raw or internal prep kit result into a sanitized Appendix B success case.
 *
 * Guarantees:
 * - Validates against strict Appendix A schema via `validateAppendixA()`
 * - Strips all internal database identifiers, timestamps, and `_meta` flags
 * - Prevents internal data leaks to public evaluation output
 * - If validation fails, returns a sanitized failed result instead of crashing
 */
export function serializeSuccessCase(caseId: string, rawKit: unknown): BatchCaseResult {
  try {
    // 1. Serialize to clean Appendix A (stripping _meta and non-contract fields)
    const appendixA: AppendixAKit = serializeToAppendixA(rawKit);

    // 2. Validate strictly
    validateAppendixA(appendixA);

    const successResult: BatchCaseSuccessResult = {
      id: caseId,
      status: 'ok',
      kit: appendixA,
      error: null,
    };

    return successResult;
  } catch (err: any) {
    return serializeFailedCase(caseId, 'VALIDATION_FAILED', err.message || 'Generated kit failed Appendix A validation.');
  }
}

/**
 * Produces a standardized Appendix B failed case item.
 *
 * Guarantees:
 * - Contains only public error code and message
 * - Strips stack traces, database states, secrets, or internal paths
 */
export function serializeFailedCase(
  caseId: string,
  code: string,
  message: string
): BatchCaseFailedResult {
  // Normalize known error codes
  const normalizedCode = sanitizeErrorCode(code);
  const cleanMessage = sanitizeErrorMessage(message);

  return {
    id: caseId,
    status: 'failed',
    kit: null,
    error: {
      code: normalizedCode,
      message: cleanMessage,
    },
  };
}

/**
 * Creates the complete Appendix B JSON document wrapping all case results.
 */
export function formatAppendixBOutput(
  kits: BatchCaseResult[],
  generatedAt?: string
): BatchOutputFile {
  return {
    version: '1.0',
    generated_at: generatedAt || new Date().toISOString(),
    kits,
  };
}

function sanitizeErrorCode(code: string): string {
  if (!code || typeof code !== 'string') return 'UNKNOWN_ERROR';
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  return clean || 'UNKNOWN_ERROR';
}

function sanitizeErrorMessage(message: string): string {
  if (!message || typeof message !== 'string') return 'An unexpected error occurred.';
  // Strip potential path disclosures or mongo connection strings
  return message
    .replace(/mongodb:\/\/[^\s]+/gi, '[REDACTED_URI]')
    .replace(/[A-Z]:\\[^\s]+/gi, '[PATH]')
    .trim()
    .slice(0, 300);
}
