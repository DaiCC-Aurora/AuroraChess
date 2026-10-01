'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { WatchBoard, type WatchZoom } from './WatchBoard';
import type { PieceType } from '@/components/board/PieceArt';
import { PieceArt } from '@/components/board/PieceArt';
import { EngineStatusBadge } from '@/components/game/widgets';
import { useT, useSettings } from '@/lib/store/settings';
import { useGameController } from '@/lib/game/useGameController';
import { useEngineActions, useEngineState } from '@/lib/engine/react';
import { useVisibility } from '@/lib/hooks/useIsWatch';
import type { Color, PieceSymbol } from '@/lib/chess/types';

const PROMOTION_PIECES: PieceSymbol[] = ['q', 'r', 'b', 'n'];

/** Inline SVG menu icons (the watch UI carries no emoji). */
function MenuIcon({ name }: { name: 'undo' | 'hint' | 'flip' | 'zoom' | 'new' | 'color' }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true } as const;
  const stroke = { stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  switch (name) {
    case 'undo':
      return (
        <svg {...common}>
          <path d="M4 9h10a5 5 0 0 1 0 10H8" {...stroke} />
          <path d="M7.5 5.5 4 9l3.5 3.5" {...stroke} />
        </svg>
      );
    case 'hint':
      return (
        <svg {...common}>
          <path d="M9 17h6M10 20h4" {...stroke} />
          <path d="M12 3.5a5.5 5.5 0 0 0-3.2 9.9V17h6.4v-3.6A5.5 5.5 0 0 0 12 3.5z" {...stroke} />
        </svg>
      );
    case 'flip':
      return (
        <svg {...common}>
          <path d="M12 4v16" {...stroke} />
          <path d="M8.5 7.5 5 12l3.5 4.5M15.5 7.5 19 12l-3.5 4.5" {...stroke} />
        </svg>
      );
    case 'zoom':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="5.5" {...stroke} />
          <path d="m15.5 15.5 4 4M9 11h4M11 9v4" {...stroke} />
        </svg>
      );
    case 'new':
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" {...stroke} />
        </svg>
      );
    case 'color':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7.5" {...stroke} />
          <path d="M12 4.5v15a7.5 7.5 0 0 0 0-15z" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return null;
  }
}

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Watch layout.
 *
 * Only what matters is on screen: the panned board, a one-line status chip and
 * a result banner. Everything else lives behind the status chip, which opens a
 * radial menu — the research note is explicit that a watch page should not put
 * many targets on the glass at once.
 */
export function WatchScreen() {
  const t = useT();
  const { settings, update } = useSettings();
  const engineState = useEngineState();
  const { restart } = useEngineActions();
  const visible = useVisibility();
  const [zoom, setZoom] = useState<WatchZoom>(settings.watchZoom);
  const [menuOpen, setMenuOpen] = useState(false);
  const [playerColor, setPlayerColor] = useState<Color>('w');

  const controller = useGameController({
    mode: 'play',
    elo: settings.elo,
    playerColor,
    coachEnabled: false,
    coachInterrupt: 'mistake',
    coachDepth: 10,
    watch: true,
  });

  const { select, move, promote } = controller;

  // Battery saver: drop the board's animations while the page is hidden.
  useEffect(() => {
    if (!settings.watchBatterySaver) return;
    const root = document.documentElement;
    if (!visible) root.dataset.watchPaused = 'true';
    else delete root.dataset.watchPaused;
  }, [settings.watchBatterySaver, visible]);

  const onSquare = useCallback(
    (square: string | null) => {
      select(square as never);
      setMenuOpen(false);
    },
    [select],
  );

  const statusText = useMemo(() => {
    if (controller.status.over) {
      if (controller.status.winner === null) return t('play.draw');
      return controller.status.winner === playerColor ? t('play.youWon') : t('play.youLost');
    }
    const whose = controller.turn === playerColor ? t('play.yourMove') : t('play.engineThinking');
    const ms = controller.turn === 'w' ? controller.clockMs.w : controller.clockMs.b;
    return `${whose} · ${formatClock(ms)}`;
  }, [controller.clockMs, controller.status, controller.turn, playerColor, t]);

  const cycleZoom = useCallback(() => {
    // 4x4 (default) -> 2x2 (huge) -> whole board -> back to 4x4.
    const next: WatchZoom = zoom === 4 ? 2 : zoom === 2 ? 8 : 4;
    setZoom(next);
    update({ watchZoom: next });
  }, [update, zoom]);

  const zoomLabel = zoom === 4 ? t('watch.zoom4') : zoom === 2 ? t('watch.zoom2') : t('watch.zoom8');
  const promotionRequest = controller.promotion;

  return (
    <div className="flex min-h-[100vh] w-full items-center justify-center">
      <WatchBoard
        pieces={controller.pieces}
        orientation={controller.orientation}
        movableColor={controller.status.over ? null : playerColor}
        turn={controller.turn}
        zoom={zoom}
        selected={controller.selected}
        targets={controller.targets}
        lastMove={controller.lastMove}
        checkSquare={controller.checkSquare}
        focus={controller.selected}
        // Promotion uses the radial ring below, not the board's inline picker.
        promotion={null}
        onSelect={square => onSquare(square)}
        onMove={(from, to) => {
          setMenuOpen(false);
          move(from, to);
        }}
        onPromote={piece => promote(piece as PieceSymbol)}
      />

      {/* status chip (top) — tap to open the radial menu */}
      <button
        type="button"
        onClick={() => setMenuOpen(open => !open)}
        className="watch-chip"
        style={{
          position: 'fixed',
          top: '4%',
          left: '50%',
          translate: '-50% 0',
          padding: '0.3rem 0.7rem',
          fontSize: '0.75rem',
          zIndex: 20,
          maxWidth: '80vw',
        }}
      >
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span
            aria-hidden
            style={{
              width: '0.6rem',
              height: '0.6rem',
              borderRadius: '2px',
              background: controller.turn === 'w' ? '#f8fafc' : '#1f2937',
              border: '1px solid var(--border-subtle)',
            }}
          />
          {statusText}
        </span>
      </button>

      {/* engine state (bottom) */}
      <div style={{ position: 'fixed', bottom: '5%', left: '50%', translate: '-50% 0', zIndex: 20, fontSize: '0.65rem' }}>
        <EngineStatusBadge status={engineState.status} progressPercent={engineState.progress?.percent} failed={engineState.failed} onRetry={restart} />
      </div>

      {/* game over banner */}
      {controller.status.over && (
        <div
          className="animate-rise"
          style={{
            position: 'fixed',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background: 'color-mix(in oklab, var(--page-bg) 86%, transparent)',
            zIndex: 40,
          }}
        >
          <div className="watch-chip flex flex-col gap-2 p-4" style={{ borderRadius: '1rem', width: '70vw', textAlign: 'center' }}>
            <span className="text-sm font-bold">{statusText}</span>
            {controller.status.reason && <span className="text-muted text-xs">{t(`result.${controller.status.reason}`)}</span>}
            <button type="button" className="btn btn-primary" onClick={controller.reset}>
              {t('watch.newGame')}
            </button>
          </div>
        </div>
      )}

      {/* radial promotion ring */}
      {promotionRequest && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 45, background: 'color-mix(in oklab, var(--page-bg) 74%, transparent)' }}>
          <p
            className="text-muted"
            style={{ position: 'absolute', top: '22%', width: '100%', textAlign: 'center', fontSize: '0.75rem' }}
          >
            {t('watch.promote')}
          </p>
          {PROMOTION_PIECES.map((piece, index) => (
            <button
              key={piece}
              type="button"
              className="watch-radial watch-chip"
              style={{
                width: 'calc(var(--d) * 0.24)',
                height: 'calc(var(--d) * 0.24)',
                '--angle': `${180 + index * 45}deg`,
                '--radius': 'calc(var(--d) * 0.32)',
                padding: '0.35rem',
              } as CSSProperties}
              onClick={() => promote(piece)}
              aria-label={`promote-${piece}`}
            >
              <PieceArt
                type={piece as PieceType}
                color={promotionRequest.color}
                style={{ width: '100%', height: '100%' }}
              />
            </button>
          ))}
        </div>
      )}

      {/* radial menu */}
      {menuOpen && !promotionRequest && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'color-mix(in oklab, var(--page-bg) 78%, transparent)' }}
          onClick={() => setMenuOpen(false)}
        >
          {MENU_ITEMS.map((item, index) => (
            <button
              key={item.key}
              type="button"
              className="watch-radial watch-chip"
              style={{
                // 0.26 * 192px = 50px: above the 48px touch-target floor even on
                // the smallest round watch, and still inside the viewport at
                // radius 0.33 * D.
                width: 'calc(var(--d) * 0.26)',
                height: 'calc(var(--d) * 0.26)',
                '--angle': `${index * 60}deg`,
                '--radius': 'calc(var(--d) * 0.33)',
                flexDirection: 'column',
                gap: '0.1rem',
                fontSize: '0.6rem',
              } as CSSProperties}
              onClick={event => {
                event.stopPropagation();
                switch (item.key) {
                  case 'undo':
                    controller.undo();
                    setMenuOpen(false);
                    break;
                  case 'hint':
                    void controller.requestHint();
                    setMenuOpen(false);
                    break;
                  case 'flip':
                    controller.flip();
                    setMenuOpen(false);
                    break;
                  case 'zoom':
                    cycleZoom();
                    setMenuOpen(false);
                    break;
                  case 'new':
                    controller.reset();
                    setMenuOpen(false);
                    break;
                  case 'color':
                    setPlayerColor(prev => (prev === 'w' ? 'b' : 'w'));
                    controller.reset();
                    setMenuOpen(false);
                    break;
                  default:
                    setMenuOpen(false);
                }
              }}
            >
              <span aria-hidden style={{ display: 'grid', placeItems: 'center' }}>
                <MenuIcon name={item.key} />
              </span>
              <span>{item.key === 'zoom' ? zoomLabel : t(item.labelKey)}</span>
            </button>
          ))}
        </div>
      )}

      {/* hint banner */}
      {controller.hint && (
        <div
          className="watch-chip animate-rise"
          style={{ position: 'fixed', bottom: '16%', left: '50%', translate: '-50% 0', padding: '0.3rem 0.7rem', zIndex: 30, fontSize: '0.75rem' }}
        >
          <span className="mono font-bold" style={{ color: 'var(--accent)' }}>
            {controller.hint.san}
          </span>
        </div>
      )}
    </div>
  );
}

const MENU_ITEMS = [
  { key: 'undo', labelKey: 'watch.undo' },
  { key: 'hint', labelKey: 'watch.hint' },
  { key: 'flip', labelKey: 'play.flip' },
  { key: 'zoom', labelKey: 'watch.zoom' },
  { key: 'new', labelKey: 'watch.newGame' },
  { key: 'color', labelKey: 'play.yourColor' },
] as const;
