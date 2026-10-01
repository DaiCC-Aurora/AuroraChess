'use client';

import { QUALITY_META } from '@/lib/engine/analysis';
import type { PieceSymbol } from '@/lib/chess/types';
import type { Finding } from '@/lib/coach/findings';
import type { CoachVerdict } from '@/lib/game/useGameController';
import { useSettings } from '@/lib/store/settings';
import type { Translate } from '@/lib/i18n';
import { Chip, Panel } from '@/components/ui/Primitives';
import { QualityBadge } from './widgets';

/** Turns a language-agnostic finding into a readable sentence. */
export function renderFinding(finding: Finding, t: Translate): string {
  const params: Record<string, string | number> = { ...finding.params };
  if (typeof params.piece === 'string') params.piece = t(`piece.${params.piece as PieceSymbol}`);
  if (params.square) params.square = String(params.square).toUpperCase();
  return t(finding.i18n, params);
}

const SEVERITY_TONE: Record<Finding['severity'], 'bad' | 'warn' | 'good' | 'default'> = {
  critical: 'bad',
  warn: 'warn',
  good: 'good',
  info: 'default',
};

export function FindingsList({ findings, limit = 4 }: { findings: Finding[]; limit?: number }) {
  const { t } = useSettings();
  if (!findings.length) return null;
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {findings.slice(0, limit).map((finding, index) => (
        <li key={`${finding.kind}-${index}`} className="flex items-start gap-2">
          <span aria-hidden style={{ color: finding.severity === 'critical' ? '#f87171' : finding.severity === 'warn' ? '#fbbf24' : finding.severity === 'good' ? '#4ade80' : 'var(--text-muted)' }}>
            {finding.severity === 'critical' ? '⚠' : finding.severity === 'good' ? '★' : '•'}
          </span>
          <span>{renderFinding(finding, t)}</span>
        </li>
      ))}
    </ul>
  );
}

export function CoachPanel({
  verdict,
  findings,
  threats,
  hint,
  onRetry,
  onDismiss,
  onShowBest,
  onHint,
  thinking,
  engineReady,
  compact = false,
}: {
  verdict: CoachVerdict | null;
  findings: Finding[];
  threats: Finding[];
  hint: { san: string; pv: string[] } | null;
  onRetry: () => void;
  onDismiss: () => void;
  onShowBest: () => void;
  onHint: () => void;
  thinking: boolean;
  engineReady: boolean;
  compact?: boolean;
}) {
  const { t, settings } = useSettings();

  return (
    <div className="flex flex-col gap-3">
      {verdict && (
        <Panel
          strong
          className="animate-rise"
          title={
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{t('coach.youPlayed', { move: verdict.san })}</span>
              <QualityBadge quality={verdict.quality} />
            </div>
          }
        >
          <div className="flex flex-col gap-2 text-sm">
            {verdict.quality === 'best' || verdict.quality === 'book' ? (
              <p>{t('coach.wasBest')}</p>
            ) : (
              <>
                {verdict.bestSan && (
                  <p>
                    {t('coach.bestWas', { move: verdict.bestSan })}{' '}
                    {verdict.bestPv.length > 1 && (
                      <span className="text-muted mono">{verdict.bestPv.slice(1, 5).join(' ')}</span>
                    )}
                  </p>
                )}
                {verdict.lossCp > 0 && (
                  <p className="text-muted">{t('coach.lossPawns', { pawns: (verdict.lossCp / 100).toFixed(2) })}</p>
                )}
              </>
            )}

            {verdict.findings.length > 0 && (
              <div className="mt-1">
                <p className="field-label mb-1">{t('coach.why')}</p>
                <FindingsList findings={verdict.findings} limit={3} />
              </div>
            )}

            {verdict.interrupted && (
              <div className="mt-2 flex flex-wrap gap-2">
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
          </div>
        </Panel>
      )}

      {!verdict && (
        <Panel
          title={t('coach.title')}
          actions={<Chip tone={engineReady ? 'good' : 'warn'}>{engineReady ? t('engine.ready') : t('engine.loading')}</Chip>}
        >
          <p className="text-muted text-sm">{t('coach.desc')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={onHint} disabled={!engineReady || thinking}>
              {t('coach.hint')}
            </button>
          </div>
          {hint && (
            <div className="mt-3 text-sm">
              <p className="field-label mb-1">{t('play.hint')}</p>
              <p>
                <span className="mono font-semibold" style={{ color: 'var(--accent)' }}>
                  {hint.san}
                </span>{' '}
                <span className="text-muted mono">{hint.pv.slice(1, 5).join(' ')}</span>
              </p>
            </div>
          )}
        </Panel>
      )}

      {!compact && (
        <Panel title={settings.locale === 'zh' ? '局面提示' : 'Position notes'}>
          <FindingsList findings={[...threats, ...findings]} limit={5} />
          {!findings.length && !threats.length && (
            <p className="text-muted text-sm">{settings.locale === 'zh' ? '暂时没有明显问题，继续保持。' : 'No obvious problems right now.'}</p>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn" onClick={onHint} disabled={!engineReady || thinking}>
              {t('coach.hint')}
            </button>
          </div>
        </Panel>
      )}
    </div>
  );
}

/** Colour swatch used by the material summary in the play sidebar. */
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
