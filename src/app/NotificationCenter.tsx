import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Dialog } from 'radix-ui';
import { AlarmClock, ArrowRight, Bell, BellOff, BookOpen, CalendarClock, CalendarPlus, CalendarX2, CheckCheck, ClipboardList, DoorOpen, GraduationCap, LogIn, Mail, RefreshCw, Settings, Sunrise, UserX, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { appRoute } from '@/lib/lectio/paths';
import { fmtTime, relativeDay } from '@/lib/format';
import { send, useNotices } from '@/lib/sync/hooks';
import { noticeBody, noticeChanges, noticeTitle } from '@/lib/sync/notice';
import type { Notice, NoticeKind } from '@/lib/sync/store';

const KIND: Record<NoticeKind, { icon: typeof Bell; tone: string; label: string }> = {
  changed: { icon: CalendarClock, tone: 'bg-warning-soft text-warning-soft-fg', label: 'Ændret' },
  cancelled: { icon: CalendarX2, tone: 'bg-danger-soft text-danger-soft-fg', label: 'Aflyst' },
  removed: { icon: CalendarX2, tone: 'bg-surface-3 text-fg-muted', label: 'Fjernet' },
  restored: { icon: CalendarPlus, tone: 'bg-success-soft text-success-soft-fg', label: 'Tilbage' },
  message: { icon: Mail, tone: 'bg-info-soft text-info-soft-fg', label: 'Besked' },
  assignment: { icon: ClipboardList, tone: 'bg-accent-soft text-accent-soft-fg', label: 'Opgave' },
  room: { icon: DoorOpen, tone: 'bg-warning-soft text-warning-soft-fg', label: 'Lokale' },
  homework: { icon: BookOpen, tone: 'bg-info-soft text-info-soft-fg', label: 'Lektier' },
  deadline: { icon: AlarmClock, tone: 'bg-accent-soft text-accent-soft-fg', label: 'Frist' },
  grade: { icon: GraduationCap, tone: 'bg-success-soft text-success-soft-fg', label: 'Karakter' },
  absence: { icon: UserX, tone: 'bg-surface-3 text-fg-muted', label: 'Fravær' },
  digest: { icon: Sunrise, tone: 'bg-surface-3 text-fg-muted', label: 'Din dag' },
};

function ago(ts?: number) {
  if (!ts) return 'aldrig';
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 1) return 'lige nu';
  if (mins < 60) return `for ${mins} min siden`;
  const d = new Date(ts);
  return `${relativeDay(d)} ${fmtTime(d)}`;
}

function group(notices: Notice[]) {
  const out: Array<[string, Notice[]]> = [];
  for (const n of notices) {
    const label = (() => {
      const r = relativeDay(new Date(n.createdAt));
      return r === 'i dag' ? 'I dag' : r === 'i går' ? 'I går' : 'Tidligere';
    })();
    const last = out.at(-1);
    if (last?.[0] === label) last[1].push(n);
    else out.push([label, [n]]);
  }
  return out;
}

function Item({ notice, onOpen }: { notice: Notice; onOpen: (n: Notice) => void }) {
  const kind = KIND[notice.kind] ?? KIND.changed;
  const Icon = kind.icon;
  const changes = noticeChanges(notice);
  return (
    <button type="button" onClick={() => onOpen(notice)} className="group flex w-full gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface-2">
      <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', kind.tone)}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className={cn('flex-1 text-[13.5px] leading-snug', notice.read ? 'text-fg-muted' : 'font-medium text-fg')}>{noticeTitle(notice)}</span>
          {!notice.read && <span aria-label="Ulæst" className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />}
        </span>
        {noticeBody(notice) && <span className={cn('mt-0.5 block text-[12.5px] text-fg-muted', notice.kind === 'digest' || notice.kind === 'homework' ? 'line-clamp-2' : 'truncate')}>{noticeBody(notice)}</span>}
        {changes.length > 0 && (
          <span className="mt-1.5 block space-y-0.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px] group-hover:bg-surface-3">
            {changes.map((c) => (
              <span key={c.label} className="block">
                <span className="text-fg-subtle">{c.label}: </span>
                {c.before && <span className="text-fg-subtle line-through">{c.before}</span>}
                {c.before && <ArrowRight className="mx-1 inline size-3 text-fg-subtle" />}
                <span className="font-medium text-fg">{c.after}</span>
              </span>
            ))}
          </span>
        )}
        <span className="mt-1 block text-[11.5px] text-fg-subtle">{ago(notice.createdAt)}</span>
      </span>
    </button>
  );
}

export function NotificationBell({ collapsed }: { collapsed?: boolean }) {
  const { notices, unread, account } = useNotices();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.has('notifications'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const status = account.status || {};
  const checking = busy || status.state === 'syncing';

  // A click on the summary system notification opens the app with ?notifications.
  useEffect(() => {
    if (params.has('notifications')) {
      setOpen(true);
      params.delete('notifications');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const checkNow = async () => {
    setBusy(true);
    setError('');
    const r = await send({ type: 'check-now' }).catch((e: Error) => ({ ok: false, message: e.message }));
    if (r && r.ok === false && r.message) setError(r.message);
    setBusy(false);
  };
  const openNotice = (n: Notice) => {
    if (!n.read) send({ type: 'mark-read', ids: [n.id] });
    const route = appRoute(n.item?.href || n.lesson?.href);
    setOpen(false);
    if (route) navigate(route);
    else if (n.item?.href || n.lesson?.href) window.open(n.item?.href || n.lesson?.href || '', '_blank');
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size={collapsed ? 'icon' : 'icon-sm'} aria-label={unread ? `Notifikationer, ${unread} ulæste` : 'Notifikationer'} className="relative">
          <Bell />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg tabular-nums ring-2 ring-bg">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/20 animate-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-[min(420px,100vw)] flex-col border-l border-border bg-surface shadow-pop outline-none data-[state=open]:animate-[slide-in_200ms_cubic-bezier(0.2,0.9,0.3,1)]"
        >
          <style>{'@keyframes slide-in{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}'}</style>
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[16px] font-semibold tracking-[-0.01em]">Notifikationer</Dialog.Title>
              <p className={cn('mt-0.5 truncate text-[12.5px]', status.state === 'error' ? 'text-danger-soft-fg' : 'text-fg-subtle')}>
                {checking ? 'Tjekker Lectio…' : status.state === 'error' ? status.message : status.state === 'paused' ? 'Sat på pause' : `Tjekket ${ago(status.checkedAt)}`}
              </p>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Tjek Lectio nu" title="Tjek Lectio nu" onClick={checkNow} disabled={checking}>
              <RefreshCw className={cn(checking && 'animate-spin')} />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Indstillinger" title="Indstillinger" onClick={() => { setOpen(false); navigate('/settings'); }}>
              <Settings />
            </Button>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Luk">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          {(error || status.login) && (
            <div className="mx-5 mt-4 flex items-start gap-2.5 rounded-xl bg-danger-soft px-3.5 py-3 text-[13px] text-danger-soft-fg">
              <LogIn className="mt-0.5 size-4 shrink-0" />
              <span>{error || 'Din Lectio-session er udløbet. Log ind igen, så tjekker Lectiomizer for nyt i baggrunden.'}</span>
            </div>
          )}
          {(status.state === 'ok' || status.state === 'paused') && status.message && <p className="mx-5 mt-3 text-[12.5px] text-fg-subtle">{status.message}</p>}
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {!notices.length ? (
              <EmptyState
                icon={<BellOff />}
                title="Ingen notifikationer endnu"
                description="Lectiomizer tjekker Lectio i baggrunden og giver besked om ændringer i skemaet, nye beskeder, opgaver, karakterer og mere. Vælg hvad i Indstillinger."
                className="py-16"
              />
            ) : (
              group(notices).map(([label, list]) => (
                <section key={label} className="mb-2">
                  <h3 className="px-3 pt-2 pb-1 text-[11.5px] font-medium tracking-wide text-fg-subtle uppercase">{label}</h3>
                  {list.map((n) => (
                    <Item key={n.id} notice={n} onOpen={openNotice} />
                  ))}
                </section>
              ))
            )}
          </div>
          {unread > 0 && (
            <div className="border-t border-border p-3">
              <Button variant="ghost" className="w-full" onClick={() => send({ type: 'mark-read', ids: 'all' })}>
                <CheckCheck /> Markér alle som læst
              </Button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
