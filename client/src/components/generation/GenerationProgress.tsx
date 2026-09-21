'use client';

import React from 'react';
import { useJobSSE, useKits } from '@/contexts/KitContext';
import { CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';

const STEP_LABELS: Record<string, string> = {
  VALIDATING_INPUT: 'Validating inputs',
  EXTRACTING_JD: 'Analysing job description',
  CRAWLING_SITE: 'Crawling company site',
  SEARCHING_PUBLIC_INFO: 'Searching public interview data',
  SYNTHESIZING_BRIEF: 'Synthesising company brief',
  GENERATING_QUESTIONS: 'Generating questions',
  CHECKING_COVERAGE: 'Checking requirement coverage',
  SECOND_PASS_GAP_CLOSURE: 'Closing coverage gaps',
  GENERATING_FLASHCARDS: 'Generating flashcards',
  ALLOCATING_SCHEDULE: 'Building schedule',
  VALIDATING_KIT: 'Validating kit',
};

const STEP_ORDER = [
  'VALIDATING_INPUT',
  'EXTRACTING_JD',
  'CRAWLING_SITE',
  'SEARCHING_PUBLIC_INFO',
  'SYNTHESIZING_BRIEF',
  'GENERATING_QUESTIONS',
  'CHECKING_COVERAGE',
  'SECOND_PASS_GAP_CLOSURE',
  'GENERATING_FLASHCARDS',
  'ALLOCATING_SCHEDULE',
  'VALIDATING_KIT',
];

interface GenerationProgressProps {
  jobId: string;
  onComplete: (kitId: string) => void;
  onFailed: (error: { code: string; message: string }) => void;
}

export function GenerationProgress({ jobId, onComplete, onFailed }: GenerationProgressProps) {
  const [failedError, setFailedError] = React.useState<string | null>(null);

  const handleFailed = React.useCallback((err: { code: string; message: string }) => {
    setFailedError(err.message || 'Generation failed. Please try again.');
    onFailed(err);
  }, [onFailed]);

  const sseState = useJobSSE(jobId, onComplete, handleFailed);

  const currentStepIndex = sseState.currentStep
    ? STEP_ORDER.indexOf(sseState.currentStep)
    : -1;

  const isComplete = sseState.status === 'completed';
  const isFailed = sseState.status === 'failed';
  const isRunning = !isComplete && !isFailed;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRunning && (
              <Loader2 className="h-4 w-4 text-blue-500 animate-spin" aria-label="Generating" />
            )}
            {isComplete && <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Complete" />}
            {isFailed && <XCircle className="h-4 w-4 text-red-500" aria-label="Failed" />}
            <span className="text-sm font-medium text-slate-900">
              {isComplete ? 'Kit ready' : isFailed ? 'Generation failed' : 'Generating your prep kit…'}
            </span>
          </div>
          <span className="text-sm tabular-nums text-slate-500">{sseState.progress}%</span>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all duration-500',
              isComplete ? 'bg-emerald-500' : isFailed ? 'bg-red-400' : 'bg-blue-500'
            )}
            style={{ width: `${sseState.progress}%` }}
            role="progressbar"
            aria-valuenow={sseState.progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* Error state */}
      {isFailed && failedError && (
        <div className="px-6 py-4 bg-red-50 border-b border-red-100">
          <p className="text-sm text-red-700">{failedError}</p>
        </div>
      )}

      {/* Step list */}
      {isRunning && (
        <ol className="px-6 py-4 space-y-2.5" aria-label="Generation steps">
          {STEP_ORDER.map((step, idx) => {
            const isDone = idx < currentStepIndex;
            const isCurrent = idx === currentStepIndex;
            const isPending = idx > currentStepIndex;
            return (
              <li
                key={step}
                className={clsx('flex items-center gap-2.5 text-sm', {
                  'text-emerald-600': isDone,
                  'text-blue-600 font-medium': isCurrent,
                  'text-slate-300': isPending,
                })}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {isDone && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                {isCurrent && (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                )}
                {isPending && (
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-current inline-block" aria-hidden="true" />
                )}
                {STEP_LABELS[step] ?? step}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
