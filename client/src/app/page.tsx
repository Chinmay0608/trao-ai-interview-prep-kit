'use client';

import React, { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { KitBuilder } from '@/components/builder/KitBuilder';
import { useKits } from '@/contexts/KitContext';

type View = { type: 'dashboard' } | { type: 'builder'; kitId: string };

function AppContent() {
  const [view, setView] = useState<View>({ type: 'dashboard' });
  const { clearActiveKit } = useKits();

  const handleOpenKit = (kitId: string) => {
    setView({ type: 'builder', kitId });
  };

  const handleBack = () => {
    clearActiveKit();
    setView({ type: 'dashboard' });
  };

  return (
    <AppShell>
      {view.type === 'dashboard' && (
        <Dashboard onOpenKit={handleOpenKit} />
      )}
      {view.type === 'builder' && (
        <KitBuilder kitId={view.kitId} onBack={handleBack} />
      )}
    </AppShell>
  );
}

export default function HomePage() {
  return <AppContent />;
}
