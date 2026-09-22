'use client';

import React, { useState, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import { QuestionCategory } from '@trao/shared';
import { X, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

interface RegenerateModalProps {
  kitId: string;
  generationVersion: number;
  category?: QuestionCategory;
  questionIds?: string[];
  onClose: () => void;
  onDone: () => Promise<void>;
}

const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  technical: 'Technical',
  behavioural: 'Behavioural',
  'system-design': 'System Design',
  'company-fit': 'Company Fit',
};

export function RegenerateModal({
  kitId,
  generationVersion,
  category,
  questionIds,
  onClose,
  onDone,
}: RegenerateModalProps) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopeLabel = questionIds?.length
    ? `${questionIds.length} selected question${questionIds.length !== 1 ? 's' : ''}`
    : category
    ? `all ${CATEGORY_LABELS[category]} questions`
    : 'all questions';

  const handleRegenerate = async () => {
    setRunning(true);
    setError(null);
    try {
      await api.kits.regenerate(kitId, {
        category,
        questionIds,
        generationVersion,
      });
      await onDone();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 409) {
          setError(
            'This kit was updated since you last loaded it. The page will now refresh with the latest version.'
          );
          setTimeout(async () => {
            await onDone();
            onClose();
          }, 2000);
        } else {
          setError(err.message);
        }
      } else {
        setError('Regeneration failed. Please try again.');
      }
      setRunning(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="regen-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
              <RefreshCw className="h-3.5 w-3.5" />
            </div>
            <div>
              <h2 id="regen-title" className="text-sm font-semibold text-slate-900">
                Regenerate Questions
              </h2>
              <p className="text-xs text-slate-500">Refreshes AI generated questions in scope</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Scope */}
          <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3.5 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Target Scope</span>
            <span className="text-xs font-semibold text-slate-900 capitalize bg-white border border-slate-200 px-2.5 py-1 rounded-md shadow-xs">
              {scopeLabel}
            </span>
          </div>

          {/* Preservation notice */}
          <div className="rounded-xl bg-slate-50/50 border border-slate-100 p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Preservation Guarantees
            </p>
            <ul className="space-y-2 text-xs text-slate-600">
              <li className="flex items-start gap-2">
                <span className="text-rose-500 font-bold shrink-0 mt-0.5">↩</span>
                <span>Pristine AI generated questions in scope will be replaced.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 font-bold shrink-0 mt-0.5">✓</span>
                <span className="text-slate-800 font-medium">
                  Edited, custom, and pinned questions are preserved.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 font-bold shrink-0 mt-0.5">✓</span>
                <span>Flashcards linked to preserved questions remain intact.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 font-bold shrink-0 mt-0.5">✓</span>
                <span>Prep schedule automatically reconciles with updated questions.</span>
              </li>
            </ul>
          </div>

          {/* Error */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 p-3.5"
            >
              <AlertCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-xs text-rose-700 leading-relaxed">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={running}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={running}
              className={clsx(
                'inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg text-white transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900',
                'bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs'
              )}
            >
              {running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {running ? 'Regenerating…' : 'Regenerate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
