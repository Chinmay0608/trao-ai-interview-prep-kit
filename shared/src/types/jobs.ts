/**
 * GenerationJob Types and Lifecycle States
 */

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type JobStep =
  | 'VALIDATING_INPUT'
  | 'EXTRACTING_JD'
  | 'CRAWLING_SITE'
  | 'SEARCHING_PUBLIC_INFO'
  | 'SYNTHESIZING_BRIEF'
  | 'GENERATING_QUESTIONS'
  | 'CHECKING_COVERAGE'
  | 'SECOND_PASS_GAP_CLOSURE'
  | 'GENERATING_FLASHCARDS'
  | 'ALLOCATING_SCHEDULE'
  | 'VALIDATING_KIT';

export interface GenerationJobInfo {
  id: string;
  kitId: string;
  userId: string;
  status: JobStatus;
  currentStep: JobStep;
  progress: number; // 0 to 100
  generationVersion: number;
  startedAt: string;
  updatedAt: string;
  heartbeatAt: string;
  completedAt?: string;
  retryAttempts: number;
  error?: {
    code: string;
    message: string;
  };
}
