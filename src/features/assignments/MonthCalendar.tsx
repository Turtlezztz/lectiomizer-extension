// Opgaver as a month calendar: each assignment on the day of its deadline,
// coloured by status. A day with more than fits opens below the grid.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { appRoute } from '@/lib/lectio/paths';
import { fmtLongDate, fmtTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { WEEKDAYS, byDay, dayKey, monthGrid, monthLabel, shiftMonth } from './calendar';
import { groupOf, type AssignmentItem, type Group } from './model';
import { StatusBadge, SubjectDot } from './parts';

const TONE: Record<Group, { chip: string; dot: string; label: string }> = {
  upcoming: { chip: 'bg-info-soft text-info-soft-fg', dot: 'bg-info', label: 'Kommende' },
  missing: { chip: 'bg-danger-soft text-danger-soft-fg', dot: 'bg-danger', label: 'Mangler' },
  delivered: { chip: 'bg-success-soft text-success-soft-fg', dot: 'bg-success', label: 'Afleveret' },
};
const SHOWN = 3;

function ItemLink({ item, className, children }: { item: AssignmentItem; className: string; children: React.ReactNode }) {
  const route = appRoute(item.href);
  if (route) return <Link to={route} className={className}>{children}</Link>;
  if (item.href) return <a href={item.href} target="_blank" rel="noreferrer" className={className}>{children}</a>;
  return <span className={className}>{children}</span>;
}

export function MonthCalendar({ items, now }: { items: AssignmentItem[]; now: Date }) {
  const [shown, setShown] = useState(() => ({ year: now.getFullYear(), month: now.getMonth() }));
  const [selected, setSelected] = useState<string | null>(null);
  const weeks = useMemo(() => monthGrid(shown.year, shown.month), [shown]);
  const days = useMemo(() => byDay(items), [items]);
  const today = dayKey(now);
  const undated = items.filter((a) => !a.deadline).length;
  const selectedItems = selected ? (days.get(selected) ?? []) : [];
  const go = (delta: number) => {
    setShown((s) => shiftMonth(s, delta));
    setSelected(null);
  };

  return (
    <div className="space-y-3 animate-in">
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 text-[15px] font-semibold text-fg first-letter:uppercase">{monthLabel(shown.year, shown.month)}</h2>
        <div className="hidden items-center gap-3 text-[12px] text-fg-subtle md:flex" aria-hidden>
          {(Object.keys(TONE) as Group[]).map((g) => (
            <span key={g} className="inline-flex items-center gap-1.5">
              <span className={cn('size-1.5 rounded-full', TONE[g].dot)} />
              {TONE[g].label}
            </span>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setShown({ year: now.getFullYear(), month: now.getMonth() });
            setSelected(today);
          }}
        >
          I dag
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Forrige måned" onClick={() => go(-1)}>
          <ChevronLeft />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Næste måned" onClick={() => go(1)}>
          <ChevronRight />
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-surface-2/60 text-[11.5px] font-medium text-fg-subtle" aria-hidden>
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-1.5">
              {d}
            </div>
          ))}
        </div>
        <div role="grid" aria-label={`Afleveringer i ${monthLabel(shown.year, shown.month)}`}>
          {weeks.map((week, w) => (
            <div key={w} role="row" className="grid grid-cols-7 border-b border-border last:border-b-0">
              {week.map((cell) => {
                const list = days.get(cell.key) ?? [];
                const isToday = cell.key === today;
                const isSelected = cell.key === selected;
                const extra = list.length - SHOWN;
                return (
                  <div
                    key={cell.key}
                    role="gridcell"
                    aria-selected={isSelected}
                    className={cn(
                      'relative min-h-14 border-r border-border p-1 last:border-r-0 sm:min-h-[96px] sm:p-1.5',
                      !cell.inMonth && 'bg-surface-2/40',
                      isSelected && 'bg-accent-soft/40',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(isSelected ? null : cell.key)}
                      aria-label={`${fmtLongDate(cell.date)}: ${list.length ? `${list.length} ${list.length === 1 ? 'aflevering' : 'afleveringer'}` : 'ingen afleveringer'}`}
                      className="absolute inset-0 rounded-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                    />
                    <span
                      className={cn(
                        'pointer-events-none relative inline-flex size-6 items-center justify-center rounded-full text-[12px] tabular-nums',
                        isToday ? 'bg-accent font-semibold text-accent-fg' : cell.inMonth ? 'text-fg-muted' : 'text-fg-subtle/70',
                      )}
                    >
                      {cell.date.getDate()}
                    </span>
                    {/* Phones: one dot per assignment; the day opens below. */}
                    {list.length > 0 && (
                      <div className="pointer-events-none relative mt-0.5 flex flex-wrap gap-0.5 px-0.5 sm:hidden">
                        {list.slice(0, 4).map((a, i) => (
                          <span key={i} className={cn('size-1.5 rounded-full', TONE[groupOf(a, now)].dot)} />
                        ))}
                      </div>
                    )}
                    <ul className="pointer-events-none relative mt-1 hidden space-y-0.5 sm:block">
                      {list.slice(0, extra > 0 ? SHOWN - 1 : SHOWN).map((a, i) => (
                        <li key={(a.href || a.title) + i}>
                          <ItemLink
                            item={a}
                            className={cn(
                              'pointer-events-auto block truncate rounded px-1.5 py-0.5 text-[11.5px] leading-tight font-medium transition-[filter] hover:brightness-95',
                              TONE[groupOf(a, now)].chip,
                            )}
                          >
                            <span title={`${a.title} · ${a.hold} · ${fmtTime(a.deadline!)}`}>{a.title || 'Uden titel'}</span>
                          </ItemLink>
                        </li>
                      ))}
                      {extra > 0 && (
                        <li className="px-1.5 text-[11.5px] font-medium text-fg-muted">+{extra + 1} mere</li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Card>

      {selected && (
        <Card className="overflow-hidden animate-in">
          <h3 className="border-b border-border px-4 py-2.5 text-[13px] font-semibold text-fg first-letter:uppercase sm:px-5">
            {fmtLongDate(new Date(`${selected}T12:00:00`))}
          </h3>
          {selectedItems.length ? (
            <ul className="divide-y divide-border">
              {selectedItems.map((a, i) => {
                const group = groupOf(a, now);
                return (
                  <li key={(a.href || a.title) + i}>
                    <ItemLink item={a} className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2 sm:px-5">
                      <SubjectDot hold={a.hold} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-fg group-hover:text-accent-soft-fg">{a.title || 'Uden titel'}</span>
                        <span className="block truncate text-[12.5px] text-fg-muted">
                          {a.hold} · {fmtTime(a.deadline!)}
                        </span>
                      </span>
                      <StatusBadge kind={a.statusKind} label={a.status} overdue={group === 'missing'} />
                    </ItemLink>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-3 text-[13px] text-fg-muted sm:px-5">Ingen afleveringer denne dag.</p>
          )}
        </Card>
      )}

      {undated > 0 && (
        <p className="px-1 text-[12.5px] text-fg-subtle">
          {undated} {undated === 1 ? 'opgave' : 'opgaver'} uden frist vises kun i listen.
        </p>
      )}
    </div>
  );
}
