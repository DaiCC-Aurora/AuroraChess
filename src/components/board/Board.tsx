'use client';

import { useCallback, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { FILES, RANKS, fileIndex, isLightSquare, rankIndex } from '@/lib/chess/pieces';
import type { Color, Square } from '@/lib/chess/types';
import { PieceArt, type PieceType } from './PieceArt';

export interface BoardPieceMap {
  [square: string]: { type: PieceType; color: Color };
}

export interface BoardTarget {
  to: Square;
  isCapture: boolean;
}

export interface BoardProps {
  pieces: BoardPieceMap;
  orientation?: Color;
  /** Side that is allowed to move pieces right now. */
  movableColor?: Color | null;
  turn: Color;
  lastMove?: { from: Square; to: Square } | null;
  checkSquare?: Square | null;
  selected?: Square | null;
  targets?: BoardTarget[];
  /** Coach suggestions drawn as arrows. */
  hint?: { from: Square; to: Square } | null;
  threat?: { from: Square; to: Square } | null;
  /** Squares the coach wants to draw attention to. */
  marked?: Square[];
  interactive?: boolean;
  coordinates?: boolean;
  promotion?: { from: Square; to: Square; color: Color } | null;
  onSelect?: (square: Square | null) => void;
  onMove?: (from: Square, to: Square) => void;
  onPromote?: (piece: PieceType) => void;
  className?: string;
  /** Piece rendering scale, useful for very small (watch) boards. */
  pieceScale?: number;
}

const PROMOTION_PIECES: PieceType[] = ['q', 'r', 'b', 'n'];

function squareToPercent(square: string, orientation: Color): { x: number; y: number } {
  const file = fileIndex(square);
  const rank = rankIndex(square);
  const x = orientation === 'w' ? file : 7 - file;
  const y = orientation === 'w' ? 7 - rank : rank;
  return { x: x * 12.5, y: y * 12.5 };
}

function coordsFromPoint(
  rect: DOMRect,
  clientX: number,
  clientY: number,
  orientation: Color,
): Square | null {
  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;
  if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;
  const col = Math.min(7, Math.max(0, Math.floor(relX * 8)));
  const row = Math.min(7, Math.max(0, Math.floor(relY * 8)));
  const file = orientation === 'w' ? col : 7 - col;
  const rank = orientation === 'w' ? 7 - row : row;
  return `${FILES[file]}${RANKS[rank]}`;
}

export function Board({
  pieces,
  orientation = 'w',
  movableColor = null,
  turn,
  lastMove = null,
  checkSquare = null,
  selected = null,
  targets = [],
  hint = null,
  threat = null,
  marked = [],
  interactive = true,
  coordinates = true,
  promotion = null,
  onSelect,
  onMove,
  onPromote,
  className,
  pieceScale = 1,
}: BoardProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: Square; x: number; y: number } | null>(null);

  const targetMap = useMemo(() => {
    const map = new Map<string, BoardTarget>();
    for (const target of targets) map.set(target.to, target);
    return map;
  }, [targets]);

  const squareAt = useCallback(
    (clientX: number, clientY: number): Square | null => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return coordsFromPoint(rect, clientX, clientY, orientation);
    },
    [orientation],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!interactive || promotion) return;
      const square = squareAt(event.clientX, event.clientY);
      if (!square) return;
      const piece = pieces[square];

      // Completing a tap-tap move.
      if (selected && targetMap.has(square)) {
        onMove?.(selected, square);
        return;
      }
      if (selected && square === selected) {
        onSelect?.(null);
        return;
      }
      if (piece && piece.color === (movableColor ?? turn)) {
        onSelect?.(square);
        const rect = surfaceRef.current?.getBoundingClientRect();
        if (rect) {
          setDrag({
            from: square,
            x: ((event.clientX - rect.left) / rect.width) * 100 - 6.25,
            y: ((event.clientY - rect.top) / rect.height) * 100 - 6.25,
          });
          try {
            (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
          } catch {
            // Synthetic events (and some touch stacks) have no active pointer to
            // capture; dragging still works through pointermove on the board.
          }
        }
        return;
      }
      onSelect?.(null);
    },
    [interactive, promotion, squareAt, pieces, selected, targetMap, onMove, onSelect, movableColor, turn],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!drag) return;
      const rect = surfaceRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDrag({
        from: drag.from,
        x: ((event.clientX - rect.left) / rect.width) * 100 - 6.25,
        y: ((event.clientY - rect.top) / rect.height) * 100 - 6.25,
      });
    },
    [drag],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!drag) return;
      const square = squareAt(event.clientX, event.clientY);
      const from = drag.from;
      setDrag(null);
      if (!square || square === from) return; // keep the selection for tap-tap
      if (targetMap.has(square)) onMove?.(from, square);
    },
    [drag, squareAt, targetMap, onMove],
  );

  const dragStyle: CSSProperties | undefined = drag
    ? { left: `${drag.x}%`, top: `${drag.y}%`, zIndex: 40 }
    : undefined;

  // --- squares -----------------------------------------------------------
  const squares: { square: Square; light: boolean; x: number; y: number }[] = [];
  for (const rank of RANKS) {
    for (const file of FILES) {
      const square = `${file}${rank}`;
      const { x, y } = squareToPercent(square, orientation);
      squares.push({ square, light: isLightSquare(square), x, y });
    }
  }

  const pieceEntries = Object.entries(pieces);
  const promotionPercent = promotion ? squareToPercent(promotion.to, orientation) : null;

  return (
    <div
      ref={surfaceRef}
      className={`board-surface ${className ?? ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDrag(null)}
      style={{ cursor: interactive ? 'pointer' : 'default' }}
    >
      {squares.map(sq => (
        <div
          key={sq.square}
          className={`board-square ${sq.light ? 'light' : 'dark'}`}
          style={{ left: `${sq.x}%`, top: `${sq.y}%` }}
        />
      ))}

      {/* last move tint */}
      {lastMove &&
        [lastMove.from, lastMove.to].map(square => {
          const { x, y } = squareToPercent(square, orientation);
          return (
            <div
              key={`last-${square}`}
              className="board-cell"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: '12.5%',
                height: '12.5%',
                
                background: 'var(--hl-last)',
              }}
            />
          );
        })}

      {/* coach markers */}
      {marked.map(square => {
        const { x, y } = squareToPercent(square, orientation);
        return (
          <div
            key={`mark-${square}`}
            className="board-cell"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: '12.5%',
              height: '12.5%',
              boxShadow: 'inset 0 0 0 3px var(--hl-mark)',
              borderRadius: '2px',
            }}
          />
        );
      })}

      {/* selection */}
      {selected &&
        (() => {
          const { x, y } = squareToPercent(selected, orientation);
          return (
            <div
              className="board-cell"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: '12.5%',
                height: '12.5%',
                
                background: 'var(--hl-selected)',
              }}
            />
          );
        })()}

      {/* legal move dots */}
      {targets.map(target => {
        const { x, y } = squareToPercent(target.to, orientation);
        return (
          <div
            key={`target-${target.to}`}
            className="board-cell"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: '12.5%',
              height: '12.5%',
              
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <span
              style={{
                width: target.isCapture ? '88%' : '30%',
                height: target.isCapture ? '88%' : '30%',
                borderRadius: '999px',
                background: target.isCapture ? 'transparent' : 'var(--hl-legal-dot)',
                boxShadow: target.isCapture ? 'inset 0 0 0 5px var(--hl-legal-ring)' : undefined,
                display: 'block',
              }}
            />
          </div>
        );
      })}

      {/* check */}
      {checkSquare &&
        (() => {
          const { x, y } = squareToPercent(checkSquare, orientation);
          return (
            <div
              className="board-cell"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                width: '12.5%',
                height: '12.5%',
                
                background: 'var(--hl-check)',
              }}
            />
          );
        })()}

      {/* pieces */}
      {pieceEntries.map(([square, piece]) => {
        const { x, y } = squareToPercent(square, orientation);
        const isDragging = drag?.from === square;
        const slideFrom = lastMove && lastMove.to === square ? lastMove.from : null;
        const slideStyle: CSSProperties | undefined = slideFrom
          ? (() => {
              const from = squareToPercent(slideFrom, orientation);
              const to = squareToPercent(square, orientation);
              return {
                ['--dx' as string]: `${((from.x - to.x) / 12.5) * 100}%`,
                ['--dy' as string]: `${((from.y - to.y) / 12.5) * 100}%`,
              } as CSSProperties;
            })()
          : undefined;

        return (
          <div
            key={isDragging ? `${square}-drag` : square}
            className={`board-piece ${isDragging ? 'dragging' : 'piece-slide'}`}
            style={{
              left: isDragging ? dragStyle?.left : `${x}%`,
              top: isDragging ? dragStyle?.top : `${y}%`,
              zIndex: isDragging ? 40 : undefined,
              ...(isDragging ? {} : slideStyle),
            }}
          >
            <PieceArt
              type={piece.type}
              color={piece.color}
              style={{ width: '100%', height: '100%', transform: pieceScale !== 1 ? `scale(${pieceScale})` : undefined }}
            />
          </div>
        );
      })}

      {/* arrows: threat first so the hint sits on top */}
      {(threat || hint) && (
        <svg className="board-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          <defs>
            <marker id="arrow-hint" markerWidth="4" markerHeight="4" refX="2.4" refY="2" orient="auto">
              <path d="M0 0 L4 2 L0 4 z" fill="var(--hl-arrow)" />
            </marker>
            <marker id="arrow-threat" markerWidth="4" markerHeight="4" refX="2.4" refY="2" orient="auto">
              <path d="M0 0 L4 2 L0 4 z" fill="rgba(248,113,113,0.95)" />
            </marker>
          </defs>
          {threat && <Arrow from={threat.from} to={threat.to} orientation={orientation} color="rgba(248,113,113,0.85)" marker="arrow-threat" />}
          {hint && <Arrow from={hint.from} to={hint.to} orientation={orientation} color="var(--hl-arrow)" marker="arrow-hint" />}
        </svg>
      )}

      {/* coordinates */}
      {coordinates && (
        <>
          {FILES.map((file, index) => {
            const col = orientation === 'w' ? index : 7 - index;
            return (
              <span
                key={`file-${file}`}
                className="board-cell mono"
                style={{
                  left: `${col * 12.5}%`,
                  top: 'auto',
                  bottom: 0,
                  width: '12.5%',
                  height: 'auto',
                  padding: '1px 3px',
                  fontSize: 'clamp(7px, 1.6vw, 11px)',
                  color: 'var(--board-coord)',
                  textAlign: 'right',
                  
                }}
              >
                {file}
              </span>
            );
          })}
          {RANKS.map((rank, index) => {
            const row = orientation === 'w' ? 7 - index : index;
            return (
              <span
                key={`rank-${rank}`}
                className="board-cell mono"
                style={{
                  left: 0,
                  top: `${row * 12.5}%`,
                  width: '12.5%',
                  height: 'auto',
                  padding: '1px 3px',
                  fontSize: 'clamp(7px, 1.6vw, 11px)',
                  color: 'var(--board-coord)',
                  
                }}
              >
                {rank}
              </span>
            );
          })}
        </>
      )}

      {/* promotion picker */}
      {promotion && promotionPercent && (
        <div
          style={{
            position: 'absolute',
            left: `${Math.min(75, Math.max(0, promotionPercent.x))}%`,
            top: promotionPercent.y > 50 ? 'auto' : `${promotionPercent.y + 12.5}%`,
            bottom: promotionPercent.y > 50 ? `${100 - promotionPercent.y}%` : 'auto',
            width: '12.5%',
            display: 'grid',
            gap: '2px',
            background: 'var(--surface-strong)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '2px',
            zIndex: 50,
          }}
        >
          {PROMOTION_PIECES.map(type => (
            <button
              key={type}
              type="button"
              onClick={() => onPromote?.(type)}
              style={{ width: '100%', aspectRatio: '1 / 1', background: 'transparent', border: 'none', cursor: 'pointer' }}
              aria-label={`promote-${type}`}
            >
              <PieceArt
                type={type}
                color={promotion.color}
                style={{ width: '100%', height: '100%' }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Arrow({
  from,
  to,
  orientation,
  color,
  marker,
}: {
  from: Square;
  to: Square;
  orientation: Color;
  color: string;
  marker: string;
}) {
  const a = squareToPercent(from, orientation);
  const b = squareToPercent(to, orientation);
  const x1 = a.x + 6.25;
  const y1 = a.y + 6.25;
  const x2 = b.x + 6.25;
  const y2 = b.y + 6.25;
  // Stop short of the destination centre so the arrow head is visible.
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const endX = x1 + (dx / length) * (length - 3.2);
  const endY = y1 + (dy / length) * (length - 3.2);
  return (
    <line
      x1={x1}
      y1={y1}
      x2={endX}
      y2={endY}
      stroke={color}
      strokeWidth="2.4"
      strokeLinecap="round"
      markerEnd={`url(#${marker})`}
      vectorEffect="non-scaling-stroke"
    />
  );
}
