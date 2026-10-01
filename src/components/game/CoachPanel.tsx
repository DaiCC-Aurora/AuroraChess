'use client';

import { QUALITY_META } from '@/lib/engine/analysis';
import type { CoachVerdict } from '@/lib/game/useGameController';
import { useSettings } from '@/lib/store/settings';
import { Chip, Panel } from '@/components/ui/Primitives';
import { QualityBadge } from './widgets';

/**
 * Coach panel: the move grade and the two actions that matter.
 *
 * The explanatory prose that used to live here (reasons, centipawn loss,
 * recommended continuation) has been removed — the panel only rates the move
 * and lets the player take it back when the grade is bad enough to interrupt.
 */
export function CoachPanel({
  verdict,
  hint,
  onRetry,
  onDismiss,
  onShowBest,
  onHint,
  thinking,
  engineReady,
}: {
  verdict: CoachVerdict | null;
  hint: { san: string; pv: string[] } | null;
  onRetry: () => void;
  onDismiss: () => void;
  onShowBest: () => void;
  onHint: () => void;
  thinking: boolean;
  engineReady: boolean;
}) {
  const { t } = useSettings();

  return (
    <Panel
      title={t('coach.title')}
      actions={<Chip tone={engineReady ? 'good' : 'warn'}>{engineReady ? t('engine.ready') : t('engine.loading')}</Chip>}
    >
      <div className="flex flex-wrap items-center gap-2">
        {verdict ? (
          <div data-testid="coach-verdict" className="flex flex-wrap items-center gap-2">
            <span className="mono text-sm font-semibold">{verdict.san}</span>
            <QualityBadge quality={verdict.quality} />
          </div>
        ) : (
          <span className="text-muted text-sm">{t('coach.awaitingMove')}</span>
        )}
      </div>

      {verdict?.interrupted && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            {t('coach.undoAndRetry')}
          </button>
          <button type="button" className="btn" onClick={onShowBest}>
            {t('coach.showBest')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onDismiss}>
            {t('coach.ignore')}
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn" onClick={onHint} disabled={!engineReady || thinking}>
          {t('coach.hint')}
        </button>
        {hint && (
          <span className="mono text-sm font-semibold" style={{ color: 'var(--accent)' }}>
            {hint.san}
          </span>
        )}
      </div>
    </Panel>
  );
}

/** Small colour swatch used by the clock row. */
export function ColourSwatch({ color }: { color: 'w' | 'b' }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: '0.75rem',
        height: '0.75rem',
        borderRadius: '3px',
        background: color === 'w' ? '#f8fafc' : '#1f2937',
        border: '1px solid var(--border-subtle)',
      }}
    />
  );
}
