'use client';

import React from 'react';
import { BuilderViewModel } from '@trao/shared';
import { CheckCircle2, XCircle, AlertCircle, Building2, Briefcase, Calendar, Layers, Sparkles, Check } from 'lucide-react';
import { clsx } from 'clsx';

interface OverviewTabProps {
  kit: BuilderViewModel;
}

export function OverviewTab({ kit }: OverviewTabProps) {
  const coverage = kit.coverage;
  const requirements = kit.role?.requirements ?? [];
  const mustReqs = requirements.filter((r) => r.priority === 'must');
  const uncoveredMust = (coverage?.uncovered_requirement_ids ?? []).filter((id) =>
    mustReqs.some((r) => r.id === id)
  );
  const mustCovered = mustReqs.length - uncoveredMust.length;
  const mustPct =
    mustReqs.length > 0 ? Math.round((mustCovered / mustReqs.length) * 100) : 100;

  return (
    <div className="space-y-6">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          icon={<Briefcase className="w-4 h-4 text-blue-600" />}
          label="Target Role"
          value={kit.role?.title || 'Engineer'}
          subtitle={kit.role?.seniority ? `${kit.role.seniority} level` : undefined}
        />
        <MetricCard
          icon={<Building2 className="w-4 h-4 text-slate-600" />}
          label="Company"
          value={kit.source?.company || 'Company'}
          subtitle={kit.source?.location || 'Not specified'}
        />
        <MetricCard
          icon={<Calendar className="w-4 h-4 text-emerald-600" />}
          label="Prep Timeline"
          value={`${kit.schedule?.days_available ?? 0} Days`}
          subtitle={`${kit.schedule?.days?.length ?? 0} scheduled sessions`}
        />
        <MetricCard
          icon={<Sparkles className="w-4 h-4 text-purple-600" />}
          label="Active Content"
          value={`${kit.questions?.length ?? 0} Qs`}
          subtitle={`${kit.flashcards?.length ?? 0} Flashcards`}
        />
      </div>

      {/* Requirement Coverage Summary */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            {mustPct >= 100 ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" aria-hidden="true" />
            ) : mustPct >= 70 ? (
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" aria-hidden="true" />
            ) : (
              <XCircle className="h-5 w-5 text-rose-500 shrink-0" aria-hidden="true" />
            )}
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Must-Have Requirement Coverage</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {mustCovered} of {mustReqs.length} essential requirements directly covered by interview questions
              </p>
            </div>
          </div>
          <span className={clsx(
            'text-sm font-bold self-start sm:self-auto px-2.5 py-0.5 rounded-full border',
            mustPct >= 100
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
              : mustPct >= 70
              ? 'bg-amber-50 text-amber-700 border-amber-200/60'
              : 'bg-rose-50 text-rose-700 border-rose-200/60'
          )}>
            {mustPct}%
          </span>
        </div>

        {/* Coverage Progress Bar */}
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all duration-500',
              mustPct >= 100 ? 'bg-emerald-500' : mustPct >= 70 ? 'bg-amber-400' : 'bg-rose-500'
            )}
            style={{ width: `${mustPct}%` }}
            role="progressbar"
            aria-valuenow={mustPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Must-have coverage: ${mustPct}%`}
          />
        </div>
      </div>

      {/* Key Responsibilities */}
      {(kit.role?.responsibilities ?? []).length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 tracking-tight">Key Responsibilities</h2>
          <ul className="space-y-2 pt-1">
            {kit.role.responsibilities.map((r, i) => (
              <li key={i} className="text-xs sm:text-sm text-slate-700 flex items-start gap-2.5 leading-relaxed">
                <span className="w-4 h-4 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Company Brief */}
      {kit.company_brief?.summary && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 tracking-tight">Company Context</h2>
            <span className="text-[11px] font-medium text-slate-400">Verified factual summary</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{kit.company_brief.summary}</p>
          {kit.company_brief.what_they_do && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">What They Do</p>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {kit.company_brief.what_they_do}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-1">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-slate-50 border border-slate-100 flex items-center justify-center">
          {icon}
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      </div>
      <p className="text-base sm:text-lg font-bold text-slate-900 truncate">{value}</p>
      {subtitle && <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>}
    </div>
  );
}
