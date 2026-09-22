'use client';

import React, { useState } from 'react';
import { BuilderViewModel, ScheduleDay } from '@trao/shared';
import { Clock, BookOpen, ChevronDown, ChevronUp, Calendar, CheckCircle2, RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';

interface ScheduleTabProps {
  kit: BuilderViewModel;
}

const BATCH_SIZE = 10;

export function ScheduleTab({ kit }: ScheduleTabProps) {
  const schedule = kit.schedule;
  const days = schedule?.days ?? [];
  const questions = kit.questions ?? [];
  const [visibleCount, setVisibleCount] = useState(
    days.length <= BATCH_SIZE ? days.length : BATCH_SIZE
  );

  if (days.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center shadow-xs">
        <p className="text-sm text-slate-500">
          Schedule will appear after kit generation.
        </p>
      </div>
    );
  }

  const totalMinutes = days.reduce((sum, d) => sum + d.minutes, 0);
  const showLoadMore = visibleCount < days.length;

  return (
    <div className="space-y-6">
      {/* Summary Header Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total days</span>
          </div>
          <p className="text-xl font-bold text-slate-900">{days.length}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Clock className="w-4 h-4 text-emerald-600" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total prep time</span>
          </div>
          <p className="text-xl font-bold text-slate-900">{formatMinutes(totalMinutes)}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs">
          <div className="flex items-center gap-2 text-slate-400 mb-1">
            <Clock className="w-4 h-4 text-purple-600" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Daily avg</span>
          </div>
          <p className="text-xl font-bold text-slate-900">
            {days.length > 0 ? formatMinutes(Math.round(totalMinutes / days.length)) : '—'}
          </p>
        </div>
      </div>

      {/* Timeline Day Cards */}
      <div className="space-y-3">
        {days.slice(0, visibleCount).map((day) => (
          <DayCard key={day.day} day={day} questions={questions} />
        ))}
      </div>

      {showLoadMore && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => Math.min(c + BATCH_SIZE, days.length))}
          className="w-full py-3 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shadow-2xs"
        >
          Show more ({days.length - visibleCount} remaining)
        </button>
      )}
    </div>
  );
}

function DayCard({
  day,
  questions,
}: {
  day: ScheduleDay;
  questions: BuilderViewModel['questions'];
}) {
  const [expanded, setExpanded] = useState(day.question_ids.length <= 3);
  const linkedQs = day.question_ids
    .map((id) => questions.find((q) => q.id === id))
    .filter(Boolean);

  const dayNumberStr = String(day.day).padStart(2, '0');

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs transition-all hover:border-slate-300">
      <div
        className="w-full flex items-start justify-between text-left focus:outline-none cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded tracking-wide uppercase font-mono">
              DAY {dayNumberStr}
            </span>
            <span className="text-xs text-slate-500 flex items-center gap-1 font-medium bg-slate-50 border border-slate-200/60 px-2 py-0.5 rounded">
              <Clock className="h-3 w-3 text-slate-400" aria-hidden="true" />
              {formatMinutes(day.minutes)}
            </span>
            <span className="text-xs text-slate-400 font-medium">
              {day.question_ids.length} question{day.question_ids.length !== 1 ? 's' : ''}
            </span>
          </div>
          <h3 className="text-sm sm:text-base font-semibold text-slate-900 tracking-tight pt-1">
            {day.focus}
          </h3>
        </div>

        {day.question_ids.length > 0 && (
          <div className="p-1 text-slate-400 shrink-0 mt-0.5">
            {expanded ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </div>
        )}
      </div>

      {expanded && linkedQs.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-slate-100 pt-3">
          {linkedQs.map((q, i) =>
            q ? (
              <ScheduledQuestionItem
                key={`${q.id}-${i}`}
                question={q}
                isReview={day.question_ids.slice(0, i).includes(q.id)}
              />
            ) : null
          )}
        </ul>
      )}
    </div>
  );
}

function ScheduledQuestionItem({
  question,
  isReview,
}: {
  question: BuilderViewModel['questions'][0];
  isReview: boolean;
}) {
  const [open, setOpen] = useState(false);

  const getShortTitle = (prompt: string): string => {
    const firstSentence = prompt.split(/(?<=[.?!])\s+/)[0];
    if (firstSentence && firstSentence.length <= 90) return firstSentence;
    return prompt.slice(0, 85) + '...';
  };

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'technical':
        return 'bg-blue-50 text-blue-700 border-blue-200/70';
      case 'behavioural':
        return 'bg-purple-50 text-purple-700 border-purple-200/70';
      case 'system-design':
        return 'bg-amber-50 text-amber-700 border-amber-200/70';
      case 'company-fit':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/70';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200/70';
    }
  };

  const formatCategoryName = (cat: string) => {
    switch (cat) {
      case 'system-design':
        return 'System Design';
      case 'company-fit':
        return 'Company Fit';
      case 'behavioural':
        return 'Behavioural';
      default:
        return 'Technical';
    }
  };

  return (
    <li className="text-xs sm:text-sm border border-slate-200/70 rounded-xl p-3 bg-slate-50/40 hover:bg-slate-50 transition-colors">
      <div
        className="flex items-center justify-between gap-2 cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
        title="Click to view full question prompt and answer guidance"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isReview && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/70 px-1.5 py-0.5 rounded tracking-wide uppercase shrink-0">
              <RotateCcw className="w-2.5 h-2.5" />
              Review
            </span>
          )}
          <span
            className={clsx(
              'px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase rounded border shrink-0',
              getCategoryBadgeClass(question.category)
            )}
          >
            {formatCategoryName(question.category)}
          </span>
          <span className="font-medium text-slate-800 truncate" title={question.prompt}>
            {getShortTitle(question.prompt)}
          </span>
        </div>
        <button
          type="button"
          className="text-xs text-blue-600 hover:text-blue-700 font-medium shrink-0 flex items-center gap-0.5 px-1.5 py-0.5"
        >
          {open ? 'Hide' : 'Details'}
        </button>
      </div>

      {open && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-200/60 text-xs space-y-2 text-slate-700 animate-in fade-in duration-150">
          <div>
            <p className="font-semibold text-slate-500 uppercase tracking-wide text-[10px] mb-0.5">
              Full Prompt
            </p>
            <p className="text-slate-900 leading-relaxed font-medium">{question.prompt}</p>
          </div>
          {question.answer_outline && (
            <div>
              <p className="font-semibold text-slate-500 uppercase tracking-wide text-[10px] mb-0.5">
                Evaluation Outline
              </p>
              <p className="text-slate-600 leading-relaxed whitespace-pre-line">{question.answer_outline}</p>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}
