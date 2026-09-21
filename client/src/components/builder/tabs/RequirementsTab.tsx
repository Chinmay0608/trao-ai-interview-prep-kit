'use client';

import React from 'react';
import { BuilderViewModel, InternalRequirement } from '@trao/shared';
import { CheckCircle2, XCircle } from 'lucide-react';
import { clsx } from 'clsx';

interface RequirementsTabProps {
  kit: BuilderViewModel;
}

export function RequirementsTab({ kit }: RequirementsTabProps) {
  const requirements = (kit.role?.requirements ?? []) as InternalRequirement[];
  const uncoveredIds = new Set(kit.coverage?.uncovered_requirement_ids ?? []);

  const must = requirements.filter((r) => r.priority === 'must');
  const nice = requirements.filter((r) => r.priority === 'nice');

  if (requirements.length === 0) {
    return (
      <p className="text-sm text-slate-400 py-8 text-center">
        Requirements will appear after the kit is generated.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <RequirementGroup
        label="Must-have"
        items={must}
        uncoveredIds={uncoveredIds}
        kit={kit}
        colorClass="text-red-500"
        badgeClass="bg-red-50 text-red-600 border-red-200"
      />
      {nice.length > 0 && (
        <RequirementGroup
          label="Nice-to-have"
          items={nice}
          uncoveredIds={uncoveredIds}
          kit={kit}
          colorClass="text-blue-500"
          badgeClass="bg-blue-50 text-blue-600 border-blue-200"
        />
      )}
    </div>
  );
}

function RequirementGroup({
  label,
  items,
  uncoveredIds,
  kit,
  colorClass,
  badgeClass,
}: {
  label: string;
  items: InternalRequirement[];
  uncoveredIds: Set<string>;
  kit: BuilderViewModel;
  colorClass: string;
  badgeClass: string;
}) {
  if (items.length === 0) return null;
  const covered = items.filter((r) => !uncoveredIds.has(r.id)).length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-slate-900">{label}</h2>
        <span
          className={clsx('text-xs font-medium px-2 py-0.5 rounded-full border', badgeClass)}
        >
          {covered}/{items.length} covered
        </span>
      </div>
      <div className="space-y-2">
        {items.map((req) => {
          const isCovered = !uncoveredIds.has(req.id);
          const linkedQs = kit.questions?.filter((q) =>
            q.requirement_ids?.includes(req.id)
          ) ?? [];

          return (
            <div
              key={req.id}
              className={clsx(
                'bg-white rounded-lg border px-4 py-3',
                isCovered ? 'border-slate-200' : 'border-amber-200 bg-amber-50'
              )}
            >
              <div className="flex items-start gap-2">
                {isCovered ? (
                  <CheckCircle2
                    className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0"
                    aria-label="Covered"
                  />
                ) : (
                  <XCircle
                    className="h-4 w-4 text-amber-500 mt-0.5 shrink-0"
                    aria-label="Uncovered"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-xs font-mono text-slate-400">{req.id}</span>
                    <span
                      className={clsx(
                        'text-xs font-medium px-1.5 py-0.5 rounded border',
                        req.kind === 'technical'
                          ? 'bg-purple-50 text-purple-600 border-purple-200'
                          : req.kind === 'behavioural'
                          ? 'bg-teal-50 text-teal-600 border-teal-200'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      )}
                    >
                      {req.kind}
                    </span>
                    {!isCovered && (
                      <span className="text-xs text-amber-600 font-medium">Uncovered</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-800">{req.text}</p>
                  {linkedQs.length > 0 && (
                    <p className="text-xs text-slate-400 mt-1">
                      {linkedQs.length} question{linkedQs.length !== 1 ? 's' : ''} linked
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
