import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

export function validateBody<T>(schema: z.ZodType<T, any, any>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const firstIssue = err.issues[0];
        const path = firstIssue?.path.join('.') || 'body';
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: `${path}: ${firstIssue?.message || 'Invalid input data'}`,
          },
        });
        return;
      }
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body format.',
        },
      });
    }
  };
}

export function validateParams<T>(schema: z.ZodType<T, any, any>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as any;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const firstIssue = err.issues[0];
        const path = firstIssue?.path.join('.') || 'param';
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: `${path}: ${firstIssue?.message || 'Invalid parameter'}`,
          },
        });
        return;
      }
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request parameter.',
        },
      });
    }
  };
}
