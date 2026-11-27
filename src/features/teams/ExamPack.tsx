// "Download eksamenspakke": one ZIP with a readable document (the
// undervisningsbeskrivelse when given, then every lesson's note, homework and
// other content) and Lectio's own files in "filer/".
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Download, LoaderCircle, PackageOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchFile } from '@/lib/lectio/client';
import { schoolYearOf, termLabel } from '@/lib/lectio/term';
import { zipPlan, type StudyEntry } from './study';
import { useStudy, type StudyProgress } from './useStudy';
import { createZip, uniqueFileName } from './zip';
import { packHtml, type PackDescription } from './exam-pack';
import { teamRoute } from './teams';
import { entryYears, mergeEntries, usePhaseStudy } from './phase-study';

function save(data: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function PackButton({ entries, name, term, description, disabled }: { entries: StudyEntry[]; name: string; term: string; description?: PackDescription | null; disabled?: boolean }) {
  const plan = useMemo(() => zipPlan(entries), [entries]);
  const [state, setState] = useState<{ running: boolean; done: number; error?: string } | null>(null);
  const busy = !!state?.running;
  const empty = !entries.length && !description;

  const run = async () => {
    setState({ running: true, done: 0 });
    const fetched: Array<{ href: string; name: string; data: Uint8Array; date: Date }> = [];
    let failed = 0;
    let done = 0;
    // Same pace as the pages: four at a time.
    const queue = [...plan];
    const worker = async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        try {
          const blob = await fetchFile(f.href);
          fetched.push({ ...f, data: new Uint8Array(await blob.arrayBuffer()) });
        } catch {
          failed++;
        }
        setState({ running: true, done: ++done });
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, plan.length) }, worker));
    fetched.sort((a, b) => a.date.getTime() - b.date.getTime() || a.name.localeCompare(b.name, 'da'));
    const taken = new Set<string>();
    const paths = new Map<string, string>();
    const files = fetched.map((f) => {
      const path = `filer/${uniqueFileName(f.name, taken)}`;
      paths.set(f.href, path);
      return { name: path, data: f.data, date: f.date };
    });
    const now = new Date();
    const title = uniqueFileName(name || 'Hold', new Set());
    // Files that could not be fetched stay links to Lectio in the document.
    const html = packHtml({ title: name || 'Hold', term, description, entries, files: paths, madeAt: now });
    save(createZip([{ name: 'Eksamenspakke.html', data: new TextEncoder().encode(html), date: now }, ...files]), `${title} – eksamenspakke.zip`);
    setState(failed ? { running: false, done, error: `${failed} ${failed === 1 ? 'fil' : 'filer'} kunne ikke hentes og er med som links` } : null);
  };

  if (empty && !state) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled || busy || empty}
        onClick={run}
        title={disabled ? 'Vent til alle lektioner er læst' : 'Én zip: et dokument med beskrivelse, noter og lektier, og Lectios filer i mappen “filer”. Links til andre sider bliver links.'}
      >
        {busy ? <LoaderCircle className="animate-spin" /> : <Download />}
        <span className="tabular-nums">{busy ? (plan.length ? `Henter filer: ${state!.done} af ${plan.length}` : 'Pakker…') : 'Download eksamenspakke'}</span>
      </Button>
      {!busy && !state?.error && !disabled && (
        <span className="text-[12px] text-fg-subtle tabular-nums">
          {[description && 'beskrivelse', entries.length && `${entries.length} lektioner`, plan.length && `${plan.length} ${plan.length === 1 ? 'fil' : 'filer'}`].filter(Boolean).join(' · ')}
        </span>
      )}
      {state?.error && <span className="text-[12px] text-warning-soft-fg">{state.error}</span>}
    </div>
  );
}

/** Progress of useStudy as one line with a thin bar. */
export function StudyLoading({ study }: { study: StudyProgress }) {
  const total = study.weeksTotal + study.lessonsTotal;
  const done = study.weeksDone + study.lessonsDone;
  return (
    <span className="flex items-center gap-2 text-[12.5px] text-fg-subtle tabular-nums">
      <LoaderCircle className="size-3.5 animate-spin" />
      {study.weeksDone < study.weeksTotal ? `Gennemgår skemaet: uge ${study.weeksDone} af ${study.weeksTotal}` : `Læser lektioner: ${study.lessonsDone} af ${study.lessonsTotal}`}
      <span className="h-1 w-24 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <span className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
      </span>
    </span>
  );
}

/**
 * The pack for a subject from its undervisningsbeskrivelse. Every forløb page is
 * read (all school years), plus this year's hold schedule when there is one, for
 * lessons outside any forløb. Nothing is read until the user asks for it.
 */
export function ExamPack({ teamId, name, description }: { teamId: string | null; name: string; description: PackDescription }) {
  const [started, setStarted] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {started ? (
        <Gathering teamId={teamId} name={name} description={description} />
      ) : (
        <Button size="sm" onClick={() => setStarted(true)}>
          <PackageOpen /> Saml alt til eksamen
        </Button>
      )}
      {teamId && (
        <Link to={`${teamRoute(teamId)}?vis=laesning`} className="text-[13px] text-fg-muted underline-offset-2 hover:text-fg hover:underline">
          Læs årets lektioner her i appen
        </Link>
      )}
    </div>
  );
}

function Gathering({ teamId, name, description }: { teamId: string | null; name: string; description: PackDescription }) {
  const phaseIds = useMemo(() => description.phases.flatMap((p) => (p.id ? [{ id: p.id }] : [])), [description]);
  const phases = usePhaseStudy(phaseIds);
  const study = useStudy(teamId ?? '', !!teamId);
  const all = useMemo(
    () => mergeEntries(...[...phases.byPhase.values()].map((p) => p.entries), study.entries),
    [phases.byPhase, study.entries],
  );
  const years = useMemo(() => entryYears(all), [all]);
  const [off, setOff] = useState<Set<number>>(() => new Set());
  const entries = useMemo(() => (off.size ? all.filter((e) => !off.has(schoolYearOf(e.lesson.startDate))) : all), [all, off]);
  // The forløb pages add fields the undervisningsbeskrivelse leaves out (Periode, Skriftligt arbejde, Opgaver…).
  const full = useMemo<PackDescription>(
    () => ({
      ...description,
      phases: description.phases.map((p) => {
        const extra = (p.id && phases.byPhase.get(p.id)?.fields) || [];
        const have = new Set(p.fields.map((f) => f.label.toLocaleLowerCase('da')));
        return { ...p, fields: [...p.fields, ...extra.filter((f) => !have.has(f.label.toLocaleLowerCase('da')))] };
      }),
    }),
    [description, phases.byPhase],
  );

  if (!phases.done) {
    return (
      <span className="flex items-center gap-2 text-[12.5px] text-fg-subtle tabular-nums">
        <LoaderCircle className="size-3.5 animate-spin" /> Læser forløb: {phases.doneCount} af {phases.total}
      </span>
    );
  }
  if (!study.done) return <StudyLoading study={study} />;
  const failed = phases.failed + study.failed;
  const from = years.length ? years[0] : study.year;
  const to = years.length ? years[years.length - 1] : study.year;
  return (
    <>
      <PackButton entries={entries} name={name} term={from === to ? termLabel(from) : `${termLabel(from)}–${termLabel(to)}`} description={full} />
      {years.length > 1 && (
        <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-fg-muted" role="group" aria-label="Skoleår i pakken">
          {years.map((y) => {
            const on = !off.has(y);
            return (
              <button
                key={y}
                type="button"
                aria-pressed={on}
                onClick={() => setOff((prev) => { const next = new Set(prev); if (on) next.add(y); else next.delete(y); return next; })}
                className={on ? 'h-7 rounded-full bg-accent-soft px-2.5 font-medium text-accent-soft-fg tabular-nums' : 'h-7 rounded-full border border-border px-2.5 text-fg-subtle tabular-nums line-through'}
              >
                {termLabel(y)}
              </button>
            );
          })}
        </span>
      )}
      {failed > 0 && (
        <span className="text-[12px] text-warning-soft-fg">
          {failed} {failed === 1 ? 'side' : 'sider'} kunne ikke hentes ·{' '}
          <button type="button" onClick={() => { phases.retry(); study.retry(); }} className="font-medium underline-offset-2 hover:underline">Prøv igen</button>
        </span>
      )}
    </>
  );
}
