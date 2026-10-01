'use client';

import type { CSSProperties } from 'react';
import { useSettings, type PieceSet } from '@/lib/store/settings';

/**
 * Piece rendering.
 *
 * Two sets are available:
 *
 *  - `cburnett` (default) — the exact artwork lichess serves from
 *    `public/piece/cburnett/*.svg`, by Colin M.L. Burnett. The files are
 *    vendored unmodified by `scripts/setup-pieces.mjs`; see the LICENSE.txt in
 *    that folder for attribution.
 *  - `aurora` — the project's own geometric set, drawn as inline SVG so its
 *    fill/stroke follow the theme tokens.
 */

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceColor = 'w' | 'b';
export type { PieceSet };

export const PIECE_TYPES: PieceType[] = ['p', 'n', 'b', 'r', 'q', 'k'];

const CBURNETT_BASE = '/piece/cburnett';

/** URL of a piece in the lichess set, e.g. `/piece/cburnett/wK.svg`. */
export function pieceAssetUrl(type: PieceType, color: PieceColor): string {
  return `${CBURNETT_BASE}/${color}${type.toUpperCase()}.svg`;
}

export interface PieceArtProps {
  type: PieceType;
  color: PieceColor;
  /** Overrides the user's configured set (used by the settings preview). */
  set?: PieceSet;
  className?: string;
  style?: CSSProperties;
}

export function PieceArt({ type, color, set, className, style }: PieceArtProps) {
  const { settings } = useSettings();
  const activeSet = set ?? settings.pieceSet;

  if (activeSet === 'cburnett') {
    return (
      // A plain <img> keeps the lichess artwork byte-identical and lets the
      // browser cache the twelve files once for the whole app.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={pieceAssetUrl(type, color)}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={className}
        style={{ width: '100%', height: '100%', ...style }}
      />
    );
  }

  return <AuroraPiece type={type} color={color} className={className} style={style} />;
}

// --------------------------------------------------------------- aurora set --

const BASE =
  'M10.5 33.4h24a2.6 2.6 0 0 1 2.6 2.6v1.6a2.6 2.6 0 0 1-2.6 2.6h-24A2.6 2.6 0 0 1 7.9 37.6V36a2.6 2.6 0 0 1 2.6-2.6z';

function auroraBody(type: PieceType, stroke: string) {
  switch (type) {
    case 'p':
      return (
        <>
          <circle cx="22.5" cy="14" r="5.1" />
          <path d="M15.4 19.6h14.2l-1.6 9.8H17z" />
          <path d={BASE} />
        </>
      );
    case 'r':
      return (
        <>
          <path d="M12.4 9h4.4v3.2h4V9h4v3.2h4V9h4.4v7.4h-20.8z" />
          <path d="M15 16.4h15l-1 4.2H16z" />
          <path d="M16.2 20.6h13l1.2 12.8H15z" />
          <path d={BASE} />
        </>
      );
    case 'b':
      return (
        <>
          <circle cx="22.5" cy="9.6" r="2.7" />
          <path d="M22.5 12.4c3.8 1.8 5.9 5.2 5.9 8.7 0 2-.8 3.7-2.1 4.8h-7.6c-1.3-1.1-2.1-2.8-2.1-4.8 0-3.5 2.1-6.9 5.9-8.7z" />
          <path d="M22.5 15.6v6" stroke={stroke} strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d="M16.6 25.9h11.8l1 3.2H15.6z" />
          <path d="M17.2 29.1h10.6l1.4 4.3H15.8z" />
          <path d={BASE} />
        </>
      );
    case 'n':
      return (
        <>
          <path d="M16.4 33.4c-.9-6.6-.6-11.4 1.6-15 1.5-2.4 3.6-3.9 6.1-4.8l-1.7-2.7c-.6-1 .1-2.1 1.2-2.1.7 0 1.3.4 1.7 1.1l1.8 3.5c3.6 1.5 6 4.9 6 9.1 0 3.4-.7 7.3-1.1 10.9z" />
          <path d="M24.4 13.6 26.6 8.9 28.4 14z" />
          <circle cx="26.9" cy="17.6" r="1.15" fill={stroke} stroke="none" />
          <path
            d="M18.6 24.6c2.6-1.4 5.4-1.9 8.4-1.7"
            stroke={stroke}
            strokeWidth="1.3"
            fill="none"
            strokeLinecap="round"
          />
          <path d={BASE} />
        </>
      );
    case 'q':
      return (
        <>
          <circle cx="11.6" cy="11.8" r="2.3" />
          <circle cx="17" cy="9.4" r="2.3" />
          <circle cx="22.5" cy="8.4" r="2.4" />
          <circle cx="28" cy="9.4" r="2.3" />
          <circle cx="33.4" cy="11.8" r="2.3" />
          <path d="M11.6 13.6 15.4 23h14.2l3.8-9.4-5.3 3.6-2.8-7-2.8 7-2.8-7-2.8 7z" />
          <path d="M15.6 22.6h13.8l1.2 6.8H14.4z" />
          <path d={BASE} />
        </>
      );
    case 'k':
      return (
        <>
          <path d="M20.9 5.6h3.2v3.3h3.3v3.2h-3.3v3.3h-3.2v-3.3h-3.3v-3.2h3.3z" />
          <path d="M14.4 15.4h16.2l1.4 6.4H13z" />
          <path d="M15.4 21.6h14.2l1.2 7.6H14.2z" />
          <path d={BASE} />
        </>
      );
    default:
      return null;
  }
}

export function AuroraPiece({
  type,
  color,
  className,
  style,
}: {
  type: PieceType;
  color: PieceColor;
  className?: string;
  style?: CSSProperties;
}) {
  const fill = color === 'w' ? 'var(--piece-white-fill)' : 'var(--piece-black-fill)';
  const stroke = color === 'w' ? 'var(--piece-white-stroke)' : 'var(--piece-black-stroke)';
  return (
    <svg viewBox="0 0 45 45" className={className} style={style} role="img" aria-hidden="true" focusable="false">
      <g fill={fill} stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
        {auroraBody(type, stroke)}
      </g>
    </svg>
  );
}
