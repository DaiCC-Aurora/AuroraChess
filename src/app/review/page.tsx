'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Board } from '@/components/board/Board';
import { MoveList } from '@/components/game/widgets';
import { Chip, Panel, ProgressBar, SegmentedControl, Stat } from '@/components/ui/Primitives';
import { AuroraGame } from '@/lib/chess/game';
import { QUALITY_META } from '@/lib/engine/analysis';
import type { Color, MoveQuality } from '@/lib/chess/types';
import { EngineProvider } from '@/lib/engine/react';
import { useReviewAnalysis } from '@/lib/game/useReviewAnalysis';
import { useSettings } from '@/lib/store/settings';
import { loadJson, saveJson, STORAGE_KEYS } from '@/lib/store/persist';

export default function ReviewPage() {
  return (
    <EngineProvider>
      <ReviewScreen />
    </EngineProvider>
  );
}

function ReviewScreen() {
  const { t, settings } = useSettings();
  const [pgn, setPgn] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<Color>('w');
  const analysis = useReviewAnalysis();

  useEffect(() => {
    const stored = loadJson<{ pgn?: string }>(STORAGE_KEYS.lastGame, {});
    if (stored.pgn) setPgn(stored.pgn);
    setHydrated(true);
  }, []);

  const game = useMemo(() => {
    if (!pgn.trim()) return new AuroraGame();
    try {
      return AuroraGame.fromPgn(pgn);
    } catch {
      return new AuroraGame();
    }
  }, [pgn]);

  const moves = useMemo(() => game.moves, [game]);
  const totalPlies = moves.length;

  const viewGame = useMemo(() => {
    if (!totalPlies) return game;
    const lans = moves.slice(0, Math.max(0, Math.min(ply, totalPlies))).map(m => m.lan);
    try {
      return AuroraGame.fromMoves(lans);
    } catch {
      return game;
    }
  }, [game, moves, ply, totalPlies]);

  const entryByPly = useMemo(() => {
    const map = new Map<number, (typeof analysis.entries)[number]>();
    for (const entry of analysis.entries) map.set(entry.ply, entry);
    return map;
  }, [analysis.entries]);

  const runAnalysis = useCallback(async () => {
    setPly(0);
    await analysis.start(pgn, settings.coachDepth);
    saveJson(STORAGE_KEYS.review, { at: Date.now(), plies: totalPlies });
  }, [analysis, pgn, settings.coachDepth, totalPlies]);

  const currentEntry = entryByPly.get(ply - 1);
  const navigate = (delta: number) => setPly(value => Math.max(0, Math.min(totalPlies, value + delta)));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold">{t('review.title')}</h1>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={() => void runAnalysis()} disabled={!pgn.trim() || analysis.running}>
              {analysis.running ? t('review.analyzing', { percent: analysis.progress }) : t('review.start')}
            </button>
            {analysis.running && (
              <button type="button" className="btn" onClick={analysis.cancel}>
                {t('common.cancel')}
              </button>
            )}
          </div>
        </div>

        {analysis.running && <ProgressBar percent={analysis.progress} />}

        <div className="relative">
          <Board
            pieces={viewGame.pieceMap()}
            orientation={orientation}
            turn={viewGame.turn}
            movableColor={null}
            interactive={false}
            lastMove={(() => {
              const last = viewGame.lastMove;
              return last ? { from: last.from, to: last.to } : null;
            })()}
            checkSquare={viewGame.isCheck() ? viewGame.kingSquare(viewGame.turn) : null}
            marked={currentEntry && currentEntry.quality !== 'best' && currentEntry.quality !== 'book' ? [] : []}
            coordinates={settings.coordinates}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={() => setPly(0)} disabled={!totalPlies}>
              ⏮
            </button>
            <button type="button" className="btn" onClick={() => navigate(-1)} disabled={ply === 0}>
              ◀
            </button>
            <button type="button" className="btn" onClick={() => navigate(1)} disabled={ply >= totalPlies}>
              ▶
            </button>
            <button type="button" className="btn" onClick={() => setPly(totalPlies)} disabled={!totalPlies}>
              ⏭
            </button>
          </div>
          <div className="flex items-center gap-2">
            <SegmentedControl<Color>
              size="sm"
              value={orientation}
              onChange={setOrientation}
              options={[
                { value: 'w', label: t('play.white') },
                { value: 'b', label: t('play.black') },
              ]}
            />
            {currentEntry && (
              <Chip tone={currentEntry.quality === 'blunder' ? 'bad' : currentEntry.quality === 'mistake' ? 'warn' : 'good'}>
                {t(QUALITY_META[currentEntry.quality].i18n)}
              </Chip>
            )}
          </div>
        </div>
      </div>

      <aside className="flex flex-col gap-3">
        {analysis.stats && (
          <Panel title={t('review.accuracy')}>
            <div className="flex flex-wrap gap-4">
              <Stat label={t('play.white')} value={`${analysis.stats.accuracy.w}%`} />
              <Stat label={t('play.black')} value={`${analysis.stats.accuracy.b}%`} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(['blunder', 'mistake', 'inaccuracy', 'best'] as MoveQuality[]).map(quality => (
                <span key={quality} className="text-xs" style={{ color: QUALITY_META[quality].color }}>
                  {QUALITY_META[quality].symbol} {t(QUALITY_META[quality].i18n)}: {analysis.stats!.counts.w[quality]}/{analysis.stats!.counts.b[quality]}
                </span>
              ))}
            </div>
            {analysis.stats.worstPlies.length > 0 ? (
              <div className="mt-3">
                <p className="field-label mb-1">{t('review.jumpTo')}</p>
                <div className="flex flex-wrap gap-1">
                  {analysis.stats.worstPlies.map(worstPly => (
                    <button
                      key={worstPly}
                      type="button"
                      className="btn"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                      onClick={() => setPly(worstPly + 1)}
                    >
                      {moves[worstPly]?.san ?? `#${worstPly + 1}`}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-muted mt-3 text-sm">{t('review.noBadMoves')}</p>
            )}
          </Panel>
        )}

        <Panel
          title={t('play.moveList')}
          actions={
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
              onClick={() => void navigator.clipboard.writeText(pgn).catch(() => undefined)}
            >
              {t('review.export')}
            </button>
          }
        >
          <MoveList
            moves={moves}
            activePly={ply > 0 ? ply - 1 : null}
            onSelect={selectedPly => setPly(selectedPly + 1)}
            maxHeight="16rem"
          />
        </Panel>

        <Panel title={t('review.import')}>
          <textarea
            value={pgn}
            onChange={event => setPgn(event.target.value)}
            placeholder={'1. e4 e5 2. Nf3 Nc6 ...'}
            rows={5}
            className="mono w-full rounded-lg p-2 text-xs"
            style={{ background: 'color-mix(in oklab, var(--text-muted) 10%, transparent)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          />
          {hydrated && !pgn.trim() && <p className="text-muted mt-2 text-xs">{t('review.empty')}</p>}
        </Panel>
      </aside>
    </div>
  );
}
