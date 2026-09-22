'use client';

import React from 'react';
import { BuilderViewModel } from '@trao/shared';
import { AlertCircle, ExternalLink, Globe, CheckCircle2, ShieldAlert, Sparkles, Layers } from 'lucide-react';
import { clsx } from 'clsx';

interface CompanyResearchTabProps {
  kit: BuilderViewModel;
}

export function CompanyResearchTab({ kit }: CompanyResearchTabProps) {
  const brief = kit.company_brief;
  const source = kit.source;
  const metrics = kit.crawlMetrics;

  const hasBrief = Boolean(brief?.summary || brief?.what_they_do);
  const sources = brief?.sources ?? [];
  const crawledPages = source?.pages_used ?? [];

  const pagesAttempted = metrics?.pagesAttempted ?? (source?.company_url ? 1 : 0);
  const pagesSucceeded = metrics?.pagesSucceeded ?? (crawledPages.length > 0 ? crawledPages.length : 0);
  const sourcesFound = sources.length;

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          label="Pages Attempted"
          value={String(pagesAttempted)}
          subtitle="Crawl budget bounded"
        />
        <MetricCard
          label="Pages Crawled"
          value={String(pagesSucceeded)}
          subtitle={pagesSucceeded > 0 ? 'Verified content' : 'No extractable text'}
          highlight={pagesSucceeded > 0 ? 'emerald' : undefined}
        />
        <MetricCard
          label="Public Sources"
          value={String(sourcesFound)}
          subtitle="Search & signals"
        />
        <MetricCard
          label="Researched At"
          value={
            source?.researched_at
              ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(
                  new Date(source.researched_at)
                )
              : 'Recent'
          }
          subtitle={
            source?.researched_at
              ? new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(
                  new Date(source.researched_at)
                )
              : undefined
          }
        />
      </div>

      {/* Crawl Status / Limited Info Explanation if 0 pages */}
      {pagesSucceeded === 0 && (
        <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <h3 className="text-sm font-semibold text-slate-800">Limited Public Information Available</h3>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-2xl">
            {metrics?.statusMessage ||
              'The external website returned no extractable text or was disallowed by robots.txt. The preparation kit continued using verified job description requirements and public intelligence without fabricating facts.'}
          </p>
        </div>
      )}

      {/* Company Overview & What They Do */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 tracking-tight">Company Overview</h2>

        {hasBrief ? (
          <div className="space-y-4">
            {brief?.summary && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Executive Summary
                </p>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium">
                  {brief.summary}
                </p>
              </div>
            )}
            {brief?.what_they_do && (
              <div className="pt-3 border-t border-slate-100">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  What They Do
                </p>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {brief.what_they_do}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs sm:text-sm text-slate-500">
            No verified company profile could be synthesized from public evidence.
          </p>
        )}
      </div>

      {/* Crawled Pages and Evidence Sources */}
      {(crawledPages.length > 0 || sources.length > 0) && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 tracking-tight">Verified Source URLs</h2>
            <span className="text-xs text-slate-400 font-mono">
              {Array.from(new Set([...crawledPages, ...sources])).length} links
            </span>
          </div>

          <div className="space-y-2">
            {Array.from(new Set([...crawledPages, ...sources])).map((url, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50/70 border border-slate-100 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-xs font-mono text-slate-700 truncate">{url}</span>
                </div>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 shrink-0 px-2 py-0.5"
                >
                  <span>Visit</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Honesty & Ethics Notice */}
      <div className="flex items-start gap-2.5 text-xs text-slate-400 px-2">
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
        <p className="leading-relaxed">
          Trao AI strictly gathers public signals and crawler text. It enforces zero hallucination of corporate rounds or private details.
        </p>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subtitle,
  highlight,
}: {
  label: string;
  value: string;
  subtitle?: string;
  highlight?: 'emerald' | 'blue';
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p
        className={clsx(
          'text-xl sm:text-2xl font-bold truncate',
          highlight === 'emerald' ? 'text-emerald-700' : 'text-slate-900'
        )}
      >
        {value}
      </p>
      {subtitle && <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>}
    </div>
  );
}
