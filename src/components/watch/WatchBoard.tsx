'use client';

import { useMemo } from 'react';
import { Board, type BoardPieceMap, type BoardTarget } from '@/components/board/Board';
import type { PieceType } from '@/components/board/PieceArt';
import { fileIndex, rankIndex } from '@/lib/chess/pieces';
import type { Color, Square } from '@/lib/chess/types';

/**
 * Circles visible per side of the panned window.
 *
 *  - `8` shows the whole board (as a map / overview),
 *  - `4` is the default working zoom (~40px squares at a 192px viewport),
 *  - `2` is the large-target fallback for small or shaky fingers.
 */
export type WatchZoom = 4 | 2 | 8;

/**
 * The viewport is a circle, so a square board only fits completely inside its
 * inscribed square (1/√2 ≈ 0.707 of the diameter). The full-board zoom uses
 * that factor; the windowed zooms simply magnify by `8 / squares`.
 */
const INSCRIBED = Math.SQRT1_2;

export function watchScale(zoom: WatchZoom): number {
  return zoom === 8 ? INSCRIBED : 8 / zoom;
}

export interface WatchBoardProps {
  pieces: BoardPieceMap;
  orientation: Color;
  movableColor: Color | null;
  turn: Color;
  zoom: WatchZoom;
  selected: Square | null;
  targets: BoardTarget[];
  lastMove: { from: Square; to: Square } | null;
  checkSquare: Square | null;
  /** Square the window should keep centred (usually the selection). */
  focus: Square | null;
  promotion: { from: Square; to: Square; color: Color } | null;
  onSelect: (square: Square | null) => void;
  onMove: (from: Square, to: Square) => void;
  onPromote: (piece: PieceType) => void;
  className?: string;
}

/**
 * The panned watch board.
 *
 * A full 8x8 grid is not legible on a round watch: at the 192 CSS px viewport
 * Wear OS designs for, an 8x8 board gives ~17 px squares, far below the 48 px
 * touch-target floor (see docs/reference/watch-ui-notes.md). Instead the board
 * is scaled inside a clipped circular viewport so only 4x4 (zoom 2) or 2x2
 * (zoom 4) squares are visible at ~35-70 px each, and the window auto-pans to
 * whatever the player is looking at.
 */
export function WatchBoard({
  pieces,
  orientation,
  movableColor,
  turn,
  zoom,
  selected,
  targets,
  lastMove,
  checkSquare,
  focus,
  promotion,
  onSelect,
  onMove,
  onPromote,
  className,
}: WatchBoardProps) {
  const scale = watchScale(zoom);

  const center = useMemo(() => {
    // Board coordinates of the point that must sit in the middle of the circle.
    const target = focus ?? selected ?? lastMove?.to ?? lastMove?.from ?? null;
    // The full board is centred and never pans.
    if (zoom === 8 || !target) return { x: 0.5, y: 0.5 };
    const file = fileIndex(target);
    const rank = rankIndex(target);
    const rawX = orientation === 'w' ? (file + 0.5) / 8 : 1 - (file + 0.5) / 8;
    const rawY = orientation === 'w' ? 1 - (rank + 0.5) / 8 : (rank + 0.5) / 8;
    // Keep the visible window inside the board.
    const half = 0.5 / scale;
    return {
      x: Math.min(1 - half, Math.max(half, rawX)),
      y: Math.min(1 - half, Math.max(half, rawY)),
    };
  }, [focus, lastMove, orientation, scale, selected, zoom]);

  // Translate is expressed in percent of the (unscaled) board box, so that the
  // point `center` lands exactly in the middle of the viewport.
  const translateX = (0.5 - center.x * scale) * 100;
  const translateY = (0.5 - center.y * scale) * 100;

  return (
    <div className={`watch-stage ${className ?? ''}`}>
      <div className="watch-content" style={{ overflow: 'hidden', borderRadius: '50%' }}>
        <div
          style={{
            width: '100%',
            height: '100%',
            transformOrigin: '0 0',
            transform: `translate(${translateX}%, ${translateY}%) scale(${scale})`,
            transition: 'transform 180ms ease-out',
          }}
        >
          <Board
            pieces={pieces}
            orientation={orientation}
            turn={turn}
            movableColor={movableColor}
            selected={selected}
            targets={targets}
            lastMove={lastMove}
            checkSquare={checkSquare}
            promotion={promotion}
            onSelect={onSelect}
            onMove={onMove}
            onPromote={onPromote}
            coordinates={false}
            className="watch-inner-board"
          />
        </div>
      </div>
    </div>
  );
}
