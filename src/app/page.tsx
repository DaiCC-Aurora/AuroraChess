'use client';

import Link from 'next/link';
import { useSettings } from '@/lib/store/settings';
import { SegmentedControl } from '@/components/ui/Primitives';
import { EloSlider } from '@/components/game/widgets';
import { PieceArt } from '@/components/board/PieceArt';
import type { BoardTheme, PieceSet } from '@/lib/store/settings';
import type { Locale } from '@/lib/i18n';

const MODES = [
  { href: '/play', titleKey: 'home.play.title', descKey: 'home.play.desc', icon: '♟' },
  { href: '/coach', titleKey: 'home.coach.title', descKey: 'home.coach.desc', icon: '🎓' },
  { href: '/review', titleKey: 'home.review.title', descKey: 'home.review.desc', icon: '📊' },
  { href: '/watch', titleKey: 'home.watch.title', descKey: 'home.watch.desc', icon: '⌚' },
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

      <section className="surface-flat p-4 text-sm">
        <p className="text-muted">
          引擎在浏览器内本地运行（Stockfish 19 Lite WASM，约 1.7MB，无需联网、无需服务器）；棋子使用
          lichess 的 cburnett 棋组（Colin M.L. Burnett，GPLv2+/CC BY-SA 3.0）。所有棋谱与设置保存在本机。
        </p>
      </section>
    </div>
  );
}
