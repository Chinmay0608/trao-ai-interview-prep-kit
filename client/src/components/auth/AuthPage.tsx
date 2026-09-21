'use client';

import React, { useState, useId } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError } from '@/lib/api';
import { clsx } from 'clsx';

type AuthMode = 'login' | 'register';

export function AuthPage() {
  const { login, register, loading, error, clearError } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
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
      // Other errors are set in AuthContext via dispatch
    }
  };

  const switchMode = () => {
    clearError();
    setLocalError(null);
    setMode(mode === 'login' ? 'register' : 'login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            AI Interview Prep Kit
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Turn any job description into a personalised preparation plan.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-6">
            {mode === 'login' ? 'Sign in to your account' : 'Create an account'}
          </h2>

          {displayError && (
            <div
              role="alert"
              className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
            >
              {displayError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {mode === 'register' && (
              <div className="mb-4">
                <label htmlFor={nameId} className="block text-sm font-medium text-slate-700 mb-1">
                  Name <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  id={nameId}
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}

            <div className="mb-4">
              <label htmlFor={emailId} className="block text-sm font-medium text-slate-700 mb-1">
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
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="mb-6">
              <label htmlFor={passwordId} className="block text-sm font-medium text-slate-700 mb-1">
                Password
              </label>
              <input
                id={passwordId}
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'At least 8 characters' : ''}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={clsx(
                'w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
                'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={switchMode}
              className="font-medium text-blue-600 hover:text-blue-700 focus:outline-none focus:underline"
            >
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
