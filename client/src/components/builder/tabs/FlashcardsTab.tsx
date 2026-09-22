'use client';

import React, { useState } from 'react';
import { BuilderViewModel, InternalFlashcard } from '@trao/shared';
import { Play, Sparkles, CheckCircle2, RotateCcw, ArrowRight, Eye, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

interface FlashcardsTabProps {
  kit: BuilderViewModel;
}

const CONFIDENCE_LABELS = ['No idea', 'Vague', 'Okay', 'Good', 'Nailed it'] as const;

export function FlashcardsTab({ kit }: FlashcardsTabProps) {
  const flashcards = (kit.flashcards ?? []) as InternalFlashcard[];
  const [practiceMode, setPracticeMode] = useState(false);

  if (flashcards.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center shadow-xs">
        <p className="text-sm text-slate-500">
          Flashcards will appear after question generation.
        </p>
      </div>
    );
  }

  if (practiceMode) {
    return (
      <PracticeSession
        cards={flashcards}
        onEnd={() => setPracticeMode(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Action Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Active-Recall Flashcards</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {flashcards.length} targeted concepts synthesizing key answers and interview knowledge.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPracticeMode(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 active:bg-blue-800 shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          Start Practice
        </button>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {flashcards.map((card, idx) => (
          <FlashcardPreview key={card.id} card={card} index={idx} total={flashcards.length} />
        ))}
      </div>
    </div>
  );
}

function FlashcardPreview({
  card,
  index,
  total,
}: {
  card: InternalFlashcard;
  index: number;
  total: number;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs flex flex-col justify-between transition-all hover:border-slate-300">
      <div>
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-2.5">
          <span>CARD {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
          <span>{card.id}</span>
        </div>
        <h3 className="text-sm font-semibold text-slate-900 leading-snug tracking-tight">
          {card.front}
        </h3>

        {revealed && (
          <div className="mt-3 pt-3 border-t border-slate-100 animate-in fade-in duration-200">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Answer Outline
            </p>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-line">
              {card.back}
            </p>
          </div>
        )}
      </div>

      <div className="pt-4 mt-2">
        {!revealed ? (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus:underline"
          >
            <Eye className="w-3.5 h-3.5" />
            Show answer
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setRevealed(false)}
            className="text-xs text-slate-400 hover:text-slate-600 focus:outline-none"
          >
            Hide answer
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Practice Session
// ---------------------------------------------------------------------------

interface PracticeSessionProps {
  cards: InternalFlashcard[];
  onEnd: () => void;
}

interface CardResult {
  id: string;
  confidence: number;
}

function PracticeSession({ cards, onEnd }: PracticeSessionProps) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<CardResult[]>([]);
  const [done, setDone] = useState(false);

  const card = cards[index];

  const handleConfidence = (level: number) => {
    const newResults = [...results, { id: card.id, confidence: level }];
    setResults(newResults);

    if (index + 1 >= cards.length) {
      setDone(true);
    } else {
      setIndex(index + 1);
      setRevealed(false);
    }
  };

  if (done) {
    const avg = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
    const strong = results.filter((r) => r.confidence >= 3).length;
    const weak = results.filter((r) => r.confidence <= 1).length;

    return (
      <div className="max-w-xl mx-auto py-8 text-center bg-white rounded-2xl border border-slate-200/90 p-8 shadow-xs space-y-6">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Session complete!</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            You reviewed all {results.length} active-recall cards in this deck.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5">
            <p className="text-xl font-bold text-emerald-600">{strong}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mt-0.5">Mastered</p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5">
            <p className="text-xl font-bold text-blue-600">{(avg + 1).toFixed(1)}/5</p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mt-0.5">Avg Confidence</p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5">
            <p className="text-xl font-bold text-rose-600">{weak}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mt-0.5">Need Practice</p>
          </div>
        </div>

        {weak > 0 && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200/80 rounded-xl p-3">
            {weak} card{weak !== 1 ? 's need' : ' needs'} additional repetition before interview day.
          </p>
        )}

        <div className="pt-2">
          <button
            type="button"
            onClick={onEnd}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Back to Flashcards
          </button>
        </div>
      </div>
    );
  }

  const currentNumberStr = String(index + 1).padStart(2, '0');
  const totalNumberStr = String(cards.length).padStart(2, '0');

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Session Progress Header */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="font-mono font-semibold tracking-wider text-slate-700">
          FLASHCARD {currentNumberStr} / {totalNumberStr}
        </span>
        <button
          type="button"
          onClick={onEnd}
          className="text-slate-400 hover:text-slate-700 text-xs font-medium focus:outline-none focus:underline"
        >
          End session
        </button>
      </div>

      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 rounded-full transition-all duration-300"
          style={{ width: `${((index + 1) / cards.length) * 100}%` }}
          role="progressbar"
          aria-valuenow={index + 1}
          aria-valuemin={0}
          aria-valuemax={cards.length}
        />
      </div>

      {/* Main Flashcard */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-10 text-center min-h-[260px] flex flex-col items-center justify-center transition-all">
        <span className="text-[11px] font-mono text-slate-400 mb-3 block select-none">
          {card.id}
        </span>

        <h3 className="text-base sm:text-xl font-bold text-slate-900 leading-snug tracking-tight max-w-lg">
          {card.front}
        </h3>

        {revealed ? (
          <div className="mt-6 pt-6 border-t border-slate-100 w-full animate-in fade-in duration-200">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Key Answer Concept
            </p>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed mb-8 max-w-lg mx-auto whitespace-pre-line font-medium">
              {card.back}
            </p>

            {/* Confidence controls */}
            <div className="space-y-3 pt-2">
              <p className="text-xs font-semibold text-slate-500" id="confidence-label">
                How well did you know this?
              </p>
              <div
                className="flex flex-wrap justify-center gap-2"
                role="group"
                aria-labelledby="confidence-label"
              >
                {CONFIDENCE_LABELS.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleConfidence(i)}
                    className={clsx(
                      'px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                      i <= 1
                        ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                        : i === 2
                        ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
                        : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-8">
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 active:bg-blue-800 shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Reveal Answer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
