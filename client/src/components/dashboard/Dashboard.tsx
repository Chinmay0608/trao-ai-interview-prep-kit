'use client';

import React, { useEffect, useState } from 'react';
import { useKits, KitListItem } from '@/contexts/KitContext';
import { CreateKitModal } from './CreateKitModal';
import { GenerationProgress } from '../generation/GenerationProgress';
import {
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronRight,
  FileText,
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

  const handleCreated = (kitId: string, jobId: string) => {
    setShowModal(false);
    setActiveJobKitId(kitId);
    setActiveJobId(jobId);
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

  return (
    <div>
      {/* Active generation progress */}
      {activeJobId && (
        <div className="mb-8">
          <GenerationProgress
            jobId={activeJobId}
            onComplete={handleGenerationDone}
            onFailed={handleGenerationFailed}
          />
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Your Prep Kits</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Generate, review, and practice for upcoming interviews.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New Kit
        </button>
      </div>

      {/* Content */}
      {listLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="Loading" />
        </div>
      ) : listError ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-6 py-5 flex items-start gap-3"
        >
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-red-800">Failed to load prep kits</p>
            <p className="text-sm text-red-700 mt-0.5">{listError}</p>
            <button
              type="button"
              onClick={fetchList}
              className="mt-2 text-sm font-medium text-red-700 hover:text-red-900 underline focus:outline-none"
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
            <KitCard key={kit.id} kit={kit} onOpen={() => onOpenKit(kit.id)} />
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
    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white text-center py-16 px-6">
      <FileText className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
      <h2 className="mt-4 text-base font-medium text-slate-700">No prep kits yet</h2>
      <p className="mt-1 text-sm text-slate-500">
        Create your first interview prep kit to get started.
      </p>
      <button
        type="button"
        onClick={onNew}
        className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Create your first kit
      </button>
    </div>
  );
}

function KitCard({ kit, onOpen }: { kit: KitListItem; onOpen: () => void }) {
  const statusIcon = {
    ready: <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />,
    generating: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" aria-hidden="true" />,
    failed: <AlertCircle className="h-4 w-4 text-red-400" aria-hidden="true" />,
  }[kit.status];

  const statusLabel = {
    ready: 'Ready',
    generating: 'Generating…',
    failed: 'Failed',
  }[kit.status];

  const title = kit.role
    ? kit.company
      ? `${kit.role} at ${kit.company}`
      : kit.role
    : kit.companyUrl;

  const formattedDate = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(kit.updatedAt));

  const isClickable = kit.status === 'ready' || kit.status === 'generating';

  return (
    <div
      className={clsx(
        'group bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center justify-between transition-colors',
        isClickable ? 'hover:border-slate-300 cursor-pointer' : 'opacity-75 cursor-default'
      )}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={isClickable ? `Open prep kit: ${title}` : undefined}
      onClick={isClickable ? onOpen : undefined}
      onKeyDown={isClickable ? (e) => e.key === 'Enter' && onOpen() : undefined}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          {statusIcon}
          <span className="text-xs font-medium text-slate-500">{statusLabel}</span>
          <span className="text-xs text-slate-300">·</span>
          <span className="text-xs text-slate-400">
            {kit.daysAvailable}d prep
          </span>
        </div>
        <p className="text-sm font-medium text-slate-900 truncate">{title}</p>
        <p className="text-xs text-slate-400 mt-0.5">Updated {formattedDate}</p>
      </div>
      {isClickable && (
        <ChevronRight
          className="h-4 w-4 text-slate-300 group-hover:text-slate-500 shrink-0 transition-colors"
          aria-hidden="true"
        />
      )}
      {kit.status === 'failed' && (
        <span className="text-xs text-red-400 shrink-0">Generation failed</span>
      )}
    </div>
  );
}
