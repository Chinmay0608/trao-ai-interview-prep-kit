import './globals.css';
import React from 'react';

export const metadata = {
  title: 'Trao — AI Interview Prep Kit',
  description: 'Turn job descriptions into personalized, interactive interview prep kits',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
