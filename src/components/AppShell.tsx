'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useSettings } from '@/lib/store/settings';
import { useIsWatch } from '@/lib/hooks/useIsWatch';
import { SegmentedControl } from '@/components/ui/Primitives';

const NAV = [
  { href: '/', labelKey: 'nav.home' },
  { href: '/play', labelKey: 'nav.play' },
  { href: '/coach', labelKey: 'nav.coach' },
  { href: '/review', labelKey: 'nav.review' },
  { href: '/watch', labelKey: 'nav.watch' },
] as const;

/** Original mark: a wave with a rising point (aurora over the board). */
function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 16.5c3.4-6.8 6.3-9 8.9-6.7 2.6 2.3 4.7 1.5 6.5-2.7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="19.2" cy="6.2" r="2.1" fill="currentColor" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t, settings, update } = useSettings();
  const pathname = usePathname();
  const isWatchViewport = useIsWatch();

  // On a round watch the viewport is ~192 CSS px: navigation chrome would eat
  // the whole screen and push the board out of view, so the shell gets out of
  // the way and the watch screen owns the glass.
  if (isWatchViewport) {
    return <main className="watch-root">{children}</main>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: 'color-mix(in oklab, var(--surface) 88%, transparent)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 no-underline" style={{ color: 'inherit' }}>
            <span
              aria-hidden
              style={{
                display: 'grid',
                placeItems: 'center',
                width: '2rem',
                height: '2rem',
                borderRadius: '0.6rem',
                background: 'var(--accent)',
                color: '#fff',
                flex: 'none',
              }}
            >
              <LogoMark />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[0.95rem] font-semibold tracking-tight">{t('app.name')}</span>
              <span className="text-muted text-[0.7rem]">{t('app.short')}</span>
            </span>
          </Link>

          <nav className="order-3 flex w-full flex-wrap items-center gap-1 sm:order-none sm:w-auto" aria-label="Main">
            {NAV.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="nav-link"
                aria-current={pathname === item.href ? 'page' : undefined}
              >
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <SegmentedControl
              size="sm"
              value={settings.locale}
              onChange={locale => update({ locale })}
              options={[
                { value: 'zh', label: '中文' },
                { value: 'en', label: 'EN' },
              ]}
            />
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '0.35rem 0.5rem' }}
              onClick={() => update({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
              aria-label={t('common.theme')}
              title={t('common.theme')}
            >
              {settings.theme === 'dark' ? '☀' : '☾'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6">{children}</main>

      <footer className="text-muted mx-auto w-full max-w-6xl px-4 pb-8 pt-4 text-xs sm:px-6">
        <p>
          {t('app.tagline')} · Stockfish 19 Lite WASM (GPL-3.0) · {t('common.pieces')}: cburnett
        </p>
      </footer>
    </div>
  );
}
