'use client';

import React from 'react';
import { useJobSSE, useKits } from '@/contexts/KitContext';
import { CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';

const STEP_LABELS: Record<string, string> = {
  VALIDATING_INPUT: 'Validating inputs & parameters',
  EXTRACTING_JD: 'Analyzing job description & requirements',
  CRAWLING_SITE: 'Crawling company career & engineering signals',
  SEARCHING_PUBLIC_INFO: 'Gathering verified public interview benchmarks',
  SYNTHESIZING_BRIEF: 'Synthesizing technical company brief',
  GENERATING_QUESTIONS: 'Generating targeted interview questions',
  CHECKING_COVERAGE: 'Verifying requirement coverage against JD',
  SECOND_PASS_GAP_CLOSURE: 'Closing coverage gaps with targeted questions',
  GENERATING_FLASHCARDS: 'Creating active recall flashcards',
  ALLOCATING_SCHEDULE: 'Constructing day-by-day study schedule',
  VALIDATING_KIT: 'Validating complete prep kit',
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
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden transition-all">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            {isRunning && (
              <div className="h-5 w-5 rounded-md bg-slate-900 flex items-center justify-center">
                <Loader2 className="h-3 w-3 text-white animate-spin" aria-label="Generating" />
              </div>
            )}
            {isComplete && (
              <div className="h-5 w-5 rounded-md bg-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="h-3.5 w-3.5 text-white" aria-label="Complete" />
              </div>
            )}
            {isFailed && (
              <div className="h-5 w-5 rounded-md bg-rose-600 flex items-center justify-center">
                <XCircle className="h-3.5 w-3.5 text-white" aria-label="Failed" />
              </div>
            )}
            <div>
              <span className="text-sm font-semibold text-slate-900">
                {isComplete ? 'Kit Ready' : isFailed ? 'Generation Failed' : 'Generating your prep kit…'}
              </span>
              {isRunning && sseState.currentStep && (
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {STEP_LABELS[sseState.currentStep] ?? sseState.currentStep}
                </p>
              )}
            </div>
          </div>
          <span className="text-xs font-mono font-semibold text-slate-700 bg-white border border-slate-200 px-2 py-1 rounded-md shadow-xs tabular-nums">
            {sseState.progress}%
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-slate-200/60 rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all duration-700 ease-out',
              isComplete ? 'bg-emerald-600' : isFailed ? 'bg-rose-500' : 'bg-slate-900'
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
        <div className="px-6 py-4 bg-rose-50/70 border-b border-rose-100 flex items-start gap-3">
          <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-rose-900">Pipeline encountered an issue</p>
            <p className="text-xs text-rose-700 mt-0.5">{failedError}</p>
          </div>
        </div>
      )}

      {/* Step list */}
      {isRunning && (
        <ol className="p-6 space-y-3 bg-white" aria-label="Generation steps">
          {STEP_ORDER.map((step, idx) => {
            const isDone = idx < currentStepIndex;
            const isCurrent = idx === currentStepIndex;
            const isPending = idx > currentStepIndex;
            return (
              <li
                key={step}
                className={clsx('flex items-center gap-3 text-xs tracking-tight transition-colors', {
                  'text-slate-900 font-medium': isDone,
                  'text-blue-700 font-semibold': isCurrent,
                  'text-slate-400': isPending,
                })}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {isDone && (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                )}
                {isCurrent && (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" aria-hidden="true" />
                )}
                {isPending && (
                  <span className="h-4 w-4 shrink-0 rounded-full border border-slate-300 flex items-center justify-center text-[9px] text-slate-400" aria-hidden="true">
                    {idx + 1}
                  </span>
                )}
                <span>{STEP_LABELS[step] ?? step}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
