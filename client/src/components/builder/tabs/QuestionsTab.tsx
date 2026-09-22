'use client';

import React, { useState, useId } from 'react';
import { BuilderViewModel, InternalQuestion, QuestionCategory } from '@trao/shared';
import { api, ApiError } from '@/lib/api';
import {
  Pin,
  PinOff,
  Pencil,
  Trash2,
  Check,
  X,
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  HelpCircle,
  Lightbulb,
} from 'lucide-react';
import { clsx } from 'clsx';
import { RegenerateModal } from '../RegenerateModal';

interface QuestionsTabProps {
  kit: BuilderViewModel;
  kitId: string;
  onKitUpdate: () => Promise<void>;
}

const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  technical: 'Technical',
  behavioural: 'Behavioural',
  'system-design': 'System Design',
  'company-fit': 'Company Fit',
};

const CATEGORIES: QuestionCategory[] = ['technical', 'system-design', 'behavioural', 'company-fit'];

const DIFFICULTY_LABELS: Record<1 | 2 | 3, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };

export function QuestionsTab({ kit, kitId, onKitUpdate }: QuestionsTabProps) {
  const [addingCategory, setAddingCategory] = useState<QuestionCategory | null>(null);
  const [regenerateCategory, setRegenerateCategory] = useState<QuestionCategory | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<QuestionCategory>>(new Set());

  const toggleCategory = (cat: QuestionCategory) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const questions = (kit.questions ?? []) as InternalQuestion[];

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Role-Specific Question Bank</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {questions.length} questions mapped directly to job requirements and company architecture.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRegenerateCategory(null)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 active:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shadow-2xs"
          >
            <RefreshCw className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            Regenerate all questions
          </button>
        </div>
      </div>

      {questions.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center shadow-xs">
          <p className="text-sm text-slate-500">
            Questions will appear after the kit is generated.
          </p>
        </div>
      )}

      {CATEGORIES.map((cat) => {
        const catQs = questions.filter((q) => q.category === cat);
        if (catQs.length === 0 && cat !== CATEGORIES[0]) return null;
        const collapsed = collapsedCategories.has(cat);

        return (
          <div key={cat} className="space-y-3">
            {/* Category Header Bar */}
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => toggleCategory(cat)}
                className="flex items-center gap-2 text-sm font-bold text-slate-900 hover:text-blue-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                aria-expanded={!collapsed}
              >
                {collapsed ? (
                  <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-slate-400" aria-hidden="true" />
                )}
                <span>{CATEGORY_LABELS[cat]}</span>
                <span className="text-xs font-medium text-slate-400 font-mono">({catQs.length})</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAddingCategory(cat)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded-md hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shadow-2xs"
                >
                  <Plus className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" /> Add
                </button>
                <button
                  type="button"
                  onClick={() => setRegenerateCategory(cat)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50/70 border border-blue-200/60 px-2.5 py-1 rounded-md hover:bg-blue-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shadow-2xs"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" /> Regenerate
                </button>
              </div>
            </div>

            {!collapsed && (
              <div className="space-y-3">
                {catQs.map((q) => (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    kitId={kitId}
                    requirements={kit.role?.requirements ?? []}
                    onUpdate={onKitUpdate}
                  />
                ))}

                {catQs.length === 0 && (
                  <div className="bg-white rounded-xl border border-dashed border-slate-200 p-6 text-center">
                    <p className="text-xs text-slate-400">
                      No {CATEGORY_LABELS[cat].toLowerCase()} questions yet.
                    </p>
                  </div>
                )}

                {addingCategory === cat && (
                  <AddQuestionForm
                    category={cat}
                    kitId={kitId}
                    requirements={kit.role?.requirements ?? []}
                    onSaved={async () => {
                      setAddingCategory(null);
                      await onKitUpdate();
                    }}
                    onCancel={() => setAddingCategory(null)}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Regenerate modal */}
      {regenerateCategory !== undefined && (
        <RegenerateModal
          kitId={kitId}
          generationVersion={kit.generationVersion}
          category={regenerateCategory ?? undefined}
          onClose={() => setRegenerateCategory(undefined as any)}
          onDone={onKitUpdate}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question Card Component
// ---------------------------------------------------------------------------

interface QuestionCardProps {
  question: InternalQuestion;
  kitId: string;
  requirements: { id: string; text: string; priority: string }[];
  onUpdate: () => Promise<void>;
}

function QuestionCard({ question: q, kitId, requirements, onUpdate }: QuestionCardProps) {
  const [editing, setEditing] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handlePin = async () => {
    setPinning(true);
    setError(null);
    try {
      await api.kits.togglePinQuestion(kitId, q.id, !q._meta.pinned);
      await onUpdate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to toggle pin.');
    } finally {
      setPinning(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this question? This cannot be undone.')) return;
    setDeleting(true);
    setError(null);
    try {
      await api.kits.deleteQuestion(kitId, q.id);
      await onUpdate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete question.');
      setDeleting(false);
    }
  };

  const originBadge = {
    generated: null,
    edited: (
      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200/70 px-1.5 py-0.5 rounded tracking-wide uppercase">
        Edited
      </span>
    ),
    custom: (
      <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200/70 px-1.5 py-0.5 rounded tracking-wide uppercase">
        Custom
      </span>
    ),
  }[q._meta.origin];

  if (editing) {
    return (
      <EditQuestionForm
        question={q}
        kitId={kitId}
        requirements={requirements}
        onSaved={async () => {
          setEditing(false);
          await onUpdate();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div
      className={clsx(
        'group bg-white rounded-xl border p-4 sm:p-5 transition-all shadow-2xs hover:shadow-xs relative',
        q._meta.pinned
          ? 'border-amber-300 bg-amber-50/20'
          : 'border-slate-200/90 hover:border-slate-300'
      )}
    >
      {/* Top Meta Header */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="text-[10px] font-mono text-slate-400 select-none">{q.id}</span>
          <span
            className={clsx(
              'text-[10px] font-bold px-2 py-0.5 rounded border tracking-wide uppercase',
              {
                1: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
                2: 'bg-amber-50 text-amber-700 border-amber-200/60',
                3: 'bg-rose-50 text-rose-700 border-rose-200/60',
              }[q.difficulty]
            )}
          >
            {DIFFICULTY_LABELS[q.difficulty]}
          </span>
          {q._meta.pinned && (
            <span
              className="inline-flex items-center text-[10px] font-bold text-amber-800 bg-amber-100/70 border border-amber-300/80 px-2 py-0.5 rounded tracking-wide"
              aria-label="Pinned"
            >
              📌 Pinned
            </span>
          )}
          {originBadge}
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-1">
          <IconButton
            onClick={() => setEditing(true)}
            label="Edit question"
            icon={<Pencil className="h-3.5 w-3.5" />}
          />
          <IconButton
            onClick={handlePin}
            disabled={pinning}
            label={q._meta.pinned ? 'Unpin question' : 'Pin question'}
            icon={
              pinning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : q._meta.pinned ? (
                <PinOff className="h-3.5 w-3.5 text-amber-600" />
              ) : (
                <Pin className="h-3.5 w-3.5" />
              )
            }
          />
          <IconButton
            onClick={handleDelete}
            disabled={deleting}
            label="Delete question"
            icon={
              deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )
            }
            className="text-slate-400 hover:text-rose-600 hover:bg-rose-50"
          />
        </div>
      </div>

      {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}

      {/* Prominent Question Prompt */}
      <h3 className="text-sm sm:text-base font-semibold text-slate-900 leading-snug mb-3 tracking-tight">
        {q.prompt}
      </h3>

      {/* Structured Answer Outline Section */}
      {q.answer_outline && (
        <div className="bg-slate-50/70 rounded-lg p-3 border border-slate-100 text-xs sm:text-sm text-slate-700 leading-relaxed mb-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
            <span>Key Evaluation Points</span>
          </div>
          <p className="whitespace-pre-line text-slate-600 leading-relaxed">
            {q.answer_outline}
          </p>
        </div>
      )}

      {/* Requirement links */}
      {q.requirement_ids?.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-medium text-slate-400 mr-0.5">Covers:</span>
          {q.requirement_ids.map((id) => {
            const req = requirements.find((r) => r.id === id);
            return (
              <span
                key={id}
                className="inline-flex items-center text-[10px] font-mono font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200/80 border border-slate-200/80 px-2 py-0.5 rounded transition-colors cursor-default"
                title={req?.text || id}
              >
                {id}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IconButton({
  onClick,
  label,
  icon,
  disabled,
  className,
}: {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx(
        'p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40',
        className
      )}
    >
      {icon}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Edit Question Form
// ---------------------------------------------------------------------------

interface EditFormProps {
  question: InternalQuestion;
  kitId: string;
  requirements: { id: string; text: string; priority: string }[];
  onSaved: () => void;
  onCancel: () => void;
}

function EditQuestionForm({ question: q, kitId, requirements, onSaved, onCancel }: EditFormProps) {
  const [prompt, setPrompt] = useState(q.prompt);
  const [answerOutline, setAnswerOutline] = useState(q.answer_outline);
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(q.difficulty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const promptId = useId();
  const outlineId = useId();

  const handleSave = async () => {
    if (!prompt.trim()) {
      setError('Question prompt is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.kits.updateQuestion(kitId, q.id, {
        prompt: prompt.trim(),
        answer_outline: answerOutline.trim(),
        difficulty,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save changes.');
      setSaving(false);
    }
  };

  return (
    <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 sm:p-5 space-y-4 shadow-xs">
      <div className="flex items-center justify-between pb-2 border-b border-blue-100">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-900">
          Edit Question ({q.id})
        </h4>
        <span className="text-[11px] text-blue-700 font-medium">Changes will be marked as Edited</span>
      </div>

      {error && (
        <p className="text-xs text-rose-600 font-medium" role="alert">
          {error}
        </p>
      )}

      <div>
        <label htmlFor={promptId} className="block text-xs font-medium text-slate-700 mb-1">
          Question
        </label>
        <textarea
          id={promptId}
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full text-xs sm:text-sm rounded-lg border border-slate-200 bg-white p-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      <div>
        <label htmlFor={outlineId} className="block text-xs font-medium text-slate-700 mb-1">
          Answer Outline
        </label>
        <textarea
          id={outlineId}
          rows={4}
          value={answerOutline}
          onChange={(e) => setAnswerOutline(e.target.value)}
          className="w-full text-xs sm:text-sm rounded-lg border border-slate-200 bg-white p-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <fieldset>
          <legend className="text-xs font-medium text-slate-700 mb-1.5">Difficulty</legend>
          <div className="flex gap-2">
            {([1, 2, 3] as const).map((d) => (
              <label
                key={d}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium border cursor-pointer transition-colors',
                  difficulty === d
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                )}
              >
                <input
                  type="radio"
                  name={`difficulty-${q.id}`}
                  value={d}
                  checked={difficulty === d}
                  onChange={() => setDifficulty(d)}
                  className="sr-only"
                />
                {DIFFICULTY_LABELS[d]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 transition-colors shadow-2xs"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors focus:outline-none"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Question Form
// ---------------------------------------------------------------------------

interface AddQuestionFormProps {
  category: QuestionCategory;
  kitId: string;
  requirements: { id: string; text: string; priority: string }[];
  onSaved: () => void;
  onCancel: () => void;
}

function AddQuestionForm({ category, kitId, requirements, onSaved, onCancel }: AddQuestionFormProps) {
  const [prompt, setPrompt] = useState('');
  const [answerOutline, setAnswerOutline] = useState('');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3>(2);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const promptId = useId();
  const outlineId = useId();

  const handleSave = async () => {
    if (!prompt.trim()) {
      setError('Question prompt is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.kits.addQuestion(kitId, {
        prompt: prompt.trim(),
        answer_outline: answerOutline.trim(),
        category,
        difficulty,
        requirement_ids: [],
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add question.');
      setSaving(false);
    }
  };

  return (
    <div className="bg-teal-50/40 border border-teal-200 rounded-xl p-4 sm:p-5 space-y-4 shadow-xs">
      <div className="flex items-center justify-between pb-2 border-b border-teal-100">
        <h4 className="text-xs font-semibold text-teal-900 uppercase tracking-wider">
          New Custom Question
        </h4>
        <span className="text-[11px] text-teal-700 font-medium">{CATEGORY_LABELS[category]}</span>
      </div>

      {error && (
        <p className="text-xs text-rose-600 font-medium" role="alert">{error}</p>
      )}

      <div>
        <label htmlFor={promptId} className="block text-xs font-medium text-slate-700 mb-1">
          Question
        </label>
        <textarea
          id={promptId}
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your question…"
          className="w-full text-xs sm:text-sm rounded-lg border border-slate-200 bg-white p-3 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          autoFocus
        />
      </div>

      <div>
        <label htmlFor={outlineId} className="block text-xs font-medium text-slate-700 mb-1">
          Answer Outline <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <textarea
          id={outlineId}
          rows={3}
          value={answerOutline}
          onChange={(e) => setAnswerOutline(e.target.value)}
          placeholder="Key points to cover in the answer…"
          className="w-full text-xs sm:text-sm rounded-lg border border-slate-200 bg-white p-3 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <fieldset>
          <legend className="text-xs font-medium text-slate-700 mb-1.5">Difficulty</legend>
          <div className="flex gap-2">
            {([1, 2, 3] as const).map((d) => (
              <label
                key={d}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium border cursor-pointer transition-colors',
                  difficulty === d
                    ? 'bg-teal-600 border-teal-600 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                )}
              >
                <input
                  type="radio"
                  name={`add-difficulty-${category}`}
                  value={d}
                  checked={difficulty === d}
                  onChange={() => setDifficulty(d)}
                  className="sr-only"
                />
                {DIFFICULTY_LABELS[d]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add Question
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors focus:outline-none"
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
      </div>
    </div>
  );
}
