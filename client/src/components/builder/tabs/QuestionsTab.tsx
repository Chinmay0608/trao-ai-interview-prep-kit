'use client';

import React, { useState, useCallback, useId } from 'react';
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
      {/* Regenerate full bank */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setRegenerateCategory(null)}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-600 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Regenerate all questions
        </button>
      </div>

      {questions.length === 0 && (
        <p className="text-sm text-slate-400 py-8 text-center">
          Questions will appear after the kit is generated.
        </p>
      )}

      {CATEGORIES.map((cat) => {
        const catQs = questions.filter((q) => q.category === cat);
        if (catQs.length === 0 && cat !== CATEGORIES[0]) return null;
        const collapsed = collapsedCategories.has(cat);

        return (
          <div key={cat}>
            {/* Category header */}
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => toggleCategory(cat)}
                className="flex items-center gap-2 text-sm font-semibold text-slate-900 hover:text-slate-700 focus:outline-none"
                aria-expanded={!collapsed}
              >
                {collapsed ? (
                  <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
                ) : (
                  <ChevronUp className="h-4 w-4 text-slate-400" aria-hidden="true" />
                )}
                {CATEGORY_LABELS[cat]}
                <span className="font-normal text-slate-400">({catQs.length})</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAddingCategory(cat)}
                  className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 focus:outline-none focus:underline"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add
                </button>
                <button
                  type="button"
                  onClick={() => setRegenerateCategory(cat)}
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 focus:outline-none focus:underline"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Regenerate
                </button>
              </div>
            </div>

            {!collapsed && (
              <div className="space-y-2">
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
                  <p className="text-sm text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-lg">
                    No {CATEGORY_LABELS[cat].toLowerCase()} questions yet.
                  </p>
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
// Question Card
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
      <span className="text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
        Edited
      </span>
    ),
    custom: (
      <span className="text-xs font-medium text-teal-600 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded">
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
        'group bg-white rounded-lg border px-4 py-3',
        q._meta.pinned ? 'border-amber-300 bg-amber-50' : 'border-slate-200'
      )}
    >
      {/* Meta row */}
      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
        <span className="text-xs font-mono text-slate-300">{q.id}</span>
        <span
          className={clsx(
            'text-xs font-medium px-1.5 py-0.5 rounded border',
            {
              1: 'bg-emerald-50 text-emerald-600 border-emerald-200',
              2: 'bg-amber-50 text-amber-600 border-amber-200',
              3: 'bg-red-50 text-red-600 border-red-200',
            }[q.difficulty]
          )}
        >
          {DIFFICULTY_LABELS[q.difficulty]}
        </span>
        {q._meta.pinned && (
          <span className="text-xs font-medium text-amber-700" aria-label="Pinned">
            📌 Pinned
          </span>
        )}
        {originBadge}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>

      {/* Prompt */}
      <p className="text-sm text-slate-900 font-medium mb-1">{q.prompt}</p>

      {/* Answer outline */}
      {q.answer_outline && (
        <p className="text-sm text-slate-500 leading-relaxed">{q.answer_outline}</p>
      )}

      {/* Requirement links */}
      {q.requirement_ids?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {q.requirement_ids.map((id) => {
            const req = requirements.find((r) => r.id === id);
            return (
              <span
                key={id}
                className="text-xs text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded font-mono"
                title={req?.text}
              >
                {id}
              </span>
            );
          })}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
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
              <PinOff className="h-3.5 w-3.5" />
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
          className="text-red-400 hover:text-red-600"
        />
      </div>
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
      className={clsx(
        'p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-40',
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
    <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
      {error && (
        <p className="text-xs text-red-600 mb-2" role="alert">
          {error}
        </p>
      )}
      <div className="mb-3">
        <label htmlFor={promptId} className="block text-xs font-medium text-slate-600 mb-1">
          Question
        </label>
        <textarea
          id={promptId}
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full text-sm rounded border border-slate-300 px-2.5 py-1.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
        />
      </div>
      <div className="mb-3">
        <label htmlFor={outlineId} className="block text-xs font-medium text-slate-600 mb-1">
          Answer Outline
        </label>
        <textarea
          id={outlineId}
          rows={4}
          value={answerOutline}
          onChange={(e) => setAnswerOutline(e.target.value)}
          className="w-full text-sm rounded border border-slate-300 px-2.5 py-1.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
        />
      </div>
      <div className="flex items-center gap-4 mb-3">
        <fieldset>
          <legend className="text-xs font-medium text-slate-600 mb-1">Difficulty</legend>
          <div className="flex gap-2">
            {([1, 2, 3] as const).map((d) => (
              <label key={d} className="flex items-center gap-1 text-sm cursor-pointer">
                <input
                  type="radio"
                  name={`difficulty-${q.id}`}
                  value={d}
                  checked={difficulty === d}
                  onChange={() => setDifficulty(d)}
                  className="focus:ring-blue-500"
                />
                {DIFFICULTY_LABELS[d]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
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
    <div className="bg-teal-50 border border-teal-200 rounded-lg px-4 py-3">
      <p className="text-xs font-semibold text-teal-700 mb-3 uppercase tracking-wide">
        New Custom Question
      </p>
      {error && (
        <p className="text-xs text-red-600 mb-2" role="alert">{error}</p>
      )}
      <div className="mb-3">
        <label htmlFor={promptId} className="block text-xs font-medium text-slate-600 mb-1">
          Question
        </label>
        <textarea
          id={promptId}
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your question…"
          className="w-full text-sm rounded border border-slate-300 px-2.5 py-1.5 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
          autoFocus
        />
      </div>
      <div className="mb-3">
        <label htmlFor={outlineId} className="block text-xs font-medium text-slate-600 mb-1">
          Answer Outline <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <textarea
          id={outlineId}
          rows={3}
          value={answerOutline}
          onChange={(e) => setAnswerOutline(e.target.value)}
          placeholder="Key points to cover in the answer…"
          className="w-full text-sm rounded border border-slate-300 px-2.5 py-1.5 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
        />
      </div>
      <div className="flex items-center gap-4 mb-3">
        <fieldset>
          <legend className="text-xs font-medium text-slate-600 mb-1">Difficulty</legend>
          <div className="flex gap-2">
            {([1, 2, 3] as const).map((d) => (
              <label key={d} className="flex items-center gap-1 text-sm cursor-pointer">
                <input
                  type="radio"
                  name={`add-difficulty-${category}`}
                  value={d}
                  checked={difficulty === d}
                  onChange={() => setDifficulty(d)}
                  className="focus:ring-teal-500"
                />
                {DIFFICULTY_LABELS[d]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 rounded hover:bg-teal-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add Question
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-300 rounded hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
      </div>
    </div>
  );
}
