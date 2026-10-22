'use client';

import React, { useState } from 'react';
import { useKits } from '@/contexts/KitContext';
import { ApiError } from '@/lib/api';
import { X, Trash2, AlertTriangle, Loader2 } from 'lucide-react';

interface DeleteKitModalProps {
  kitId: string;
  roleTitle: string;
  companyName: string;
  onClose: () => void;
  onDeleted?: () => void;
}

export function DeleteKitModal({
  kitId,
  roleTitle,
  companyName,
  onClose,
  onDeleted,
}: DeleteKitModalProps) {
  const { deleteKit } = useKits();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteKit(kitId);
      onDeleted?.();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to delete prep kit. Please try again.');
      }
      setDeleting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-kit-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        aria-hidden="true"
        onClick={deleting ? undefined : onClose}
      />

      {/* Modal Dialog */}
      <div className="relative bg-white rounded-2xl shadow-xl border border-slate-200/90 w-full max-w-md overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-rose-50/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <h2 id="delete-kit-title" className="text-base font-semibold text-slate-900 tracking-tight">
              Delete Prep Kit
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            aria-label="Close dialog"
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            Are you sure you want to delete the prep kit for{' '}
            <strong className="text-slate-900 font-semibold">{roleTitle}</strong> at{' '}
            <strong className="text-slate-900 font-semibold">{companyName}</strong>?
          </p>

          <div className="rounded-xl border border-rose-200/80 bg-rose-50/60 p-3.5 flex items-start gap-2.5 text-xs text-rose-800">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>
              This will permanently remove the question bank, flashcards, schedule, and all custom edits. This action cannot be undone.
            </span>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 font-medium"
            >
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={deleting}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-60"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Deleting…</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Prep Kit</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
