'use client';

import React, { useState, useId } from 'react';
import { api, ApiError } from '@/lib/api';
import { useKits } from '@/contexts/KitContext';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface CreateKitModalProps {
  onClose: () => void;
  onCreated: (kitId: string, jobId: string) => void;
}

export function CreateKitModal({ onClose, onCreated }: CreateKitModalProps) {
  const { fetchList } = useKits();
  const [jd, setJd] = useState('');
  const [url, setUrl] = useState('');
  const [days, setDays] = useState<number | ''>(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jdId = useId();
  const urlId = useId();
  const daysId = useId();

  const validate = (): string | null => {
    if (jd.trim().length < 10) return 'Job description must be at least 10 characters.';
    if (jd.length > 50_000) return 'Job description exceeds 50,000 characters.';
    if (!url.startsWith('http://') && !url.startsWith('https://'))
      return 'Company URL must start with http:// or https://';
    if (!days || days < 1 || days > 60)
      return 'Days available must be between 1 and 60.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.kits.create({
        jobDescription: jd.trim(),
        companyUrl: url.trim(),
        daysAvailable: Number(days),
      });
      await fetchList();
      onCreated(res.kitId, res.jobId);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to create prep kit. Please try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-kit-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 id="create-kit-title" className="text-base font-semibold text-slate-900">
            New Interview Prep Kit
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

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && (
            <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Job Description */}
          <div>
            <label htmlFor={jdId} className="block text-sm font-medium text-slate-700 mb-1">
              Job Description
            </label>
            <textarea
              id={jdId}
              required
              rows={8}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the full job description here…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
            />
            <p className="mt-1 text-xs text-slate-400 text-right">
              {jd.length.toLocaleString()} / 50,000
            </p>
          </div>

          {/* Company URL */}
          <div>
            <label htmlFor={urlId} className="block text-sm font-medium text-slate-700 mb-1">
              Company Website URL
            </label>
            <input
              id={urlId}
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Days Available */}
          <div>
            <label htmlFor={daysId} className="block text-sm font-medium text-slate-700 mb-1">
              Days Available to Prepare
            </label>
            <div className="flex items-center gap-3">
              <input
                id={daysId}
                type="number"
                required
                min={1}
                max={60}
                value={days}
                onChange={(e) => setDays(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-500">Between 1 and 60</span>
            </div>
            {/* Quick presets */}
            <div className="mt-2 flex gap-2">
              {[1, 5, 14, 30, 60].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDays(preset)}
                  className={clsx(
                    'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                    days === preset
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                  )}
                >
                  {preset}d
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Generating…' : 'Generate Prep Kit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
