'use client';

import { EngineProvider } from '@/lib/engine/react';
import { WatchScreen } from '@/components/watch/WatchScreen';
import { useT } from '@/lib/store/settings';

export default function WatchPage() {
  const t = useT();
  return (
    <EngineProvider>
      <div className="flex min-h-[80vh] flex-col items-center justify-center gap-2">
        <p className="text-muted text-xs">{t('watch.tapHint')}</p>
        <WatchScreen />
      </div>
    </EngineProvider>
  );
}
