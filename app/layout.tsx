import type { Metadata } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider } from '@/contexts/auth-context';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { ToastProvider } from '@/components/toast-provider';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: 'VidInsight — Turn long YouTube videos into knowledge',
  description:
    'Transcript, AI highlights, citation-grounded chat and notes for any YouTube video.',
};

const themeInitScript = `(function(){try{var m=localStorage.getItem('vidinsight:theme')||'dark';var l=m==='system'?window.matchMedia('(prefers-color-scheme: light)').matches:m==='light';var c=document.documentElement.classList;c.toggle('light',l);c.toggle('dark',!l);}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} font-sans antialiased min-h-screen flex flex-col`}
      >
        <AuthProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          <ToastProvider />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
