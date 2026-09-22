'use client';

import React, { useEffect, useState } from 'react';
import { useKits, KitListItem } from '@/contexts/KitContext';
import { CreateKitModal } from './CreateKitModal';
import { GenerationProgress } from '../generation/GenerationProgress';
import {
  Plus,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronRight,
  FileText,
  Building2,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react';
import { clsx } from 'clsx';

interface DashboardProps {
  onOpenKit: (id: string) => void;
}

export function Dashboard({ onOpenKit }: DashboardProps) {
  const { list, listLoading, listError, fetchList } = useKits();
  const [showModal, setShowModal] = useState(false);
  const [activeJobKitId, setActiveJobKitId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-reconnect to active generating job if user refreshes the browser
  useEffect(() => {
    if (!activeJobId && list.length > 0) {
      const runningKit = list.find((k) => k.status === 'generating' && k.activeJobId);
      if (runningKit && runningKit.activeJobId) {
        setActiveJobId(runningKit.activeJobId);
        setActiveJobKitId(runningKit.id);
      }
    }
  }, [list, activeJobId]);

  const handleCreated = (kitId: string, jobId: string) => {
    setShowModal(false);
    setActiveJobKitId(kitId);
    setActiveJobId(jobId);
  };

  const handleKitClick = (kit: KitListItem) => {
    if (kit.status === 'generating' && kit.activeJobId) {
      setActiveJobId(kit.activeJobId);
      setActiveJobKitId(kit.id);
      return;
    }
    if (kit.status === 'ready') {
      onOpenKit(kit.id);
    }
  };

  const handleGenerationDone = async (kitId: string) => {
    setActiveJobId(null);
    setActiveJobKitId(null);
    await fetchList();
    onOpenKit(kitId);
  };

  const handleGenerationFailed = () => {
    setActiveJobId(null);
    setActiveJobKitId(null);
    fetchList();
  };

  // Derive metrics strictly from real data
  const totalKits = list.length;
  const readyKits = list.filter((k) => k.status === 'ready').length;
  const generatingKits = list.filter((k) => k.status === 'generating').length;

  return (
    <div className="space-y-6">
      {/* Active generation progress */}
      {activeJobId && (
        <div className="mb-6">
          <GenerationProgress
            jobId={activeJobId}
            onComplete={handleGenerationDone}
            onFailed={handleGenerationFailed}
          />
        </div>
      )}

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/60">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Your Prep Kits</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Generate, review, and practice for upcoming interviews.
          </p>
        </div>
        <div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 active:bg-blue-800 shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Kit
          </button>
        </div>
      </div>

      {/* Summary stats row if kits exist */}
      {!listLoading && !listError && totalKits > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-xl">
          <div className="bg-white border border-slate-200/80 rounded-xl p-3 sm:p-4 shadow-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Kits</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">{totalKits}</p>
          </div>
          <div className="bg-white border border-slate-200/80 rounded-xl p-3 sm:p-4 shadow-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Ready</p>
            <p className="text-xl sm:text-2xl font-bold text-emerald-700 mt-0.5">{readyKits}</p>
          </div>
          <div className="bg-white border border-slate-200/80 rounded-xl p-3 sm:p-4 shadow-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">In Progress</p>
            <p className="text-xl sm:text-2xl font-bold text-blue-700 mt-0.5">{generatingKits}</p>
          </div>
        </div>
      )}

      {/* Content */}
      {listLoading ? (
        <div className="grid grid-cols-1 gap-3 py-4">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 animate-pulse"
            >
              <div className="flex items-center gap-2">
                <div className="w-16 h-4 bg-slate-100 rounded" />
                <div className="w-12 h-4 bg-slate-100 rounded" />
              </div>
              <div className="w-48 h-5 bg-slate-100 rounded" />
              <div className="w-32 h-3.5 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : listError ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50/70 p-5 sm:p-6 flex items-start gap-3.5"
        >
          <AlertCircle className="h-5 w-5 text-rose-500 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-rose-900">Failed to load prep kits</p>
            <p className="text-xs text-rose-700 mt-1 leading-relaxed">{listError}</p>
            <button
              type="button"
              onClick={fetchList}
              className="mt-3 inline-flex items-center text-xs font-semibold text-rose-700 hover:text-rose-900 underline focus:outline-none"
            >
              Try again
            </button>
          </div>
        </div>
      ) : list.length === 0 ? (
        <EmptyState onNew={() => setShowModal(true)} />
      ) : (
        <div className="space-y-3">
          {list.map((kit) => (
            <KitCard key={kit.id} kit={kit} onOpen={() => handleKitClick(kit)} />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <CreateKitModal onClose={() => setShowModal(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200/90 bg-white text-center py-16 px-6 shadow-xs max-w-2xl mx-auto">
      <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
        <Sparkles className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold text-slate-900">Your interview prep starts here.</h2>
      <p className="mt-1.5 text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
        Turn any job description into a personalized interview prep kit with requirements analysis, question bank, active-recall flashcards, and a structured study timeline.
      </p>
      <button
        type="button"
        onClick={onNew}
        className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Create your first interview prep kit
      </button>
    </div>
  );
}

function KitCard({ kit, onOpen }: { kit: KitListItem; onOpen: () => void }) {
  const isClickable = kit.status === 'ready' || kit.status === 'generating';

  const roleTitle = kit.role || 'Target Role';
  const companyName = kit.company || (kit.companyUrl ? new URL(kit.companyUrl).hostname : 'Company');

  const formattedDate = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(kit.updatedAt));

  return (
    <div
      className={clsx(
        'group bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 transition-all relative overflow-hidden',
        isClickable
          ? 'hover:border-slate-300 hover:shadow-xs hover:translate-y-[-1px] cursor-pointer'
          : 'opacity-70 cursor-default'
      )}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={isClickable ? `Open prep kit: ${roleTitle} at ${companyName}` : undefined}
      onClick={isClickable ? onOpen : undefined}
      onKeyDown={isClickable ? (e) => e.key === 'Enter' && onOpen() : undefined}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Header Row with Badges */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {kit.status === 'ready' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Ready
              </span>
            )}
            {kit.status === 'generating' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200/60 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                Generating…
              </span>
            )}
            {kit.status === 'failed' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200/60">
                <AlertCircle className="w-3 h-3 text-rose-500" />
                Generation failed
              </span>
            )}

            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-200/60 px-2 py-0.5 rounded-md">
              <Calendar className="w-3 h-3 text-slate-400" />
              {kit.daysAvailable}d prep
            </span>

            {kit.generationVersion > 1 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-200/60 px-2 py-0.5 rounded-md">
                v{kit.generationVersion}
              </span>
            )}
          </div>

          {/* Title & Company */}
          <div className="space-y-0.5">
            <h2 className="text-base font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
              {roleTitle}
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-medium text-slate-600 truncate">{companyName}</span>
              <span className="text-slate-300">·</span>
              <span>Updated {formattedDate}</span>
            </div>
          </div>
        </div>

        {/* Action Icon */}
        <div className="flex items-center justify-end">
          {isClickable && (
            <div className="w-8 h-8 rounded-lg bg-slate-50 group-hover:bg-blue-50 text-slate-400 group-hover:text-blue-600 flex items-center justify-center transition-colors">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
