import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SettingsProvider } from '@/lib/store/settings';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'AuroraChess · 极光国际象棋',
  description:
    'Play and learn chess against an adjustable-strength Stockfish engine, with move-by-move coaching. Works on phone, desktop and round smartwatch screens.',
  applicationName: 'AuroraChess',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'AuroraChess' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  // `cover` lets a round watch draw its full circle; the layout keeps its own
  // 5.2% margin so nothing important lands in the clipped corners.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
    { media: '(prefers-color-scheme: light)', color: '#f6f8fb' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-theme="dark" suppressHydrationWarning>
      <body>
        <SettingsProvider>
          <AppShell>{children}</AppShell>
        </SettingsProvider>
      </body>
    </html>
  );
}
