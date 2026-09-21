'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthPage } from '@/components/auth/AuthPage';

interface AppShellProps {
  children: React.ReactNode;
}

/**
 * Application shell. Shows the auth page if unauthenticated.
 * Shows a spinner while the session is being restored.
 */
export function AppShell({ children }: AppShellProps) {
  const { loading, isAuthenticated, user, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600"
          role="status"
          aria-label="Loading"
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top nav */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <a href="/" className="text-sm font-semibold text-slate-900 tracking-tight">
            Prep Kit
          </a>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 hidden sm:block">
              {user?.email}
            </span>
            <button
              type="button"
              onClick={logout}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 focus:outline-none focus:underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
