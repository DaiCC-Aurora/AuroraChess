'use client';

import Link from 'next/link';
import { useSettings } from '@/lib/store/settings';
import { SegmentedControl } from '@/components/ui/Primitives';
import { EloSlider } from '@/components/game/widgets';
import { PieceArt } from '@/components/board/PieceArt';
import type { BoardTheme, PieceSet } from '@/lib/store/settings';
import type { Locale } from '@/lib/i18n';

/** Icons are inline SVG so the interface carries no emoji glyphs. */
function ModeIcon({ name }: { name: 'play' | 'coach' | 'review' | 'watch' }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true } as const;
  const stroke = { stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  switch (name) {
    case 'play':
      return (
        <svg {...common}>
          <path d="M12 3.5c-1.9 0-3.4 1.5-3.4 3.4 0 1 .4 1.9 1.1 2.5-1.6 1-2.7 2.8-2.7 4.9 1.5-1 3.2-1.6 5-1.6s3.5.6 5 1.6c0-2.1-1.1-3.9-2.7-4.9.7-.6 1.1-1.5 1.1-2.5 0-1.9-1.5-3.4-3.4-3.4z" {...stroke} />
          <path d="M6.5 19.5h11M7.5 18c0-1.2 2-2 4.5-2s4.5.8 4.5 2" {...stroke} />
        </svg>
      );
    case 'coach':
      return (
        <svg {...common}>
          <path d="M4 5.5h6.5c1 0 1.5.6 1.5 1.4v11c0-.8-.6-1.4-1.5-1.4H4z" {...stroke} />
          <path d="M20 5.5h-6.5c-1 0-1.5.6-1.5 1.4v11c0-.8.6-1.4 1.5-1.4H20z" {...stroke} />
        </svg>
      );
    case 'review':
      return (
        <svg {...common}>
          <path d="M4 19.5h16" {...stroke} />
          <path d="M6.5 16V9m5 7V5.5m5 10.5v-4.5" {...stroke} />
        </svg>
      );
    case 'watch':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="6.5" {...stroke} />
          <path d="M12 9v3.2l2.2 1.6M9.5 3.5h5M9.5 20.5h5" {...stroke} />
        </svg>
      );
    default:
      return null;
  }
}

const MODES = [
  { href: '/play', titleKey: 'home.play.title', descKey: 'home.play.desc', icon: 'play' },
  { href: '/coach', titleKey: 'home.coach.title', descKey: 'home.coach.desc', icon: 'coach' },
  { href: '/review', titleKey: 'home.review.title', descKey: 'home.review.desc', icon: 'review' },
  { href: '/watch', titleKey: 'home.watch.title', descKey: 'home.watch.desc', icon: 'watch' },
] as const;

export default function HomePage() {
  const { t, settings, update } = useSettings();

  return (
    <div className="flex flex-col gap-5">
      <section className="surface p-6 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('app.name')}</h1>
        <p className="text-muted mt-2 text-sm">{t('home.subtitle')}</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {MODES.map(mode => (
            <Link key={mode.href} href={mode.href} className="mode-card">
              <span className="mode-icon" aria-hidden>
                <ModeIcon name={mode.icon} />
              </span>
              <span className="flex flex-col">
                <span className="font-semibold">{t(mode.titleKey)}</span>
                <span className="text-muted text-sm">{t(mode.descKey)}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid items-start gap-4 md:grid-cols-2">
        <div className="surface flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold">{t('play.strength')}</h2>
          <EloSlider elo={settings.elo} onChange={elo => update({ elo })} />
        </div>

        <div className="surface flex flex-col gap-4 p-4">
          <h2 className="text-sm font-semibold">{t('common.settings')}</h2>

          <div className="flex flex-col gap-1.5">
            <span className="field-label">{t('common.theme')}</span>
            <SegmentedControl
              value={settings.theme}
              onChange={theme => update({ theme })}
              options={[
                { value: 'light', label: t('common.light') },
                { value: 'dark', label: t('common.dark') },
                { value: 'system', label: t('common.system') },
              ]}
            />
          </div>

          <div className="flex flex-col gap-1.5">
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

          <div className="flex flex-col gap-1.5">
            <span className="field-label">{t('common.pieces')}</span>
            <SegmentedControl<PieceSet>
              value={settings.pieceSet}
              onChange={pieceSet => update({ pieceSet })}
              options={[
                { value: 'cburnett', label: t('pieces.cburnett') },
                { value: 'aurora', label: t('pieces.aurora') },
              ]}
            />
            <div className="mt-1 flex items-center gap-1">
              {(['k', 'q', 'r', 'b', 'n', 'p'] as const).map(piece => (
                <span key={piece} style={{ width: '1.9rem', height: '1.9rem' }} aria-hidden>
                  <PieceArt type={piece} color="w" />
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="field-label">{t('common.boardTheme')}</span>
            <SegmentedControl<BoardTheme>
              value={settings.boardTheme}
              onChange={boardTheme => update({ boardTheme })}
              options={[
                { value: 'deepseek', label: t('board.deepseek') },
                { value: 'classic', label: t('board.classic') },
                { value: 'ice', label: t('board.ice') },
              ]}
            />
          </div>

          <div className="flex flex-col gap-1.5">
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

          <label className="flex items-center justify-between text-sm">
            <span>{t('common.hideHeader')}</span>
            <input
              type="checkbox"
              checked={settings.headerHidden}
              onChange={event => update({ headerHidden: event.target.checked })}
              style={{ width: '1.1rem', height: '1.1rem', accentColor: 'var(--accent)' }}
            />
          </label>

          <label className="flex items-center justify-between text-sm">
            <span>{t('common.coordinates')}</span>
            <input
              type="checkbox"
              checked={settings.coordinates}
              onChange={event => update({ coordinates: event.target.checked })}
              style={{ width: '1.1rem', height: '1.1rem', accentColor: 'var(--accent)' }}
            />
          </label>
        </div>
      </section>
    </div>
  );
}
