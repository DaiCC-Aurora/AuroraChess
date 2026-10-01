'use client';

import Link from 'next/link';
import { EngineProvider } from '@/lib/engine/react';
import { WatchScreen } from '@/components/watch/WatchScreen';
import { useIsWatch } from '@/lib/hooks/useIsWatch';
import { useT } from '@/lib/store/settings';

export default function WatchPage() {
  return (
    <EngineProvider>
      <WatchContent />
    </EngineProvider>
  );
}

function WatchContent() {
  const t = useT();
  const isWatchViewport = useIsWatch();

  // On a real watch viewport every pixel counts: the screen renders alone.
  if (isWatchViewport) return <WatchScreen />;

  // Opened on a normal screen (desktop/laptop): keep an escape hatch.
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-3">
      <p className="text-muted text-xs">{t('watch.tapHint')}</p>
      <WatchScreen />
      <Link href="/" className="btn no-underline" style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem' }}>
        {t('common.back')}
      </Link>
    </div>
  );
}
