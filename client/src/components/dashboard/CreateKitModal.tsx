'use client';

import React, { useState, useId } from 'react';
import { api, ApiError } from '@/lib/api';
import { useKits } from '@/contexts/KitContext';
import { X, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react';
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

  const dayPresets = [1, 3, 5, 7, 14, 30, 60];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-kit-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative bg-white rounded-2xl shadow-xl border border-slate-200/90 w-full max-w-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 id="create-kit-title" className="text-base font-semibold text-slate-900 tracking-tight">
                New Interview Prep Kit
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div
              role="alert"
              className="rounded-xl bg-rose-50 border border-rose-200/80 px-4 py-3 text-xs font-medium text-rose-800 flex items-start gap-2.5"
            >
              <span className="text-rose-500 font-bold shrink-0">!</span>
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Job Description */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor={jdId} className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Step 1: Job Description
              </label>
              <span className={clsx('text-[11px] font-mono', jd.length > 45000 ? 'text-amber-600' : 'text-slate-400')}>
                {jd.length.toLocaleString()} / 50,000
              </span>
            </div>
            <textarea
              id={jdId}
              required
              rows={6}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the target job description here (title, requirements, responsibilities, tech stack)…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/40 p-3.5 text-xs sm:text-sm text-slate-900 placeholder-slate-400 transition-colors focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-y min-h-[140px]"
            />
            <p className="text-[11px] text-slate-400">
              Tip: Include the full requirement bullet points for more accurate gap coverage and scenario matching.
            </p>
          </div>

          {/* STEP 2: Company Website */}
          <div className="space-y-1.5">
            <label htmlFor={urlId} className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
              Step 2: Company Website URL
            </label>
            <input
              id={urlId}
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://company.com or https://company.com/careers"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/40 px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder-slate-400 transition-colors focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <p className="text-[11px] text-slate-400">
              Used for SSRF-safe crawling and factual public interview research. Must start with http:// or https://.
            </p>
          </div>

          {/* STEP 3: Days Available */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor={daysId} className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Step 3: Days Available to Prepare
              </label>
              <span className="text-[11px] text-slate-500 font-medium">1–60 days</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                id={daysId}
                type="number"
                required
                min={1}
                max={60}
                value={days}
                onChange={(e) => setDays(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-24 rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-2 text-sm font-semibold text-slate-900 transition-colors focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-center"
              />
              {/* Presets */}
              <div className="flex flex-wrap items-center gap-1.5 flex-1">
                {dayPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDays(preset)}
                    className={clsx(
                      'px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all',
                      days === preset
                        ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900'
                    )}
                  >
                    {preset}d
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* What happens next banner */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">What happens next?</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="text-[11px] text-slate-600 flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                <span>1. Analyze role requirements</span>
              </div>
              <div className="text-[11px] text-slate-600 flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                <span>2. Research company</span>
              </div>
              <div className="text-[11px] text-slate-600 flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                <span>3. Generate questions</span>
              </div>
              <div className="text-[11px] text-slate-600 flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                <span>4. Build schedule</span>
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={clsx(
                'inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 active:bg-blue-800 shadow-sm transition-all',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                'disabled:opacity-60 disabled:cursor-not-allowed'
              )}
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Generating…</span>
                </>
              ) : (
                <>
                  <span>Generate Prep Kit</span>
                  <ArrowRight className="w-4 h-4 text-blue-200" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
