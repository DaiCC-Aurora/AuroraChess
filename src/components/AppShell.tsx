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

/** Original mark: a wave with a rising point. */
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

function ThemeIcon({ dark }: { dark: boolean }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true } as const;
  const stroke = { stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <svg {...common}>
      {dark ? (
        <>
          <circle cx="12" cy="12" r="4" {...stroke} />
          <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4" {...stroke} />
        </>
      ) : (
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" {...stroke} />
      )}
    </svg>
  );
}

/** Chevron used by the collapse/restore controls. */
function ChevronIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={direction === 'up' ? 'M6 14.5 12 8.5l6 6' : 'M6 9.5 12 15.5l6-6'}
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t, settings, update } = useSettings();
  const pathname = usePathname();
  const isWatchViewport = useIsWatch();
  const headerHidden = settings.headerHidden;

  // On a round watch the viewport is ~192 CSS px: navigation chrome would eat
  // the whole screen and push the board out of view, so the shell gets out of
  // the way and the watch screen owns the glass.
  if (isWatchViewport) {
    return <main className="watch-root">{children}</main>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      {headerHidden ? (
        // Collapsed: a small tab at the top edge brings the bar back. It sits in
        // the corner so it never covers the board's playable squares.
        <button
          type="button"
          data-testid="header-toggle"
          className="header-restore"
          onClick={() => update({ headerHidden: false })}
          aria-label={t('common.showHeader')}
          title={t('common.showHeader')}
          aria-expanded={false}
        >
          <ChevronIcon direction="down" />
        </button>
      ) : (
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
                <ThemeIcon dark={settings.theme === 'dark'} />
              </button>
              <button
                type="button"
                data-testid="header-toggle"
                className="btn btn-ghost"
                style={{ padding: '0.35rem 0.5rem' }}
                onClick={() => update({ headerHidden: true })}
                aria-label={t('common.hideHeader')}
                title={t('common.hideHeader')}
                aria-expanded
              >
                <ChevronIcon direction="up" />
              </button>
            </div>
          </div>
        </header>
      )}

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6">{children}</main>

      <footer className="text-muted mx-auto w-full max-w-6xl px-4 pb-8 pt-4 text-xs sm:px-6">
        <p>Stockfish 19 Lite WASM (GPL-3.0) · cburnett pieces by Colin M.L. Burnett (GPLv2+ / CC BY-SA 3.0)</p>
      </footer>
    </div>
  );
}
