'use client';

import React from 'react';
import { BuilderViewModel, InternalRequirement } from '@trao/shared';
import { CheckCircle2, AlertCircle, Check, CircleDot } from 'lucide-react';
import { clsx } from 'clsx';

interface RequirementsTabProps {
  kit: BuilderViewModel;
}

export function RequirementsTab({ kit }: RequirementsTabProps) {
  const requirements = (kit.role?.requirements ?? []) as InternalRequirement[];
  const uncoveredIds = new Set(kit.coverage?.uncovered_requirement_ids ?? []);

  const must = requirements.filter((r) => r.priority === 'must');
  const nice = requirements.filter((r) => r.priority === 'nice');

  const mustCoveredCount = must.filter((r) => !uncoveredIds.has(r.id)).length;
  const mustPercentage = must.length > 0 ? Math.round((mustCoveredCount / must.length) * 100) : 100;

  if (requirements.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center shadow-xs">
        <p className="text-sm text-slate-500">
          Requirements will appear after the kit is generated.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Coverage Summary Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Must-Have Requirement Coverage</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {mustCoveredCount} / {must.length} must-have requirements covered ({mustPercentage}%)
            </p>
          </div>
          <span
            className={clsx(
              'text-xs font-bold px-3 py-1 rounded-full border self-start sm:self-auto',
              mustPercentage >= 100
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                : mustPercentage >= 70
                ? 'bg-amber-50 text-amber-700 border-amber-200/60'
                : 'bg-rose-50 text-rose-700 border-rose-200/60'
            )}
          >
            {mustCoveredCount} of {must.length} Covered
          </span>
        </div>

        {/* Compact progress bar */}
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all duration-500',
              mustPercentage >= 100 ? 'bg-emerald-500' : mustPercentage >= 70 ? 'bg-amber-400' : 'bg-rose-500'
            )}
            style={{ width: `${mustPercentage}%` }}
            role="progressbar"
            aria-valuenow={mustPercentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Must-have coverage: ${mustPercentage}%`}
          />
        </div>
      </div>

      {/* Must-Have Group */}
      <RequirementGroup
        label="Must-Have Requirements"
        priorityTag="MUST-HAVE"
        items={must}
        uncoveredIds={uncoveredIds}
        kit={kit}
      />

      {/* Nice-to-Have Group */}
      {nice.length > 0 && (
        <RequirementGroup
          label="Nice-to-Have Requirements"
          priorityTag="NICE-TO-HAVE"
          items={nice}
          uncoveredIds={uncoveredIds}
          kit={kit}
        />
      )}
    </div>
  );
}

function RequirementGroup({
  label,
  priorityTag,
  items,
  uncoveredIds,
  kit,
}: {
  label: string;
  priorityTag: 'MUST-HAVE' | 'NICE-TO-HAVE';
  items: InternalRequirement[];
  uncoveredIds: Set<string>;
  kit: BuilderViewModel;
}) {
  if (items.length === 0) return null;
  const covered = items.filter((r) => !uncoveredIds.has(r.id)).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">{label}</h3>
          <span className="text-xs text-slate-400">({items.length})</span>
        </div>
        <span className="text-xs font-medium text-slate-500">
          {covered}/{items.length} covered
        </span>
      </div>

      <div className="space-y-3">
        {items.map((req) => {
          const isCovered = !uncoveredIds.has(req.id);
          const linkedQs = kit.questions?.filter((q) =>
            q.requirement_ids?.includes(req.id)
          ) ?? [];

          return (
            <div
              key={req.id}
              className={clsx(
                'bg-white rounded-xl border p-4 sm:p-5 transition-all shadow-2xs',
                isCovered ? 'border-slate-200/90' : 'border-amber-200/90 bg-amber-50/30'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2 flex-1 min-w-0">
                  {/* Badges Row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={clsx(
                        'px-2 py-0.5 rounded text-[10px] font-bold tracking-wide border',
                        priorityTag === 'MUST-HAVE'
                          ? 'bg-rose-50 text-rose-700 border-rose-200/60'
                          : 'bg-blue-50 text-blue-700 border-blue-200/60'
                      )}
                    >
                      {priorityTag}
                    </span>

                    <span
                      className={clsx(
                        'px-2 py-0.5 rounded text-[11px] font-medium border capitalize',
                        req.kind === 'technical'
                          ? 'bg-purple-50 text-purple-700 border-purple-200/60'
                          : req.kind === 'behavioural'
                          ? 'bg-teal-50 text-teal-700 border-teal-200/60'
                          : 'bg-slate-50 text-slate-700 border-slate-200/60'
                      )}
                    >
                      {req.kind}
                    </span>

                    <span className="text-[11px] font-mono text-slate-400 select-none">
                      {req.id}
                    </span>
                  </div>

                  {/* Requirement Text */}
                  <p className="text-xs sm:text-sm font-medium text-slate-900 leading-relaxed">
                    {req.text}
                  </p>

                  {/* Coverage Status Row */}
                  <div className="flex items-center gap-2 text-xs pt-0.5">
                    {isCovered ? (
                      <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label="Covered" />
                        <span>Covered · {linkedQs.length} question{linkedQs.length !== 1 ? 's' : ''} linked</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-amber-700 font-medium">
                        <CircleDot className="h-3.5 w-3.5 text-amber-600" aria-label="Uncovered" />
                        <span>Uncovered (no questions currently address this requirement)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
