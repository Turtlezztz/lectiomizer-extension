// Toolbar popup: a glance at the current/next lesson and what's new, read from
// the snapshot the background stores after each check (never reads Lectio).
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, LogIn } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { fmtTime } from '@/lib/format';
import { useSettings } from '@/lib/settings';
import { getItem, onItemChange } from '@/lib/storage';
import { subjectColor } from '@/lib/subjects';
import { send } from '@/lib/sync/hooks';
import { HISTORY_KEY, type History } from '@/lib/sync/store';
import { checkedText, lessonName, popupView, whenText, type NextLesson } from './model';

/** Opens (or focuses) the app tab the same way the toolbar button does, then closes the popup. */
async function open(route = '') {
  await send({ type: 'open-app', route }).catch(() => {});
  window.close();
}

function useHistory(): History | null {
  const [history, setHistory] = useState<History | null>(null);
  useEffect(() => {
    getItem<History>(HISTORY_KEY, { accounts: {} }).then(setHistory);
    return onItemChange<History>(HISTORY_KEY, (h) => setHistory(h ?? { accounts: {} }));
  }, []);
  return history;
}

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function Popup() {
  const { settings, ready } = useSettings();
  const history = useHistory();
  const now = useNow();

  // Not set up: the background doesn't attach the popup then, but if it shows anyway, go to onboarding.
  useEffect(() => {
    if (ready && !settings.school) open();
  }, [ready, settings.school]);

  if (!ready || !history || !settings.school) return <div className="h-40 w-[320px]" />;
  const view = popupView(history, now);

  return (
    <div className="flex w-[320px] flex-col gap-3 bg-bg p-4">
      <header className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-semibold tracking-[-0.02em]">Lectiomizer</span>
        <span className="truncate text-[12px] text-fg-subtle tabular-nums">{checkedText(view.checkedAt, now)}</span>
      </header>

      {view.state === 'login' && (
        <button type="button" onClick={() => open()} className="flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-left text-[13px] text-warning-soft-fg hover:brightness-[0.98]">
          <LogIn className="size-4 shrink-0" />
          <span>Du er ikke logget ind på Lectio. Åbn Lectiomizer for at logge ind.</span>
        </button>
      )}

      {view.state === 'empty' ? (
        <p className="rounded-lg border border-border bg-surface px-3 py-3 text-[13px] text-fg-muted">
          Intet hentet fra Lectio endnu. Åbn Lectiomizer, så hentes dit skema og dine beskeder.
        </p>
      ) : (
        <>
          <LessonCard next={view.next} now={now} />
          <div className="grid grid-cols-3 gap-2">
            <Count value={view.counts.messages} label="Beskeder" title="Nye beskeder" onClick={() => open('/messages')} />
            <Count value={view.counts.assignments} label="Opgaver" title="Nye opgaver" onClick={() => open('/assignments')} />
            <Count value={view.counts.changes} label="Ændringer" title="Ændringer i skemaet" onClick={() => open('/?notifications=1')} />
          </div>
        </>
      )}

      <Button variant="primary" className="w-full" onClick={() => open()}>
        Åbn Lectiomizer <ArrowRight />
      </Button>
    </div>
  );
}

function LessonCard({ next, now }: { next: NextLesson | null; now: Date }) {
  if (!next) return <Tile className="text-[13px] text-fg-muted">Ingen kommende moduler i skemaet.</Tile>;
  const { lesson } = next;
  const color = subjectColor(lesson.holds?.[0] || lesson.title);
  const meta = [`${fmtTime(next.start)}–${fmtTime(next.end)}`, lesson.rooms?.join(', ')].filter(Boolean).join(' · ');
  return (
    <Tile onClick={() => open(next.route || '/schedule')} className="relative overflow-hidden pl-4">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: color.bar }} />
      <div className="flex items-center gap-2 text-[12px] text-fg-muted">
        <span className={cn('font-medium', next.live ? 'text-accent' : 'text-fg-muted')}>{next.live ? 'Nu' : 'Næste'}</span>
        <span className="tabular-nums">{whenText(next, now)}</span>
        {lesson.status === 'changed' && <Badge tone="warning">Ændret</Badge>}
      </div>
      <div className="mt-0.5 truncate text-[15px] font-semibold text-fg">{lessonName(lesson)}</div>
      <div className="truncate text-[12.5px] text-fg-muted tabular-nums">{meta}</div>
    </Tile>
  );
}

function Count({ value, label, title, onClick }: { value: number; label: string; title: string; onClick: () => void }) {
  return (
    <Tile onClick={onClick} title={`${title}: ${value}`} className="px-2.5 py-2">
      <div className={cn('text-[18px] font-semibold tabular-nums', value ? 'text-accent' : 'text-fg-subtle')}>{value}</div>
      <div className="truncate text-[11.5px] text-fg-muted">{label}</div>
    </Tile>
  );
}

function Tile({ onClick, title, className, children }: { onClick?: () => void; title?: string; className?: string; children: ReactNode }) {
  const base = 'block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-left';
  if (!onClick) return <div className={cn(base, className)}>{children}</div>;
  return (
    <button type="button" onClick={onClick} title={title} className={cn(base, 'transition-colors hover:border-border-strong hover:bg-surface-2', className)}>
      {children}
    </button>
  );
}
