'use client';

import React, { useState } from 'react';
import { BuilderViewModel, ScheduleDay } from '@trao/shared';
import { Clock, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
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
      <p className="text-sm text-slate-400 py-8 text-center">
        Schedule will appear after kit generation.
      </p>
    );
  }

  const totalMinutes = days.reduce((sum, d) => sum + d.minutes, 0);
  const showLoadMore = visibleCount < days.length;

  return (
    <div>
      {/* Summary row */}
      <div className="flex flex-wrap items-center gap-4 mb-6 bg-white rounded-xl border border-slate-200 px-5 py-4">
        <SummaryItem
          icon={<BookOpen className="h-4 w-4" />}
          label="Total days"
          value={String(days.length)}
        />
        <SummaryItem
          icon={<Clock className="h-4 w-4" />}
          label="Total prep time"
          value={formatMinutes(totalMinutes)}
        />
        <SummaryItem
          icon={<Clock className="h-4 w-4" />}
          label="Daily avg"
          value={days.length > 0 ? formatMinutes(Math.round(totalMinutes / days.length)) : '—'}
        />
      </div>

      {/* Day cards */}
      <div className="space-y-2">
        {days.slice(0, visibleCount).map((day) => (
          <DayCard key={day.day} day={day} questions={questions} />
        ))}
      </div>

      {showLoadMore && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => Math.min(c + BATCH_SIZE, days.length))}
          className="mt-4 w-full py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          Show more ({days.length - visibleCount} remaining)
        </button>
      )}
    </div>
  );
}

function SummaryItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-slate-400">{icon}</span>
      <span className="text-slate-500">{label}:</span>
      <span className="font-semibold text-slate-900">{value}</span>
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

  return (
    <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="w-full flex items-start justify-between text-left focus:outline-none"
      >
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Day {day.day}
            </span>
            <span className="text-xs text-slate-300">·</span>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {formatMinutes(day.minutes)}
            </span>
            <span className="text-xs text-slate-300">·</span>
            <span className="text-xs text-slate-400">
              {day.question_ids.length} question{day.question_ids.length !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-sm font-medium text-slate-900">{day.focus}</p>
        </div>
        {day.question_ids.length > 0 && (
          expanded
            ? <ChevronUp className="h-4 w-4 text-slate-300 shrink-0 mt-0.5" aria-hidden="true" />
            : <ChevronDown className="h-4 w-4 text-slate-300 shrink-0 mt-0.5" aria-hidden="true" />
        )}
      </button>

      {expanded && linkedQs.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-slate-50 pt-3">
          {linkedQs.map((q, i) =>
            q ? (
              <li key={`${q.id}-${i}`} className="text-sm text-slate-600 flex gap-2">
                <span className="text-slate-300 select-none shrink-0">
                  {day.question_ids.filter((id) => id === q.id).length > 1 ? '↩' : '–'}
                </span>
                <span>{q.prompt}</span>
              </li>
            ) : null
          )}
        </ul>
      )}
    </div>
  );
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}
