'use client';

import { EngineProvider } from '@/lib/engine/react';
import { GameScreen } from '@/components/game/GameScreen';
import { useT } from '@/lib/store/settings';

export default function CoachPage() {
  const t = useT();
  return (
    <EngineProvider>
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold">{t('coach.title')}</h1>
          <p className="text-muted text-sm">{t('coach.desc')}</p>
        </div>
        <GameScreen mode="coach" />
      </div>
    </EngineProvider>
  );
}
