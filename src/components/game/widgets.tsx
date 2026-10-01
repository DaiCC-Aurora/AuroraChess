'use client';

import { useMemo } from 'react';
import { evalBarPercent, formatEval, scoreToCp, winPercent } from '@/lib/engine/analysis';
import type { EngineInfo, EngineScore } from '@/lib/engine/uci';
import { QUALITY_META } from '@/lib/engine/analysis';
import type { MoveQuality, MoveRecord } from '@/lib/chess/types';
import { ENGINE_ELO_MAX, ENGINE_ELO_MIN, PRESET_ELOS, bandForElo, levelForElo } from '@/lib/engine/levels';
import { useT } from '@/lib/store/settings';
import { Chip, ProgressBar, SegmentedControl, Spinner } from '@/components/ui/Primitives';

/** White-relative centipawns + mate info from a live engine info line. */
export function whiteScoreOf(info: EngineInfo | null, turn: 'w' | 'b'): EngineScore | undefined {
  if (!info?.score) return undefined;
  if (info.score.type === 'cp') {
    return { type: 'cp', value: turn === 'w' ? info.score.value : -info.score.value };
  }
  return { type: 'mate', value: turn === 'w' ? info.score.value : -info.score.value };
}

export function EvalBar({ score, turn, orientation = 'w' }: { score?: EngineScore; turn: 'w' | 'b'; orientation?: 'w' | 'b' }) {
  const cp = scoreToCp(score);
  const whiteCp = turn === 'w' ? cp : -cp;
  const percent = evalBarPercent(whiteCp);
  const flipped = orientation === 'b';
  const label = formatEval(score, orientation, turn);
  const winning = Math.round(winPercent(whiteCp));

  return (
    <div className="flex items-stretch gap-2" style={{ height: '100%', minHeight: '120px' }}>
      <div
        style={{
          position: 'relative',
          width: '1.6rem',
          borderRadius: '0.5rem',
          overflow: 'hidden',
          background: '#1f2937',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: flipped ? 'row-reverse' : 'row',
        }}
        title={`${label} · ${winning}%`}
      >
        <div style={{ width: '100%', background: '#f8fafc', height: `${percent}%`, alignSelf: 'flex-start', transition: 'height 260ms ease' }} />
      </div>
      <div className="flex flex-col justify-between py-1">
        <span className="mono text-sm font-semibold">{label}</span>
        <span className="text-muted mono text-[0.7rem]">{winning}%</span>
      </div>
    </div>
  );
}

export function MoveList({
  moves,
  onSelect,
  activePly,
  className,
  maxHeight,
}: {
  moves: MoveRecord[];
  onSelect?: (ply: number) => void;
  activePly?: number | null;
  className?: string;
  maxHeight?: string;
}) {
  const t = useT();
  const rows = useMemo(() => {
    const out: { number: number; white?: MoveRecord; black?: MoveRecord }[] = [];
    for (const move of moves) {
      const last = out[out.length - 1];
      if (move.color === 'w' || !last || last.black) {
        out.push({ number: move.moveNumber, white: move.color === 'w' ? move : undefined, black: move.color === 'b' ? move : undefined });
      } else {
        last.black = move;
      }
    }
    return out;
  }, [moves]);

  if (!moves.length) return <p className="text-muted text-sm">{t('play.noMoves')}</p>;

  return (
    <div className={`scroll-area ${className ?? ''}`} style={{ maxHeight, overscrollBehavior: 'contain' }}>
      <ol className="flex flex-col gap-0.5 text-sm">
        {rows.map(row => (
          <li key={row.number} className="flex items-center gap-1">
            <span className="text-muted mono w-7 shrink-0 text-right text-xs">{row.number}.</span>
            {[row.white, row.black].map((move, index) =>
              move ? (
                <button
                  key={move.ply}
                  type="button"
                  onClick={() => onSelect?.(move.ply)}
                  className="mono rounded px-1.5 py-0.5 text-left font-medium"
                  style={{
                    background: activePly === move.ply ? 'color-mix(in oklab, var(--accent) 26%, transparent)' : 'transparent',
                    border: 'none',
                    cursor: onSelect ? 'pointer' : 'default',
                    color: 'var(--text-primary)',
                    minWidth: '3.4rem',
                  }}
                >
                  {move.san}
                </button>
              ) : (
                <span key={`empty-${index}`} style={{ minWidth: '3.4rem' }} />
              ),
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ClockDisplay({
  whiteMs,
  blackMs,
  active,
  orientation = 'w',
  compact = false,
}: {
  whiteMs: number;
  blackMs: number;
  active: 'w' | 'b' | null;
  orientation?: 'w' | 'b';
  compact?: boolean;
}) {
  const t = useT();
  const format = (ms: number) => {
    const total = Math.floor(ms / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };
  const order: ('w' | 'b')[] = orientation === 'w' ? ['b', 'w'] : ['w', 'b'];
  return (
    <div className="flex flex-wrap gap-2">
      {order.map(color => (
        <div
          key={color}
          className="surface flex items-center gap-2 px-3 py-1.5"
          style={{
            borderColor: active === color ? 'color-mix(in oklab, var(--accent) 60%, transparent)' : undefined,
          }}
        >
          <span
            aria-hidden
            style={{ width: '0.7rem', height: '0.7rem', borderRadius: '2px', background: color === 'w' ? '#f8fafc' : '#1f2937', border: '1px solid var(--border-subtle)' }}
          />
          <span className="mono text-sm font-semibold">{format(color === 'w' ? whiteMs : blackMs)}</span>
        </div>
      ))}
    </div>
  );
}

export function EloSlider({
  elo,
  onChange,
  disabled,
  showPresets = true,
}: {
  elo: number;
  onChange: (elo: number) => void;
  disabled?: boolean;
  showPresets?: boolean;
}) {
  const t = useT();
  const level = levelForElo(elo);
  const bandLabel: Record<string, string> = {
    beginner: '入门',
    casual: '休闲',
    club: '俱乐部',
    strong: '高手',
    master: '大师',
    maximum: '全力',
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="field-label">{t('common.elo')}</span>
        <span className="mono text-xl font-bold" style={{ color: 'var(--accent)' }}>
          {level.elo}
          <span className="text-muted ml-2 text-xs font-medium">{bandLabel[bandForElo(elo)] ?? ''}</span>
        </span>
      </div>
      <input
        type="range"
        min={ENGINE_ELO_MIN}
        max={ENGINE_ELO_MAX}
        step={50}
        value={elo}
        disabled={disabled}
        onChange={event => onChange(Number(event.target.value))}
        aria-label={t('common.elo')}
      />
      {showPresets && (
        <div className="flex flex-wrap gap-1">
          {PRESET_ELOS.map(preset => (
            <button
              key={preset}
              type="button"
              className="btn"
              style={{
                padding: '0.25rem 0.55rem',
                fontSize: '0.75rem',
                borderColor: preset === elo ? 'color-mix(in oklab, var(--accent) 55%, transparent)' : undefined,
              }}
              disabled={disabled}
              onClick={() => onChange(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
      )}
      <p className="text-muted text-xs">
        {t('play.engineStrengthNote')} · {t('common.depth')} {level.depth} · {level.movetimeMs}ms
      </p>
    </div>
  );
}

export function EngineStatusBadge({
  status,
  progressPercent,
  failed,
  onRetry,
}: {
  status: string;
  progressPercent?: number;
  failed?: boolean;
  onRetry?: () => void;
}) {
  const t = useT();
  if (failed) {
    return (
      <div className="flex items-center gap-2">
        <Chip tone="bad">{t('engine.error')}</Chip>
        {onRetry && (
          <button type="button" className="btn" onClick={onRetry} style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
            {t('engine.retry')}
          </button>
        )}
      </div>
    );
  }
  if (status === 'ready' || status === 'searching') {
    return <Chip tone="good">{t('engine.ready')}</Chip>;
  }
  return (
    <div className="flex min-w-[8rem] items-center gap-2">
      <Spinner />
      <div className="flex-1">
        <ProgressBar
          percent={progressPercent ?? 4}
          label={progressPercent !== undefined ? t('play.engineLoadingPercent', { percent: progressPercent }) : t('play.engineLoading')}
        />
      </div>
    </div>
  );
}

export function QualityBadge({ quality }: { quality: MoveQuality }) {
  const t = useT();
  const meta = QUALITY_META[quality];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold"
      style={{ background: `color-mix(in oklab, ${meta.color} 22%, transparent)`, color: meta.color }}
    >
      <span aria-hidden>{meta.symbol}</span>
      {t(meta.i18n)}
    </span>
  );
}

export { SegmentedControl };
