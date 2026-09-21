import React from 'react';

export default function HomePage() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-12">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-3">
          The AI Interview Prep Kit
        </h1>
        <p className="text-slate-600 max-w-xl mx-auto mb-6">
          Turn any job description, company URL, and prep timeframe into an editable, interactive preparation kit.
        </p>
        <div className="inline-flex items-center px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium border border-emerald-200">
          Phase 1: Foundation Ready
        </div>
      </div>
    </main>
  );
}
