'use client';

import React, { useEffect, useState } from 'react';
import { BuilderViewModel } from '@trao/shared';
import { useKits } from '@/contexts/KitContext';
import { api, ApiError } from '@/lib/api';
import { ArrowLeft, Loader2, AlertCircle, Download } from 'lucide-react';
import { OverviewTab } from './tabs/OverviewTab';
import { RequirementsTab } from './tabs/RequirementsTab';
import { QuestionsTab } from './tabs/QuestionsTab';
import { FlashcardsTab } from './tabs/FlashcardsTab';
import { ScheduleTab } from './tabs/ScheduleTab';
import { CompanyResearchTab } from './tabs/CompanyResearchTab';
import { clsx } from 'clsx';

type Tab = 'overview' | 'requirements' | 'questions' | 'flashcards' | 'schedule' | 'research';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'requirements', label: 'Requirements' },
  { id: 'questions', label: 'Questions' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'research', label: 'Company' },
];

interface KitBuilderProps {
  kitId: string;
  onBack: () => void;
}

export function KitBuilder({ kitId, onBack }: KitBuilderProps) {
  const { activeKit, activeKitLoading, activeKitError, fetchKit, refreshKit } = useKits();
  const [tab, setTab] = useState<Tab>('overview');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    fetchKit(kitId);
  }, [kitId, fetchKit]);

  const handleExport = async () => {
    setExportError(null);
    setExporting(true);
    try {
      const appendixA = await api.kits.exportAppendixA(kitId);
      const blob = new Blob([JSON.stringify(appendixA, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prep-kit-${kitId.slice(-8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Export failed.';
      setExportError(msg);
    } finally {
      setExporting(false);
    }
  };

  if (activeKitLoading && !activeKit) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="Loading kit" />
      </div>
    );
  }

  if (activeKitError) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-5 flex items-start gap-3"
      >
        <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-red-800">Failed to load prep kit</p>
          <p className="text-sm text-red-700 mt-0.5">{activeKitError}</p>
          <button
            type="button"
            onClick={() => fetchKit(kitId)}
            className="mt-2 text-sm font-medium text-red-700 hover:text-red-900 underline focus:outline-none"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!activeKit) return null;

  const kit = activeKit;

  return (
    <div>
      {/* Failure alert banner */}
      {kit.status === 'failed' && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-start gap-3"
        >
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">Generation could not be completed</p>
            <p className="text-xs text-amber-700 mt-0.5">
              The external LLM provider returned an error (e.g. invalid API key or rate limit). You can create a new kit with the updated configuration.
            </p>
          </div>
        </div>
      )}

      {/* Back + Title + Actions */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to dashboard"
            className="mt-0.5 p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-900 leading-tight truncate">
              {kit.role?.title || 'Prep Kit'}
              {kit.source?.company ? (
                <span className="font-normal text-slate-500"> at {kit.source.company}</span>
              ) : null}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {kit.schedule?.days_available ?? 0} day prep ·{' '}
              {kit.questions?.length ?? 0} questions ·{' '}
              {kit.flashcards?.length ?? 0} flashcards
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {exportError && (
            <span className="text-xs text-red-500" role="alert">{exportError}</span>
          )}
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
            aria-label="Export Appendix A JSON"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {exporting ? 'Exporting…' : 'Export JSON'}
          </button>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="border-b border-slate-200 mb-6">
        <nav className="-mb-px flex overflow-x-auto" aria-label="Builder sections">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={clsx(
                'shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 whitespace-nowrap',
                tab === id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              )}
            >
              {label}
              {id === 'questions' && (
                <span className="ml-1.5 text-xs text-slate-400">({kit.questions?.length ?? 0})</span>
              )}
              {id === 'flashcards' && (
                <span className="ml-1.5 text-xs text-slate-400">({kit.flashcards?.length ?? 0})</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab panels */}
      <div role="tabpanel">
        {tab === 'overview' && <OverviewTab kit={kit} />}
        {tab === 'requirements' && <RequirementsTab kit={kit} />}
        {tab === 'questions' && (
          <QuestionsTab kit={kit} kitId={kitId} onKitUpdate={() => refreshKit(kitId)} />
        )}
        {tab === 'flashcards' && <FlashcardsTab kit={kit} />}
        {tab === 'schedule' && <ScheduleTab kit={kit} />}
        {tab === 'research' && <CompanyResearchTab kit={kit} />}
      </div>
    </div>
  );
}
