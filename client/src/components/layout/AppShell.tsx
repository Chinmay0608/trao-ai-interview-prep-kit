'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthPage } from '@/components/auth/AuthPage';
import { LogOut } from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
}

/**
 * Application shell. Shows the auth page if unauthenticated.
 * Shows a polished spinner while the session is being restored.
 */
export function AppShell({ children }: AppShellProps) {
  const { loading, isAuthenticated, user, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div
          className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600"
          role="status"
          aria-label="Loading"
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  const initial = (user?.name?.[0] || user?.email?.[0] || 'U').toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      {/* Top nav */}
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-30 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <a href="/" className="flex items-center gap-2.5 group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-md">
              {/* Modern geometric product mark */}
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-sm shadow-blue-500/20 group-hover:bg-blue-700 transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                  <path d="M9 10h6" />
                  <path d="M9 14h4" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-slate-900 tracking-tight group-hover:text-blue-600 transition-colors">
                Prep Kit
              </span>
            </a>
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200/60">
              AI Interview Prep
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[11px] font-semibold text-slate-700 select-none">
                {initial}
              </div>
              <span className="text-xs font-medium text-slate-600 hidden md:block max-w-[200px] truncate">
                {user?.email}
              </span>
            </div>
            <div className="h-4 w-px bg-slate-200 hidden sm:block" />
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-400" />
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
