'use client';

import React from 'react';
import { BuilderViewModel } from '@trao/shared';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
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
      {/* Role + Company */}
      <Section title="Role">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Datum label="Title" value={kit.role?.title} />
          <Datum label="Seniority" value={kit.role?.seniority} />
          <Datum label="Company" value={kit.source?.company} />
          <Datum label="Location" value={kit.source?.location} />
        </dl>
        {(kit.role?.responsibilities ?? []).length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Key Responsibilities
            </p>
            <ul className="space-y-1">
              {kit.role.responsibilities.map((r, i) => (
                <li key={i} className="text-sm text-slate-700 flex gap-2">
                  <span className="text-slate-300 select-none">–</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* Company brief */}
      {kit.company_brief?.summary && (
        <Section title="Company Summary">
          <p className="text-sm text-slate-700 leading-relaxed">{kit.company_brief.summary}</p>
          {kit.company_brief.what_they_do && (
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              {kit.company_brief.what_they_do}
            </p>
          )}
        </Section>
      )}

      {/* Stats */}
      <Section title="Prep Summary">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Prep days" value={String(kit.schedule?.days_available ?? 0)} />
          <Stat label="Questions" value={String(kit.questions?.length ?? 0)} />
          <Stat label="Flashcards" value={String(kit.flashcards?.length ?? 0)} />
          <Stat label="Schedule days" value={String(kit.schedule?.days?.length ?? 0)} />
        </div>
      </Section>

      {/* Coverage */}
      <Section title="Requirement Coverage">
        <div className="flex items-center gap-3 mb-3">
          {mustPct >= 100 ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" aria-hidden="true" />
          ) : mustPct >= 70 ? (
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" aria-hidden="true" />
          ) : (
            <XCircle className="h-5 w-5 text-red-400 shrink-0" aria-hidden="true" />
          )}
          <div>
            <p className="text-sm font-medium text-slate-900">
              Must-have requirements:{' '}
              <span
                className={clsx(
                  mustPct >= 100 ? 'text-emerald-600' : mustPct >= 70 ? 'text-amber-600' : 'text-red-500'
                )}
              >
                {mustCovered} / {mustReqs.length} covered ({mustPct}%)
              </span>
            </p>
            {uncoveredMust.length > 0 && (
              <p className="text-xs text-red-500 mt-0.5">
                {uncoveredMust.length} uncovered must-have requirement
                {uncoveredMust.length > 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        {/* Coverage bar */}
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all',
              mustPct >= 100 ? 'bg-emerald-500' : mustPct >= 70 ? 'bg-amber-400' : 'bg-red-400'
            )}
            style={{ width: `${mustPct}%` }}
            role="progressbar"
            aria-valuenow={mustPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Must-have coverage: ${mustPct}%`}
          />
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-6 py-5">
      <h2 className="text-sm font-semibold text-slate-900 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Datum({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-400 mb-0.5">{label}</dt>
      <dd className="text-sm text-slate-800">{value || <span className="text-slate-300">—</span>}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-4 py-3">
      <p className="text-xl font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}
