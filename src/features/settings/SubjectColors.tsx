import { useEffect, useMemo, useState } from 'react';
import { Popover } from 'radix-ui';
import { Check, Link2, Plus, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSettings } from '@/lib/settings';
import { useLectioPage } from '@/lib/lectio/query';
import { PATHS } from '@/lib/lectio/paths';
import { readSchedule } from '@/lib/lectio/readers/schedule.js';
import {
  MAX_SUBJECT_LINKS, SUBJECT_COLOR_CHOICES, choicePreview, customSubjectName, defaultSubjectColor, makeSubjectLink, subjectColor, subjectKey, subjectLinks, withSubjectValue,
} from '@/lib/subjects';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
    const custom = [...Object.keys(choices), ...Object.keys(settings.subjectNames ?? {}), ...Object.keys(settings.subjectLinks ?? {})];
    for (const key of custom) if (!byKey.has(key)) byKey.set(key, `x ${key}`);
    return [...byKey]
      .map(([key, hold]) => ({ key, hold, name: customSubjectName(hold, settings.subjectNames) ?? subjectName(hold) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'da'));
  }, [data, choices, settings.subjectNames, settings.subjectLinks]);

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
          <div className="text-[13.5px] font-medium text-fg">Fag</div>
          <div className="mt-0.5 text-[12.5px] text-fg-muted">Vælg farve, dit eget navn og links (fx Systime eller OneNote) for hvert fag.</div>
        </div>
        {Object.keys(choices).length > 0 && (
          <button type="button" className="shrink-0 text-[12.5px] text-fg-muted hover:text-fg" onClick={() => update({ subjectColors: {} })}>
            Nulstil alle farver
          </button>
        )}
      </div>
      <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {subjects.map((s) => {
          const c = subjectColor(s.hold);
          const chosen = choices[s.key];
          const custom = !!(chosen || settings.subjectNames?.[s.key] || settings.subjectLinks?.[s.key]?.length);
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
                  {custom && <span className="text-[11px] opacity-70">Egen</span>}
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content align="start" sideOffset={6} className="z-50 w-[288px] animate-pop rounded-xl border border-border bg-surface p-3 shadow-pop">
                  <SubjectEditor hold={s.hold} />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Colour, own name and own links for one subject. Used in the settings popover
 * and on a team's page, so both edit the same values.
 */
export function SubjectEditor({ hold, showColors = true }: { hold: string; showColors?: boolean }) {
  const { settings, update } = useSettings();
  const key = subjectKey(hold);
  const chosen = settings.subjectColors?.[key];
  const fallbackName = subjectName(hold);
  const stored = settings.subjectNames?.[key] ?? '';
  const [name, setName] = useState(stored);
  useEffect(() => setName(stored), [stored]);
  const links = subjectLinks(hold, settings.subjectLinks);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const draft = url.trim() ? makeSubjectLink(url, label) : null;

  const setColor = (id: string | null) => update({ subjectColors: withSubjectValue(settings.subjectColors, key, id) });
  const saveName = () => {
    if (name.trim() !== stored) update({ subjectNames: withSubjectValue(settings.subjectNames, key, name.trim() === fallbackName ? '' : name) });
  };
  const setLinks = (next: typeof links) => update({ subjectLinks: withSubjectValue(settings.subjectLinks, key, next) });
  const addLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || links.length >= MAX_SUBJECT_LINKS) return;
    setLinks([...links.filter((l) => l.url !== draft.url), draft]);
    setUrl('');
    setLabel('');
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-[12px] font-medium text-fg-muted">Navn</span>
        <Input
          value={name}
          placeholder={fallbackName}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          className="h-8 text-[13px]"
        />
      </label>

      {showColors && (
        <div>
          <span className="mb-1.5 block text-[12px] font-medium text-fg-muted">Farve</span>
          <div className="grid grid-cols-7 gap-1.5">
            {SUBJECT_COLOR_CHOICES.map((o) => (
              <Swatch key={o.id} color={choicePreview(o.id)} label={o.label} selected={chosen === o.id} onClick={() => setColor(o.id)} />
            ))}
          </div>
          <button
            type="button"
            disabled={!chosen}
            onClick={() => setColor(null)}
            className="mt-2 flex items-center gap-1.5 text-[12.5px] text-fg-muted hover:text-fg disabled:opacity-40 disabled:hover:text-fg-muted"
          >
            <RotateCcw className="size-3" />
            Automatisk farve
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: defaultSubjectColor(hold).bar }} />
          </button>
        </div>
      )}

      <div>
        <span className="mb-1 block text-[12px] font-medium text-fg-muted">Links</span>
        {links.length > 0 && (
          <ul className="mb-2 space-y-1">
            {links.map((l) => (
              <li key={l.url} className="flex items-center gap-2 rounded-md bg-surface-2 py-1 pr-1 pl-2 text-[12.5px]">
                <Link2 className="size-3.5 shrink-0 text-fg-subtle" />
                <a href={l.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-fg hover:text-accent" title={l.url}>
                  {l.label}
                </a>
                <button
                  type="button"
                  aria-label={`Fjern ${l.label}`}
                  onClick={() => setLinks(links.filter((x) => x.url !== l.url))}
                  className="flex size-6 items-center justify-center rounded text-fg-subtle hover:bg-surface-3 hover:text-fg"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {links.length < MAX_SUBJECT_LINKS ? (
          <form onSubmit={addLink} className="space-y-1.5">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Adresse, fx systime.dk/…" aria-label="Linkets adresse" className="h-8 text-[13px]" />
            <div className="flex gap-1.5">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={draft ? draft.label : 'Navn (valgfrit)'}
                aria-label="Linkets navn"
                maxLength={40}
                className="h-8 min-w-0 flex-1 text-[13px]"
              />
              <Button type="submit" size="sm" disabled={!draft} className="h-8">
                <Plus /> Tilføj
              </Button>
            </div>
            {url.trim() && !draft && <p className="text-[12px] text-danger">Det ligner ikke en webadresse.</p>}
          </form>
        ) : (
          <p className="text-[12px] text-fg-subtle">Højst {MAX_SUBJECT_LINKS} links pr. fag.</p>
        )}
      </div>
    </div>
  );
}
