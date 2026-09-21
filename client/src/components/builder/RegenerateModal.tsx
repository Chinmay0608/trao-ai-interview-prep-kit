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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 id="regen-title" className="text-base font-semibold text-slate-900">
            Regenerate Questions
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Scope */}
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
            <p className="text-sm text-blue-800">
              <span className="font-medium">Scope: </span>
              Regenerating {scopeLabel}.
            </p>
          </div>

          {/* Preservation notice */}
          <div className="space-y-1.5 text-sm text-slate-600">
            <p className="font-medium text-slate-800">What will happen:</p>
            <ul className="space-y-1 text-sm">
              <li className="flex gap-2">
                <span className="text-red-400 shrink-0">↩</span>
                Pristine generated questions in scope will be replaced.
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-500 shrink-0">✓</span>
                <span className="text-slate-700 font-medium">Edited, custom, and pinned questions are preserved.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-500 shrink-0">✓</span>
                Flashcards for preserved questions are kept.
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-500 shrink-0">✓</span>
                Schedule is reconciled after regeneration.
              </li>
            </ul>
          </div>

          {/* Error */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3"
            >
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={running}
              className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={running}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
                'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              {running ? 'Regenerating…' : 'Regenerate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
