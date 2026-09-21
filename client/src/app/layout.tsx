import './globals.css';
import React from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { KitProvider } from '@/contexts/KitContext';

export const metadata = {
  title: 'Trao — AI Interview Prep Kit',
  description: 'Turn job descriptions into personalised, interactive interview prep kits',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <AuthProvider>
          <KitProvider>
            {children}
          </KitProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
