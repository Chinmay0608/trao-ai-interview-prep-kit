'use client';

import React from 'react';
import { BuilderViewModel } from '@trao/shared';
import { AlertCircle } from 'lucide-react';

interface CompanyResearchTabProps {
  kit: BuilderViewModel;
}

export function CompanyResearchTab({ kit }: CompanyResearchTabProps) {
  const brief = kit.company_brief;
  const source = kit.source;

  const hasBrief = brief?.summary || brief?.what_they_do;
  const hasSources = (brief?.sources ?? []).length > 0;
  const hasHiringInfo = (source?.pages_used ?? []).length > 0;

  return (
    <div className="space-y-5">
      {/* Company overview */}
      <Section title="Company Overview">
        {hasBrief ? (
          <div className="space-y-3">
            {brief.summary && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                  Summary
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">{brief.summary}</p>
              </div>
            )}
            {brief.what_they_do && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">
                  What They Do
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">{brief.what_they_do}</p>
              </div>
            )}
          </div>
        ) : (
          <HonestGap message="No public company information was found during research." />
        )}
      </Section>

      {/* Source info */}
      <Section title="Research Details">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Datum label="Company URL" value={source?.company_url} />
          <Datum label="Researched at" value={source?.researched_at ? new Date(source.researched_at).toLocaleString() : undefined} />
          <Datum label="Pages crawled" value={source?.pages_used?.length ? String(source.pages_used.length) : undefined} />
          <Datum label="JD characters" value={source?.jd_chars ? source.jd_chars.toLocaleString() : undefined} />
        </dl>
      </Section>

      {/* Pages used */}
      {hasHiringInfo && (
        <Section title="Crawled Pages">
          <ul className="space-y-1">
            {source.pages_used.map((url, i) => (
              <li key={i} className="text-sm text-slate-500 font-mono truncate">{url}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Sources from brief */}
      {hasSources && (
        <Section title="Research Sources">
          <ul className="space-y-1">
            {brief.sources.map((url, i) => (
              <li key={i} className="text-sm text-slate-500 font-mono truncate">{url}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Honesty disclaimer */}
      <div className="flex items-start gap-2 text-xs text-slate-400 border-t border-slate-100 pt-4">
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <p>
          All research data is sourced from publicly crawled pages and search results.
          Content is generated from real company information only — no facts are fabricated.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
      <dd className="text-sm text-slate-800 break-all">
        {value || <span className="text-slate-300">—</span>}
      </dd>
    </div>
  );
}

function HonestGap({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 text-sm text-slate-500">
      <AlertCircle className="h-4 w-4 text-slate-300 mt-0.5 shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
