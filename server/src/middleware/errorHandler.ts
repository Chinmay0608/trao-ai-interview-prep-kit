import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  InvalidJobTransitionError,
  JobClaimConflictError,
  JobNotFoundError,
  KitNotFoundError,
  StaleGenerationError,
  UnauthorizedAccessError,
  UnknownQuestionIdError,
} from '../services/jobs/errors.js';
import { AuthenticationError } from '../auth/authService.js';
import { sanitizeErrorMessage } from '../services/jobs/sanitizer.js';

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // 1. Authentication errors (401)
  if (err instanceof AuthenticationError) {
    res.status(401).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  // 2. Authorization / User isolation violation (404 to avoid leaking resource existence)
  if (err instanceof UnauthorizedAccessError) {
    res.status(404).json({
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'The requested resource was not found.',
      },
    });
    return;
  }

  // 3. Resource not found (404)
  if (err instanceof JobNotFoundError || err instanceof KitNotFoundError) {
    res.status(404).json({
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: err.message,
      },
    });
    return;
  }

  // 4. Optimistic concurrency conflict (409)
  if (err instanceof StaleGenerationError) {
    res.status(409).json({
      error: {
        code: 'STALE_GENERATION',
        message: err.message,
      },
    });
    return;
  }

  // 5. Job claim conflict (409)
  if (err instanceof JobClaimConflictError) {
    res.status(409).json({
      error: {
        code: 'JOB_ALREADY_CLAIMED',
        message: err.message,
      },
    });
    return;
  }

  // 6. Invalid state transition & unknown question IDs (400)
  if (err instanceof InvalidJobTransitionError) {
    res.status(400).json({
      error: {
        code: 'INVALID_TRANSITION',
        message: err.message,
      },
    });
    return;
  }

  if (err instanceof UnknownQuestionIdError) {
    res.status(400).json({
      error: {
        code: 'UNKNOWN_QUESTION_ID',
        message: err.message,
      },
    });
    return;
  }

  // 7. Zod validation errors (400)
  if (err instanceof ZodError) {
    const firstIssue = err.issues[0];
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: firstIssue ? `${firstIssue.path.join('.')}: ${firstIssue.message}` : 'Validation error',
      },
    });
    return;
  }

  // 8. Default unhandled internal error (500)
  const sanitizedMessage = sanitizeErrorMessage(err.message || 'An unexpected internal server error occurred.');
  res.status(500).json({
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: sanitizedMessage,
    },
  });
}
