'use client';

import Link from 'next/link';
import { useSettings } from '@/lib/store/settings';
import { SegmentedControl } from '@/components/ui/Primitives';
import { EloSlider } from '@/components/game/widgets';
import { useIsWatch } from '@/lib/hooks/useIsWatch';
import type { Locale } from '@/lib/i18n';

const MODES = [
  { href: '/play', titleKey: 'home.play.title', descKey: 'home.play.desc', icon: '♟', accent: 'var(--color-aurora-400)' },
  { href: '/coach', titleKey: 'home.coach.title', descKey: 'home.coach.desc', icon: '🎓', accent: 'var(--color-violet-glow)' },
  { href: '/review', titleKey: 'home.review.title', descKey: 'home.review.desc', icon: '📊', accent: '#38bdf8' },
  { href: '/watch', titleKey: 'home.watch.title', descKey: 'home.watch.desc', icon: '⌚', accent: '#fbbf24' },
] as const;

export default function HomePage() {
  const { t, settings, update } = useSettings();
  const isWatchViewport = useIsWatch();

  return (
    <div className="flex flex-col gap-6">
      <section className="surface-strong p-6">
        <h1 className="text-2xl font-bold sm:text-3xl">
          {t('app.name')}
          <span className="text-muted ml-2 text-base font-medium">{t('app.tagline')}</span>
        </h1>
        <p className="text-muted mt-2 text-sm">{t('home.subtitle')}</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {MODES.map(mode => (
            <Link
              key={mode.href}
              href={mode.href}
              className="surface flex items-start gap-3 p-4 no-underline transition-transform hover:-translate-y-0.5"
              style={{ color: 'inherit' }}
            >
              <span
                aria-hidden
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: '2.4rem',
                  height: '2.4rem',
                  borderRadius: '0.8rem',
                  fontSize: '1.3rem',
                  background: `color-mix(in oklab, ${mode.accent} 22%, transparent)`,
                  border: `1px solid color-mix(in oklab, ${mode.accent} 45%, transparent)`,
                }}
              >
                {mode.icon}
              </span>
              <span className="flex flex-col">
                <span className="font-semibold">{t(mode.titleKey)}</span>
                <span className="text-muted text-sm">{t(mode.descKey)}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="surface p-4">
          <h2 className="mb-3 text-sm font-semibold">{t('play.strength')}</h2>
          <EloSlider elo={settings.elo} onChange={elo => update({ elo })} />
          <p className="text-muted mt-3 text-xs">
            {t('common.level')}：{t('play.engineStrengthNote')}
          </p>
        </div>

        <div className="surface flex flex-col gap-4 p-4">
          <h2 className="text-sm font-semibold">{t('common.settings')}</h2>

          <div className="flex flex-col gap-1">
            <span className="field-label">{t('common.theme')}</span>
            <SegmentedControl
              value={settings.theme}
              onChange={theme => update({ theme })}
              options={[
                { value: 'dark', label: t('common.dark') },
                { value: 'light', label: t('common.light') },
                { value: 'system', label: t('common.system') },
              ]}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="field-label">{t('common.language')}</span>
            <SegmentedControl<Locale>
              value={settings.locale}
              onChange={locale => update({ locale })}
              options={[
                { value: 'zh', label: '中文' },
                { value: 'en', label: 'English' },
              ]}
            />
          </div>

          <label className="flex items-center justify-between text-sm">
            <span>{t('common.coordinates')}</span>
            <input
              type="checkbox"
              checked={settings.coordinates}
              onChange={event => update({ coordinates: event.target.checked })}
              style={{ width: '1.1rem', height: '1.1rem' }}
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="field-label">{t('play.yourColor')}</span>
            <SegmentedControl
              value={settings.playerColor}
              onChange={playerColor => update({ playerColor })}
              options={[
                { value: 'w', label: t('play.white') },
                { value: 'b', label: t('play.black') },
                { value: 'random', label: t('play.random') },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="surface p-4 text-sm">
        <h2 className="mb-2 text-sm font-semibold">{isWatchViewport ? t('watch.title') : t('home.tip')}</h2>
        <p className="text-muted">
          引擎在浏览器内本地运行（Stockfish 19 Lite WASM，约 1.7MB，无需联网、无需服务器）。所有棋谱与设置保存在本机。
        </p>
      </section>
    </div>
  );
}
