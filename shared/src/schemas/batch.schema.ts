import { z } from 'zod';
import { AppendixAKitSchema } from './kit.schema.js';

/**
 * Zod Schema for Appendix B — Batch Input and Output
 */

export const BatchInputCaseSchema = z.object({
  id: z.string().min(1, 'Case ID is required'),
  jd: z.string().min(1, 'Job description string is required'),
  company_url: z.string().min(1, 'Company URL is required'),
  days: z.number().int().min(1, 'Days must be an integer >= 1'),
});

export const BatchInputListSchema = z.array(BatchInputCaseSchema);

export const BatchCaseErrorSchema = z.object({
  code: z.string().min(1, 'Error code is required'),
  message: z.string().min(1, 'Error message is required'),
});

export const BatchCaseSuccessResultSchema = z.object({
  id: z.string().min(1),
  status: z.literal('ok'),
  kit: AppendixAKitSchema,
  error: z.null(),
});

export const BatchCaseFailedResultSchema = z.object({
  id: z.string().min(1),
  status: z.literal('failed'),
  kit: z.null(),
  error: BatchCaseErrorSchema,
});

export const BatchCaseResultSchema = z.discriminatedUnion('status', [
  BatchCaseSuccessResultSchema,
  BatchCaseFailedResultSchema,
]);

export const BatchOutputFileSchema = z.object({
  version: z.literal('1.0'),
  generated_at: z.string(),
  kits: z.array(BatchCaseResultSchema),
});

export type BatchInputCaseType = z.infer<typeof BatchInputCaseSchema>;
export type BatchOutputFileType = z.infer<typeof BatchOutputFileSchema>;
