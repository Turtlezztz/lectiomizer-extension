import { WifiOff } from 'lucide-react';
import { useOfflineSince } from '@/lib/lectio/query';
import { fmtTime, relativeDay } from '@/lib/format';

/** Shown while a page on screen is a saved copy because Lectio can't be reached. */
export function OfflineBanner() {
  const since = useOfflineSince();
  if (since === null) return null;
  const at = new Date(since);
  return (
    <div role="status" className="border-b border-border bg-surface-2 text-fg-muted">
      <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-4 py-1.5 text-[12.5px] md:px-8">
        <WifiOff className="size-3.5 shrink-0" />
        <p className="min-w-0 flex-1 truncate">
          <span className="font-medium text-fg">Offline – viser gemt data fra {relativeDay(at)} kl. {fmtTime(at)}.</span>{' '}
          <span>Handlinger virker ikke, før Lectio svarer igen.</span>
        </p>
      </div>
    </div>
  );
}
