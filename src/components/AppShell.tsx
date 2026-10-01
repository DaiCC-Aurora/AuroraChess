'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useSettings } from '@/lib/store/settings';
import { useIsWatch } from '@/lib/hooks/useIsWatch';
import { SegmentedControl } from '@/components/ui/Primitives';

const NAV = [
  { href: '/', labelKey: 'nav.home', icon: '⌂' },
  { href: '/play', labelKey: 'nav.play', icon: '♟' },
  { href: '/coach', labelKey: 'nav.coach', icon: '🎓' },
  { href: '/review', labelKey: 'nav.review', icon: '📊' },
  { href: '/watch', labelKey: 'nav.watch', icon: '⌚' },
] as const;

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
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-3 pb-10 pt-4 sm:px-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 no-underline" style={{ color: 'inherit' }}>
          <span
            aria-hidden
            style={{
              display: 'grid',
              placeItems: 'center',
              width: '2rem',
              height: '2rem',
              borderRadius: '0.7rem',
              background: 'linear-gradient(135deg, var(--color-aurora-400), var(--color-violet-glow))',
              fontSize: '1.1rem',
            }}
          >
            ♞
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-base font-bold">{t('app.name')}</span>
            <span className="text-muted text-[0.7rem]">{t('app.short')}</span>
          </span>
        </Link>

        <nav className="flex flex-wrap items-center gap-1" aria-label="Main">
          {NAV.map(item => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-2.5 py-1.5 text-sm font-medium no-underline"
                style={{
                  color: active ? '#f8fffd' : 'var(--text-muted)',
                  background: active ? 'linear-gradient(135deg, var(--color-aurora-500), var(--color-aurora-700))' : 'transparent',
                }}
                aria-current={active ? 'page' : undefined}
              >
                <span aria-hidden className="mr-1">
                  {item.icon}
                </span>
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
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
            className="btn"
            style={{ padding: '0.3rem 0.55rem' }}
            onClick={() => update({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
            aria-label={t('common.theme')}
            title={t('common.theme')}
          >
            {settings.theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>

      {isWatchViewport && pathname !== '/watch' && (
        <div className="surface mb-3 flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
          <span>{t('home.watch.desc')}</span>
          <Link href="/watch" className="btn btn-primary no-underline" style={{ padding: '0.3rem 0.7rem' }}>
            {t('nav.watch')}
          </Link>
        </div>
      )}

      <main className="flex-1">{children}</main>

      <footer className="text-muted mt-8 text-center text-xs">
        <p>
          {t('app.tagline')} · Stockfish 19 Lite WASM (GPL-3.0) · {t('app.short')}
        </p>
      </footer>
    </div>
  );
}
