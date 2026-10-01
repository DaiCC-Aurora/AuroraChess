'use client';

import { EngineProvider } from '@/lib/engine/react';
import { GameScreen } from '@/components/game/GameScreen';
import { useT } from '@/lib/store/settings';

export default function PlayPage() {
  const t = useT();
  return (
    <EngineProvider>
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold">{t('play.title')}</h1>
        <GameScreen mode="play" />
      </div>
    </EngineProvider>
  );
}
