// The overview's personal cards: "I aften", pinned countdowns and the "Tilpas" panel.
import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowDown, ArrowUp, ClipboardList, Hourglass, Moon, Plus, RotateCcw, X } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { dayDiff, fmtTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { CheckButton } from '@/features/homework/parts';
import { dateKey, parseDateKey } from '@/features/homework/todo-model';
import { SmartLink } from './SmartLink';
import { subjectName } from './model';
import { countdownText, SECTIONS, targetLabel, tonightTarget, type Column, type Countdown, type HomeLayout, type SectionId, type TonightItem } from './overview';

export function TonightCard({ items, now, onToggle }: { items: TonightItem[]; now: Date; onToggle: (item: TonightItem) => void }) {
  if (!items.length) return null;
  const open = items.filter((i) => !i.done).length;
  const label = targetLabel(tonightTarget(now), now);
  return (
    <Card>
      <CardHeader
        icon={<Moon />}
        title="I aften"
        description={open ? `${open} tilbage til ${label}` : `Klar til ${label}`}
        action={<Link to="/homework" className="rounded-md px-1.5 py-0.5 text-[12.5px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg">Lektier</Link>}
      />
      <CardBody className="px-2 pb-2">
        <ul>
          {items.map((item, i) => (
            <li key={(item.key ?? item.href ?? '') + i} className={cn('flex items-center gap-3 rounded-lg px-3 py-2', item.done && 'opacity-60')}>
              {item.kind === 'assignment' ? (
                <ClipboardList className="size-[18px] shrink-0 text-fg-subtle" aria-label="Opgave" />
              ) : (
                <CheckButton checked={item.done} onChange={() => onToggle(item)} label={item.title} />
              )}
              <SmartLink href={item.href} className="min-w-0 flex-1">
                <span className={cn('block truncate text-[13.5px] text-fg', item.done && 'line-through')} title={item.title}>{item.title}</span>
              </SmartLink>
              <span className="shrink-0 text-[12px] text-fg-subtle tabular-nums">
                {item.kind === 'assignment' && item.due ? `Afl. ${fmtTime(item.due)}` : item.context ? subjectName(item.context) : item.kind === 'todo' ? 'To-do' : ''}
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

/** Title + date; used on the countdown card and in the Tilpas panel. */
export function CountdownForm({ onAdd, onClose }: { onAdd: (c: Omit<Countdown, 'id'>) => void; onClose?: () => void }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const valid = title.trim() && date && date >= dateKey(new Date());
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onKeyDown={(e) => e.key === 'Escape' && onClose?.()}
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onAdd({ title, at: parseDateKey(date).getTime() });
        setTitle('');
        setDate('');
        onClose?.();
      }}
    >
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fx Terminsprøve i matematik" aria-label="Titel" className="h-8 min-w-0 flex-1 basis-48" maxLength={60} />
      <Input type="date" value={date} min={dateKey(new Date())} onChange={(e) => setDate(e.target.value)} aria-label="Dato" className="h-8 w-auto" />
      <Button type="submit" size="sm" variant="primary" disabled={!valid}>Tilføj</Button>
      {onClose && <Button size="icon-sm" variant="ghost" aria-label="Luk" onClick={onClose}><X /></Button>}
    </form>
  );
}

/** One slim row of chips: "SOP · 21 dage". Hidden when nothing is pinned. */
export function CountdownsCard({ countdowns, now, onAdd, onRemove }: { countdowns: Countdown[]; now: Date; onAdd: (c: Omit<Countdown, 'id'>) => void; onRemove: (id: string) => void }) {
  const [adding, setAdding] = useState(false);
  if (!countdowns.length) return null;
  return (
    <Card className="px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Hourglass className="mr-1 ml-1 size-4 text-fg-subtle" aria-label="Nedtællinger" />
        {countdowns.map((c) => {
          const at = new Date(c.at);
          const soon = dayDiff(at, now) <= 1;
          return (
            <span key={c.id} className="group inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-2 pr-1 pl-3 text-[12.5px]" title={at.toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' })}>
              <SmartLink href={c.href} className="max-w-48 truncate font-medium text-fg">{c.title}</SmartLink>
              <span className={cn('tabular-nums', soon ? 'font-medium text-accent-soft-fg' : 'text-fg-muted')}>· {countdownText(at, now)}</span>
              <button type="button" aria-label={`Fjern ${c.title}`} onClick={() => onRemove(c.id)} className="flex size-5 items-center justify-center rounded-full text-fg-subtle opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-surface-3 hover:text-fg focus-visible:opacity-100">
                <X className="size-3" />
              </button>
            </span>
          );
        })}
        {!adding && (
          <Button size="icon-sm" variant="ghost" aria-label="Tilføj nedtælling" title="Tilføj nedtælling" onClick={() => setAdding(true)}>
            <Plus />
          </Button>
        )}
      </div>
      {adding && <div className="mt-2.5 border-t border-border pt-2.5"><CountdownForm onAdd={onAdd} onClose={() => setAdding(false)} /></div>}
    </Card>
  );
}

const COLUMN_LABEL: Record<Column, string> = { hero: 'Øverst', main: 'Hovedkolonne', side: 'Sidekolonne' };

export function CustomizePanel({
  layout, isDefault, onMove, onToggle, onReset, onDone, onAddCountdown,
}: {
  layout: HomeLayout;
  isDefault: boolean;
  onMove: (id: SectionId, dir: -1 | 1) => void;
  onToggle: (id: SectionId) => void;
  onReset: () => void;
  onDone: () => void;
  onAddCountdown: (c: Omit<Countdown, 'id'>) => void;
}) {
  const columns: Column[] = ['hero', 'main', 'side'];
  return (
    <Card className="mb-5 animate-in">
      <CardHeader
        title="Tilpas overblikket"
        description="Vælg hvilke kort der vises, og i hvilken rækkefølge. Kort uden indhold skjules af sig selv."
        action={
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={onReset} disabled={isDefault}><RotateCcw /> Nulstil</Button>
            <Button size="sm" variant="primary" onClick={onDone}>Færdig</Button>
          </div>
        }
      />
      <CardBody className="grid gap-5 sm:grid-cols-2">
        {columns.map((column) => {
          const ids = layout.order.filter((id) => SECTIONS[id].column === column);
          return (
            <div key={column} className={cn(column === 'hero' && 'sm:col-span-2')}>
              <div className="mb-1 px-1 text-[11.5px] font-semibold tracking-wide text-fg-subtle uppercase">{COLUMN_LABEL[column]}</div>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {ids.map((id, i) => {
                  const hidden = layout.hidden.includes(id);
                  return (
                    <li key={id} className="flex items-center gap-2 py-1.5 pr-2 pl-3">
                      <span className={cn('min-w-0 flex-1 truncate text-[13.5px]', hidden ? 'text-fg-subtle' : 'text-fg')}>{SECTIONS[id].label}</span>
                      {ids.length > 1 && (
                        <>
                          <Button size="icon-sm" variant="ghost" aria-label={`Flyt ${SECTIONS[id].label} op`} disabled={i === 0} onClick={() => onMove(id, -1)}><ArrowUp /></Button>
                          <Button size="icon-sm" variant="ghost" aria-label={`Flyt ${SECTIONS[id].label} ned`} disabled={i === ids.length - 1} onClick={() => onMove(id, 1)}><ArrowDown /></Button>
                        </>
                      )}
                      <Switch label={`Vis ${SECTIONS[id].label}`} checked={!hidden} onChange={() => onToggle(id)} className="ml-1" />
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        <div className="sm:col-span-2">
          <div className="mb-1.5 px-1 text-[11.5px] font-semibold tracking-wide text-fg-subtle uppercase">Ny nedtælling</div>
          <CountdownForm onAdd={onAddCountdown} />
          <p className="mt-1.5 px-1 text-[12px] text-fg-muted">Fx eksamen, terminsprøve eller SOP. Vises som “SOP · 21 dage” øverst på overblikket.</p>
        </div>
      </CardBody>
    </Card>
  );
}
