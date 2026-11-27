import { useMemo, type ReactNode } from 'react';
import { ChevronDown, ExternalLink, GraduationCap, Info, ScrollText } from 'lucide-react';
import { readGrades } from '@/lib/lectio/readers/grades.js';
import { useLectioPage, useSchoolId } from '@/lib/lectio/query';
import { pageUrl, PATHS } from '@/lib/lectio/paths';
import { subjectColor } from '@/lib/subjects';
import { cn } from '@/lib/cn';
import { Page, PageHeader } from '@/components/ui/page';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { BAR_TONE, GradeChip } from './GradeChip';
import {
  SCALE, fmtNumber, gradeNumber, gradeTone, groupByTerm, isError, latestGrade, splitLevel, summarize, typeName, typeShort, xprsName,
  type Diploma, type Grade, type GradesData, type RecordTable, type SectionError, type SubjectGrades,
} from './grade-utils';

export default function GradesPage() {
  const school = useSchoolId();
  const href = pageUrl(school, PATHS.grades);
  const { data, isPending, error, refetch } = useLectioPage(PATHS.grades, readGrades);
  const grades = data?.data as GradesData | undefined;

  return (
    <Page>
      <PageHeader
        title="Karakterer"
        description={grades?.term ? `Skoleåret ${grades.term} · standpunkter, årskarakterer og eksamensbevis` : 'Standpunkter, årskarakterer og eksamensbevis'}
        actions={
          <Button size="sm" variant="ghost" asChild>
            <a href={href} target="_blank" rel="noreferrer"><ExternalLink /> Åbn i Lectio</a>
          </Button>
        }
      />
      {isPending ? <GradesSkeleton /> : error ? (
        <Card><ErrorState error={error} onRetry={() => refetch()} href={href} /></Card>
      ) : grades ? <GradesContent grades={grades} href={href} /> : null}
    </Page>
  );
}

function GradesContent({ grades, href }: { grades: GradesData; href: string }) {
  const summary = useMemo(() => summarize(grades.current.subjects), [grades]);
  const diplomas = grades.diplomas.filter((d): d is Diploma => !isError(d));
  const official = diplomas.find((d) => d.averages.length);

  return (
    <div className="space-y-6">
      {grades.notices.map((n) => (
        <div key={n} className="flex items-start gap-2.5 rounded-xl border border-border bg-info-soft/60 px-4 py-3 text-[13px] text-info-soft-fg">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>{n}</p>
        </div>
      ))}

      {(official || summary.count > 0) && (
        <section aria-label="Gennemsnit" className="grid gap-3 lg:grid-cols-2">
          {official && (
            <TileGroup title="Eksamensbevis" note={`Fra Lectio · ${official.averages[0]?.note ?? official.title}`}>
              {official.averages.slice(0, 2).map((a, i) => (
                <StatTile key={a.label} label={averageLabel(a.label)} value={a.value} hint={averageHint(a.label, a.note)} accent={i === 0} />
              ))}
            </TileGroup>
          )}
          {summary.count > 0 && (
            <TileGroup title={grades.term ? `Skoleåret ${grades.term}` : 'Skoleåret'} note={`Beregnet ud fra ${summary.count} standpunkter · tæller ikke på beviset`}>
              <StatTile
                label="Standpunktssnit"
                value={summary.weighted != null ? fmtNumber(summary.weighted) : '–'}
                hint={`Vægtet · uvægtet ${summary.unweighted != null ? fmtNumber(summary.unweighted) : '–'}`}
              />
              <DistributionTile distribution={summary.distribution} count={summary.count} />
            </TileGroup>
          )}
        </section>
      )}

      <section aria-labelledby="grades-current">
        <SectionTitle id="grades-current" title={`Karakterer${grades.term ? ` i ${grades.term}` : ''}`} note="Standpunkter og prøver på dine hold" />
        {grades.current.subjects.length ? (
          <CurrentGrades types={grades.current.types} subjects={grades.current.subjects} />
        ) : (
          <Card>
            <EmptyState icon={<GraduationCap />} title="Ingen karakterer endnu" description={grades.current.empty || `Der er ikke givet karakterer${grades.term ? ` i ${grades.term}` : ''} endnu. Tidligere skoleår kan vælges i Lectio.`} />
          </Card>
        )}
      </section>

      {grades.diplomas.map((d, i) => (isError(d) ? <SectionFailed key={i} title="Eksamensbeviset" error={d} href={href} /> : <DiplomaCard key={d.title + i} diploma={d} />))}

      {grades.protocol && (isError(grades.protocol) ? <SectionFailed title="Protokollinjerne" error={grades.protocol} href={href} /> : grades.protocol.rows.length > 0 && <Protocol table={grades.protocol} />)}

      <Supplementary notes={grades.notes} remarks={grades.remarks} href={href} />
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Eksamensresultat inkl. evt. bonus" → "Med evt. bonus" */
function averageLabel(label: string) {
  if (/inkl/i.test(label)) return 'Eksamenssnit med bonus';
  if (/ekskl/i.test(label)) return 'Eksamenssnit';
  return cap(label.replace(/^Eksamensresultat\s*/i, '')) || label;
}

function averageHint(label: string, note: string | null) {
  if (/inkl/i.test(label)) return 'Inkl. evt. bonus, fx for ekstra A-niveauer';
  if (/ekskl/i.test(label)) return 'Uden bonus';
  return note ? cap(note) : '';
}

function SectionTitle({ id, title, note, action }: { id?: string; title: string; note?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id={id} className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{title}</h2>
        {note && <p className="text-[12.5px] text-fg-subtle">{note}</p>}
      </div>
      {action}
    </div>
  );
}

function TileGroup({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-2/60 p-2">
      <div className="flex flex-wrap items-baseline gap-x-2 px-2 pt-1 pb-2">
        <h2 className="text-[13px] font-semibold text-fg">{title}</h2>
        <p className="text-[12px] text-fg-subtle">{note}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function StatTile({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="text-[12.5px] font-medium text-fg-muted">{label}</p>
      <div>
        <p className={cn('text-[28px] leading-none font-semibold tracking-[-0.03em] tabular-nums', accent ? 'text-accent' : 'text-fg')}>{value}</p>
        {hint && <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-fg-subtle" title={hint}>{hint}</p>}
      </div>
    </Card>
  );
}

function DistributionTile({ distribution, count }: { distribution: Record<string, number>; count: number }) {
  const max = Math.max(1, ...Object.values(distribution));
  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="flex items-center justify-between text-[12.5px] font-medium text-fg-muted">
        Fordeling <span className="text-fg-subtle tabular-nums">{count} stk.</span>
      </p>
      <div className="flex h-[58px] items-end gap-1.5" role="img" aria-label={SCALE.map((s) => `${s}: ${distribution[s]}`).join(', ')}>
        {SCALE.map((s) => (
          <div key={s} className="flex flex-1 flex-col items-center gap-1" title={`${s}: ${distribution[s]}`}>
            <span className="text-[10.5px] leading-none text-fg-subtle tabular-nums">{distribution[s] || ''}</span>
            <div className="flex h-9 w-full items-end">
              <div className={cn('w-full rounded-[3px]', distribution[s] ? BAR_TONE[gradeTone(s)] : 'bg-surface-3')} style={{ height: distribution[s] ? `${Math.max(14, (distribution[s] / max) * 100)}%` : 3 }} />
            </div>
          </div>
        ))}
      </div>
      <div className="-mt-1.5 flex gap-1.5">
        {SCALE.map((s) => <span key={s} className="flex-1 text-center text-[10.5px] text-fg-subtle tabular-nums">{s}</span>)}
      </div>
    </Card>
  );
}

const TH = 'px-3 py-2 text-[12px] font-medium whitespace-nowrap text-fg-subtle';

/** One row per subject form, one column per grade type — the same matrix Lectio shows, minus the noise. */
function CurrentGrades({ types, subjects }: { types: string[]; subjects: SubjectGrades[] }) {
  const used = types.filter((t) => subjects.some((s) => s.forms.some((f) => f.grades.some((g) => g.type === t))));
  const anyFinal = subjects.some((s) => s.forms.some((f) => f.grades.some((g) => g.final)));
  return (
    <Card className="overflow-hidden">
      {/* Desktop: matrix */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className={cn(TH, 'pl-5')}>Fag</th>
              <th scope="col" className={TH}>Form</th>
              <th scope="col" className={cn(TH, 'text-right')}>Vægt</th>
              {used.map((t) => <th key={t} scope="col" className={cn(TH, 'text-center')} title={typeName(t)}>{typeShort(t)}</th>)}
              <th aria-hidden className="w-full" />
            </tr>
          </thead>
          {subjects.map((s) => {
            const color = subjectColor(s.hold || s.subject);
            return (
              <tbody key={s.subject + s.hold} className="border-b border-border last:border-b-0">
                {s.forms.map((f, i) => {
                  const latest = latestGrade(f.grades);
                  return (
                    <tr key={f.form + i} className="hover:bg-surface-2/60">
                      {i === 0 && (
                        <th scope="rowgroup" rowSpan={s.forms.length} className="min-w-64 py-2.5 pr-6 pl-5 text-left align-top font-normal">
                          <SubjectName subject={s.subject} hold={s.hold} color={color.bar} />
                        </th>
                      )}
                      <td className="px-3 py-2.5 whitespace-nowrap text-fg-muted">{f.form || 'Samlet'}</td>
                      <td className="px-3 py-2.5 text-right text-fg-subtle tabular-nums">{latest?.weight ?? ''}</td>
                      {used.map((t) => {
                        const g = f.grades.find((x) => x.type === t);
                        return (
                          <td key={t} className="px-3 py-2 text-center">
                            {g ? <GradeChip value={g.value} final={g.final} size="sm" title={gradeTitle(g)} /> : <span className="text-fg-subtle/60">·</span>}
                          </td>
                        );
                      })}
                      <td aria-hidden />
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>
      {/* Mobile: one block per subject */}
      <ul className="divide-y divide-border sm:hidden">
        {subjects.map((s) => (
          <li key={s.subject + s.hold} className="px-4 py-3">
            <SubjectName subject={s.subject} hold={s.hold} color={subjectColor(s.hold || s.subject).bar} />
            <div className="mt-2 space-y-2">
              {s.forms.map((f, i) => (
                <div key={f.form + i} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-[12.5px] text-fg-muted">{f.form || 'Samlet'}</span>
                  <div className="flex flex-wrap gap-x-3 gap-y-2 py-1">
                    {f.grades.map((g) => (
                      <span key={g.type} className="inline-flex items-center gap-2">
                        <span className="text-[11px] text-fg-subtle">{typeShort(g.type)}</span>
                        <GradeChip value={g.value} final={g.final} size="sm" title={gradeTitle(g)} />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {anyFinal && (
        <p className="flex items-center gap-1.5 border-t border-border px-5 py-2.5 text-[12px] text-fg-subtle">
          <span className="inline-block size-3 rounded-[4px] bg-surface-3 ring-2 ring-fg/15 ring-offset-1 ring-offset-surface" /> Afsluttende karakter
        </p>
      )}
    </Card>
  );
}

const gradeTitle = (g: Grade) => [typeName(g.type), g.source && `Kilde: ${g.source}`, g.weight && `Vægt: ${g.weight}`, ...g.extra].filter(Boolean).join(' · ');

function SubjectName({ subject, hold, color }: { subject: string; hold?: string; color: string }) {
  const { name, level } = splitLevel(subject);
  return (
    <span className="flex items-center gap-2.5">
      <span aria-hidden className="h-7 w-1 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0">
        <span className="block truncate font-medium text-fg" title={subject}>
          {name}{level && <span className="ml-1.5 text-[12px] font-normal text-fg-subtle">{level}</span>}
        </span>
        {hold && <span className="block truncate text-[12px] text-fg-subtle">{hold}</span>}
      </span>
    </span>
  );
}

/** "Engelsk B, mdt." → { name: "Engelsk B", form: "Mundtlig" } */
function diplomaSubject(label: string) {
  const m = label.match(/^(.*?),\s*(mdt|skr|mundtlig|skriftlig)\.?$/i);
  if (!m) return { name: label, form: '' };
  return { name: m[1], form: /^m/i.test(m[2]) ? 'Mundtlig' : 'Skriftlig' };
}

/** Lectio's "Linjer på bevis": one row per line, årskarakter and eksamen side by side. */
function DiplomaCard({ diploma }: { diploma: Diploma }) {
  const examGroup = diploma.groups.findIndex((g) => /eksamen/i.test(g));
  const taken = examGroup < 0 ? 0 : diploma.lines.filter((l) => !l.results[examGroup]?.empty).length;
  return (
    <section aria-labelledby="grades-diploma">
      <SectionTitle
        id="grades-diploma"
        title="Eksamensbevis"
        note={`${diploma.title} · de fag, der står på dit bevis${examGroup >= 0 ? ` · ${taken} af ${diploma.lines.length} med eksamen` : ''}`}
      />
      <Card className="overflow-hidden">
        {/* Desktop: table with grouped headings like Lectio */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="text-left">
                <th scope="col" rowSpan={2} className={cn(TH, 'border-b border-border pl-5 align-bottom')}>Fag</th>
                <th scope="col" rowSpan={2} className={cn(TH, 'border-b border-border align-bottom')}>Form</th>
                {diploma.groups.map((g) => (
                  <th key={g} scope="colgroup" colSpan={2} className="border-l border-border px-3 pt-2.5 pb-0.5 text-center text-[12.5px] font-semibold text-fg">{g}</th>
                ))}
              </tr>
              <tr className="border-b border-border">
                {diploma.groups.map((g) => [
                  <th key={g + 'k'} scope="col" className={cn(TH, 'border-l border-border pt-0.5 text-center')}>Karakter</th>,
                  <th key={g + 'v'} scope="col" className={cn(TH, 'pt-0.5 text-center')}>Vægt</th>,
                ])}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {diploma.lines.map((line) => {
                const { name, form } = diplomaSubject(line.subject);
                return (
                  <tr key={line.subject} className="hover:bg-surface-2/60">
                    <th scope="row" className="py-2.5 pr-3 pl-5 text-left font-medium text-fg">{name}</th>
                    <td className="px-3 py-2.5 text-fg-muted">{form}</td>
                    {line.results.map((r) => [
                      <td key={r.label + 'k'} className="border-l border-border px-3 py-2 text-center">
                        {r.empty ? <span className="text-fg-subtle/60" aria-label="Ingen karakter">·</span> : <GradeChip value={r.fields.Karakter} size="sm" title={r.fields.ECTS ? `ECTS ${r.fields.ECTS}` : undefined} />}
                      </td>,
                      <td key={r.label + 'v'} className="px-3 py-2.5 text-center text-fg-subtle tabular-nums">{r.empty ? '' : r.fields['Vægt'] ?? ''}</td>,
                    ])}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Mobile: one row per line, grades on the right */}
        <ul className="divide-y divide-border sm:hidden">
          {diploma.lines.map((line) => {
            const { name, form } = diplomaSubject(line.subject);
            return (
              <li key={line.subject} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-fg">{name}</p>
                  {form && <p className="text-[12px] text-fg-subtle">{form}</p>}
                </div>
                {line.results.map((r) => (
                  <div key={r.label} className="flex w-14 flex-col items-center gap-1">
                    <span className="text-[10.5px] text-fg-subtle">{/eksamen/i.test(r.label) ? 'Eksamen' : /år/i.test(r.label) ? 'Års' : r.label}</span>
                    {r.empty ? <span className="text-fg-subtle/60">·</span> : <GradeChip value={r.fields.Karakter} size="sm" />}
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
        {diploma.averages.length > 0 && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border bg-surface-2/60 px-5 py-3 text-[13px]">
            {diploma.averages.map((a) => (
              <span key={a.label} className="text-fg-muted">
                {averageLabel(a.label)}: <strong className="font-semibold text-fg tabular-nums">{a.value}</strong>
              </span>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}

function Protocol({ table }: { table: RecordTable }) {
  const known = ['Termin', 'XPRS fag', 'Karakter'].every((c) => table.columns.includes(c));
  return (
    <Card>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 select-none [&::-webkit-details-marker]:hidden">
          <ScrollText className="size-4 text-fg-subtle" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-fg">Protokollinjer</h2>
            <p className="mt-0.5 text-[13px] text-fg-muted">Datagrundlaget for dit eksamensbevis, nyeste termin først</p>
          </div>
          <Badge>{table.rows.length}</Badge>
          <ChevronDown className="size-4 text-fg-subtle transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-border">
          {known ? groupByTerm(table.rows).map(({ term, rows }) => (
            <section key={term} aria-label={term}>
              <h3 className="bg-surface-2 px-5 py-1.5 text-[12px] font-medium text-fg-muted">{term}</h3>
              <ul className="divide-y divide-border">
                {rows.map((row, i) => (
                  <li key={i} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium text-fg" title={row['XPRS fag']}>{xprsName(row['XPRS fag'])}</p>
                      <p className="truncate text-[12px] text-fg-subtle">
                        {[typeName(row.Type || ''), row.Evalueringsform, row['Vægt'] && `vægt ${row['Vægt']}`, row.Hold].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {row['Medtæller'] === 'Nej' && <Badge tone="outline">Tæller ikke med</Badge>}
                    <GradeChip value={row.Karakter} size="sm" title={row.Skala} />
                  </li>
                ))}
              </ul>
            </section>
          )) : <GenericTable table={table} />}
        </div>
      </details>
    </Card>
  );
}

function GenericTable({ table }: { table: RecordTable }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[12px] text-fg-subtle">{table.columns.map((c) => <th key={c} scope="col" className="px-4 py-2 font-medium">{c}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i} className="border-t border-border">{table.columns.map((c) => <td key={c} className="px-4 py-2 text-fg">{row[c]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Supplementary({ notes, remarks, href }: { notes: GradesData['notes']; remarks: GradesData['remarks']; href: string }) {
  const parts = ([['Karakternoter', notes], ['Bemærkninger', remarks]] as const).filter(([, t]) => t) as Array<[string, RecordTable | SectionError]>;
  const filled = parts.filter(([, t]) => isError(t) || t.rows.length);
  const empty = parts.filter(([, t]) => !isError(t) && !t.rows.length);
  return (
    <>
      {filled.map(([title, t]) => isError(t) ? <SectionFailed key={title} title={title} error={t} href={href} /> : (
        <Card key={title}>
          <CardHeader title={title} />
          <div className="border-t border-border"><GenericTable table={t} /></div>
        </Card>
      ))}
      {empty.length > 0 && <p className="text-center text-[12.5px] text-fg-subtle">{empty.map(([title]) => `Ingen ${title.toLowerCase()}`).join(' · ')}</p>}
    </>
  );
}

function SectionFailed({ title, error, href }: { title: string; error: SectionError; href: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-warning-soft/50 px-4 py-3 text-[13px] text-warning-soft-fg">
      <Info className="size-4 shrink-0" />
      <p className="flex-1">{title} kunne ikke læses ({error.error}).</p>
      <a href={href} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">Vis i Lectio</a>
    </div>
  );
}

function GradesSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Indlæser karakterer">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className={cn('space-y-4 p-4', i === 3 && 'col-span-2 lg:col-span-1')}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
          </Card>
        ))}
      </div>
      <Skeleton className="h-4 w-32" />
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="p-4">
            <div className="mb-4 flex items-center gap-3"><Skeleton className="h-8 w-1" /><Skeleton className="h-4 w-28" /></div>
            <div className="flex gap-4">{Array.from({ length: 4 }, (_, j) => <div key={j} className="space-y-1.5"><Skeleton className="h-2.5 w-10" /><Skeleton className="h-8 w-10 rounded-lg" /></div>)}</div>
          </Card>
        ))}
      </div>
      <Card className="p-5"><Skeleton className="mb-4 h-4 w-36" /><div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div></Card>
    </div>
  );
}

