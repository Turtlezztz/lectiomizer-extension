import { useMemo } from 'react';
import { Popover } from 'radix-ui';
import { Check, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSettings } from '@/lib/settings';
import { useLectioPage } from '@/lib/lectio/query';
import { PATHS } from '@/lib/lectio/paths';
import { readSchedule } from '@/lib/lectio/readers/schedule.js';
import { SUBJECT_COLOR_CHOICES, choicePreview, defaultSubjectColor, subjectColor, subjectKey } from '@/lib/subjects';
import { subjectName, toLessons, type RawLesson } from '@/features/schedule/lessons';
import { Skeleton } from '@/components/ui/skeleton';

const read = readSchedule as (doc: Document) => RawLesson[];

function Swatch({ color, selected, label, onClick }: { color: { bg: string; bar: string }; selected?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className={cn('flex size-7 items-center justify-center rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-accent', selected ? 'border-fg' : 'border-transparent')}
      style={{ background: color.bar }}
    >
      {selected && <Check className="size-3.5 text-white" strokeWidth={3} />}
    </button>
  );
}

/** Pick your own colour per subject. Subjects come from this week's schedule plus any already customised. */
export function SubjectColorSettings() {
  const { settings, update } = useSettings();
  const choices = settings.subjectColors ?? {};
  const { data, isPending } = useLectioPage(PATHS.schedule, read);

  const subjects = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const l of toLessons(data?.data)) {
      const hold = l.hold || l.title;
      const key = subjectKey(hold);
      if (key && !byKey.has(key)) byKey.set(key, hold);
    }
    // Keep subjects you customised even if they're not on this week's schedule.
    for (const key of Object.keys(choices)) if (!byKey.has(key)) byKey.set(key, `x ${key}`);
    return [...byKey].map(([key, hold]) => ({ key, hold, name: subjectName(hold) })).sort((a, b) => a.name.localeCompare(b.name, 'da'));
  }, [data, choices]);

  const set = (key: string, id: string | null) => {
    const next = { ...choices };
    if (id) next[key] = id;
    else delete next[key];
    update({ subjectColors: next });
  };

  if (isPending && !subjects.length)
    return (
      <div className="space-y-2 px-5 py-4">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-6 w-1/3" />
      </div>
    );
  if (!subjects.length) return <div className="px-5 py-3.5 text-[12.5px] text-fg-muted">Ingen fag fundet i denne uges skema.</div>;

  return (
    <div className="px-5 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[13.5px] font-medium text-fg">Farver på fag</div>
          <div className="mt-0.5 text-[12.5px] text-fg-muted">Vælg selv farven på hvert fag i skemaet og resten af appen.</div>
        </div>
        {Object.keys(choices).length > 0 && (
          <button type="button" className="shrink-0 text-[12.5px] text-fg-muted hover:text-fg" onClick={() => update({ subjectColors: {} })}>
            Nulstil alle
          </button>
        )}
      </div>
      <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {subjects.map((s) => {
          const c = subjectColor(s.hold);
          const chosen = choices[s.key];
          return (
            <Popover.Root key={s.key}>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium transition-[filter] hover:brightness-95"
                  style={{ background: c.bg, color: c.fg }}
                >
                  <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: c.bar }} />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {chosen && <span className="text-[11px] opacity-70">Egen</span>}
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content align="start" sideOffset={6} className="z-50 w-[248px] animate-pop rounded-xl border border-border bg-surface p-3 shadow-pop">
                  <div className="mb-2 text-[12.5px] font-medium text-fg">{s.name}</div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {SUBJECT_COLOR_CHOICES.map((o) => (
                      <Swatch key={o.id} color={choicePreview(o.id)} label={o.label} selected={chosen === o.id} onClick={() => set(s.key, o.id)} />
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={!chosen}
                    onClick={() => set(s.key, null)}
                    className="mt-3 flex items-center gap-1.5 text-[12.5px] text-fg-muted hover:text-fg disabled:opacity-40 disabled:hover:text-fg-muted"
                  >
                    <RotateCcw className="size-3" />
                    Automatisk farve
                    <span aria-hidden className="size-2.5 rounded-full" style={{ background: defaultSubjectColor(s.hold).bar }} />
                  </button>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          );
        })}
      </div>
    </div>
  );
}
