'use client';

import React, { useState, useId } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError } from '@/lib/api';
import { clsx } from 'clsx';
import { FileText, Building2, CalendarCheck, Eye, EyeOff, ArrowRight } from 'lucide-react';

type AuthMode = 'login' | 'register';

export function AuthPage() {
  const { login, register, loading, error, clearError } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const emailId = useId();
  const passwordId = useId();
  const nameId = useId();

  const displayError = localError || error;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLocalError(null);

    if (!email.includes('@')) {
      setLocalError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters.');
      return;
    }

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, name || undefined);
      }
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 429) {
        const retry = err.retryAfter ? ` Try again in ${err.retryAfter}s.` : '';
        setLocalError(`Too many attempts.${retry}`);
      }
    }
  };

  const switchMode = () => {
    clearError();
    setLocalError(null);
    setMode(mode === 'login' ? 'register' : 'login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Column: Product Value Proposition (visible on lg+) */}
        <div className="lg:col-span-6 space-y-6 hidden lg:block pr-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                <path d="M9 10h6" />
                <path d="M9 14h4" />
              </svg>
            </div>
            <span className="text-base font-bold text-slate-900 tracking-tight">
              AI Interview Prep Kit
            </span>
          </div>

          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
              Structured preparation for engineering interviews
            </h1>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Transform any job description into an intelligent, role-tailored preparation suite with verified coverage, active-recall decks, and scheduled practice.
            </p>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex items-start gap-3.5 p-3 rounded-xl bg-white border border-slate-200/70 shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900">
                  Analyze the job description
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Extracts must-have technical and behavioural competencies with verifiable JD evidence.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-3 rounded-xl bg-white border border-slate-200/70 shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900">
                  Research the company
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Retrieves factual company intelligence, core tech stacks, and interview round signals.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-3 rounded-xl bg-white border border-slate-200/70 shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                <CalendarCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900">
                  Build a personalized prep plan
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Generates deterministic schedules, natural questions, and active-recall flashcard decks.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Authentication Card */}
        <div className="lg:col-span-6 w-full max-w-md mx-auto">
          {/* Mobile Header */}
          <div className="mb-6 text-center lg:hidden">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-3 shadow-sm">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                <path d="M9 10h6" />
                <path d="M9 14h4" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              AI Interview Prep Kit
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Personalized interview preparation from real job postings.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900">
                {mode === 'login' ? 'Sign in to your account' : 'Create an account'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {mode === 'login'
                  ? 'Access your prep kits, question banks, and schedules.'
                  : 'Start creating personalized, evidence-based interview kits.'}
              </p>
            </div>

            {displayError && (
              <div
                role="alert"
                className="mb-5 rounded-lg bg-rose-50 border border-rose-200/80 px-4 py-3 text-xs font-medium text-rose-800 flex items-start gap-2.5"
              >
                <span className="text-rose-500 font-bold shrink-0">!</span>
                <span>{displayError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label htmlFor={nameId} className="block text-xs font-medium text-slate-700 mb-1.5">
                    Name <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    id={nameId}
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              )}

              <div>
                <label htmlFor={emailId} className="block text-xs font-medium text-slate-700 mb-1.5">
                  Email address
                </label>
                <input
                  id={emailId}
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div>
                <label htmlFor={passwordId} className="block text-xs font-medium text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id={passwordId}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'register' ? 'At least 8 characters' : ''}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3.5 py-2 pr-10 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 focus:outline-none focus:text-blue-600"
                    aria-label={showPassword ? 'Hide characters' : 'Show characters'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className={clsx(
                    'w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all shadow-sm',
                    'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                    'disabled:opacity-60 disabled:cursor-not-allowed'
                  )}
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>Please wait…</span>
                    </>
                  ) : (
                    <>
                      <span>{mode === 'login' ? 'Sign in' : 'Create account'}</span>
                      <ArrowRight className="w-4 h-4 text-blue-200" />
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-500">
                {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
                <button
                  type="button"
                  onClick={switchMode}
                  className="font-semibold text-blue-600 hover:text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
                >
                  {mode === 'login' ? 'Create one' : 'Sign in'}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
