'use client';

import React, { useState } from 'react';
import { BuilderViewModel, InternalFlashcard } from '@trao/shared';
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
      <p className="text-sm text-slate-400 py-8 text-center">
        Flashcards will appear after question generation.
      </p>
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
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">{flashcards.length} flashcard{flashcards.length !== 1 ? 's' : ''}</p>
        <button
          type="button"
          onClick={() => setPracticeMode(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Start Practice
        </button>
      </div>
      <div className="space-y-3">
        {flashcards.map((card) => (
          <FlashcardPreview key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}

function FlashcardPreview({ card }: { card: InternalFlashcard }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
      <p className="text-sm font-medium text-slate-900">{card.front}</p>
      {revealed ? (
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">{card.back}</p>
      ) : (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="mt-2 text-xs text-blue-600 hover:text-blue-700 focus:outline-none focus:underline"
        >
          Show answer
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Practice session
// ---------------------------------------------------------------------------

interface PracticeSessionProps {
  cards: InternalFlashcard[];
  onEnd: () => void;
}

interface CardResult {
  id: string;
  confidence: number; // 0–4
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
      <div className="max-w-xl mx-auto py-12 text-center">
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Session complete!</h2>
        <p className="text-sm text-slate-500 mb-6">
          You reviewed {results.length} card{results.length !== 1 ? 's' : ''}.
        </p>
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Stat label="Strong" value={String(strong)} color="text-emerald-600" />
          <Stat label="Avg. confidence" value={(avg + 1).toFixed(1) + '/5'} color="text-blue-600" />
          <Stat label="Weak" value={String(weak)} color="text-red-400" />
        </div>
        {weak > 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6">
            {weak} card{weak !== 1 ? 's need' : ' needs'} more practice.
          </p>
        )}
        <button
          type="button"
          onClick={onEnd}
          className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Back to Flashcards
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="flex items-center justify-between text-xs text-slate-400 mb-4">
        <span>
          {index + 1} / {cards.length}
        </span>
        <button
          type="button"
          onClick={onEnd}
          className="text-slate-400 hover:text-slate-600 focus:outline-none focus:underline"
        >
          End session
        </button>
      </div>
      <div className="h-1 bg-slate-100 rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all"
          style={{ width: `${((index) / cards.length) * 100}%` }}
          role="progressbar"
          aria-valuenow={index}
          aria-valuemin={0}
          aria-valuemax={cards.length}
        />
      </div>

      {/* Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center min-h-[200px] flex flex-col items-center justify-center">
        <p className="text-lg font-medium text-slate-900 leading-relaxed">{card.front}</p>

        {revealed ? (
          <div className="mt-6 pt-6 border-t border-slate-100 w-full">
            <p className="text-sm text-slate-600 leading-relaxed mb-8">{card.back}</p>

            {/* Confidence buttons */}
            <p className="text-xs text-slate-400 mb-3" id="confidence-label">
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
                    'px-3 py-1.5 text-sm font-medium rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors',
                    i <= 1
                      ? 'border-red-200 text-red-600 hover:bg-red-50'
                      : i === 2
                      ? 'border-amber-200 text-amber-600 hover:bg-amber-50'
                      : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="mt-6 px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Reveal Answer
          </button>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-4 py-3 text-center">
      <p className={`text-xl font-semibold ${color}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}
