'use client';

import React, { useEffect, useState } from 'react';
import { BuilderViewModel } from '@trao/shared';
import { useKits } from '@/contexts/KitContext';
import { api, ApiError } from '@/lib/api';
import { ArrowLeft, Loader2, AlertCircle, Download, CheckCircle2, Building2, Calendar, Layers, Sparkles } from 'lucide-react';
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
        className="rounded-xl border border-rose-200 bg-rose-50 px-6 py-5 flex items-start gap-3.5"
      >
        <AlertCircle className="h-5 w-5 text-rose-500 mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-rose-900">Failed to load prep kit</p>
          <p className="text-xs text-rose-700 mt-0.5 leading-relaxed">{activeKitError}</p>
          <button
            type="button"
            onClick={() => fetchKit(kitId)}
            className="mt-2 text-xs font-semibold text-rose-700 hover:text-rose-900 underline focus:outline-none"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!activeKit) return null;

  const kit = activeKit;
  const roleTitle = kit.role?.title || 'Target Role';
  const companyName = kit.source?.company || (kit.source?.company_url ? new URL(kit.source.company_url).hostname : 'Company');

  return (
    <div className="space-y-6">
      {/* Failure alert banner */}
      {kit.status === 'failed' && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50/80 px-5 py-4 flex items-start gap-3 shadow-xs"
        >
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">Generation could not be fully completed</p>
            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
              The external provider returned an error or hit a rate limit. The kit remains accessible with all partially generated evidence.
            </p>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to dashboard"
              className="mt-1 p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-tight truncate">
                  {roleTitle}
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Ready
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  {companyName}
                </span>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1 text-slate-600">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {kit.schedule?.days_available ?? 0} day prep
                </span>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1 text-slate-600">
                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                  {kit.questions?.length ?? 0} questions
                </span>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1 text-slate-600">
                  <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                  {kit.flashcards?.length ?? 0} flashcards
                </span>
              </div>
            </div>
          </div>

          {/* Export Action */}
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {exportError && (
              <span className="text-xs font-medium text-rose-600" role="alert">{exportError}</span>
            )}
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100 transition-all shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
              aria-label="Export Appendix A JSON"
            >
              <Download className="h-4 w-4 text-slate-400" aria-hidden="true" />
              <span>{exporting ? 'Exporting…' : 'Export JSON'}</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-t border-slate-100 mt-5 pt-3 -mb-2">
          <nav className="-mb-px flex space-x-1 sm:space-x-2 overflow-x-auto no-scrollbar" aria-label="Builder sections">
            {TABS.map(({ id, label }) => {
              const count =
                id === 'questions'
                  ? kit.questions?.length
                  : id === 'flashcards'
                  ? kit.flashcards?.length
                  : id === 'requirements'
                  ? kit.role?.requirements?.length
                  : undefined;

              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={clsx(
                    'shrink-0 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 whitespace-nowrap',
                    tab === id
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  )}
                >
                  <span>{label}</span>
                  {count !== undefined && count > 0 && (
                    <span
                      className={clsx(
                        'ml-1.5 px-1.5 py-0.5 rounded text-[11px]',
                        tab === id ? 'bg-blue-100/80 text-blue-800' : 'bg-slate-100 text-slate-500'
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Tab Panels */}
      <div role="tabpanel" className="transition-all">
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
