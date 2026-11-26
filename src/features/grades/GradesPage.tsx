import { useMemo } from 'react';
import { Award, ChevronDown, ExternalLink, GraduationCap, Info, ScrollText, TrendingDown, TrendingUp } from 'lucide-react';
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
        <section aria-label="Gennemsnit" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {official?.averages.map((a, i) => (
            <StatTile
              key={a.label}
              label={a.label.replace(/^Eksamensresultat\s*/i, 'Eksamensresultat ')}
              value={a.value}
              hint={i === 0 ? (a.note ? cap(a.note) : `Bevistype ${official.title}`) : `Bevistype ${official.title}`}
              accent={i === 0}
            />
          ))}
          {summary.count > 0 && (
            <StatTile
              label="Vægtet snit"
              value={summary.weighted != null ? fmtNumber(summary.weighted) : '–'}
              hint={`Beregnet · uvægtet ${summary.unweighted != null ? fmtNumber(summary.unweighted) : '–'}`}
            />
          )}
          {summary.count > 0 && <DistributionTile distribution={summary.distribution} count={summary.count} wide={((official?.averages.length ?? 0) + 1) % 2 === 0} />}
        </section>
      )}

      <section aria-labelledby="grades-current">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="grades-current" className="text-[15px] font-semibold tracking-[-0.01em] text-fg">Fag{grades.term ? ` i ${grades.term}` : ''}</h2>
          {grades.current.subjects.length > 0 && <Legend />}
        </div>
        {grades.current.subjects.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {grades.current.subjects.map((s) => <SubjectCard key={s.subject + s.hold} subject={s} />)}
          </div>
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

function StatTile({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <Card className="flex flex-col justify-between gap-3 p-4">
      <p className="text-[12.5px] font-medium text-fg-muted">{label}</p>
      <div>
        <p className={cn('text-[28px] leading-none font-semibold tracking-[-0.03em] tabular-nums', accent ? 'text-accent' : 'text-fg')}>{value}</p>
        {hint && <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-fg-subtle" title={hint}>{hint}</p>}
      </div>
    </Card>
  );
}

function DistributionTile({ distribution, count, wide }: { distribution: Record<string, number>; count: number; wide: boolean }) {
  const max = Math.max(1, ...Object.values(distribution));
  return (
    <Card className={cn('flex flex-col gap-3 p-4 lg:col-span-1', wide && 'col-span-2')}>
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

function Legend() {
  return (
    <p className="hidden items-center gap-1.5 text-[12px] text-fg-subtle sm:flex">
      <span className="inline-block size-3 rounded-[4px] bg-surface-3 ring-2 ring-fg/15 ring-offset-1 ring-offset-bg" /> Afsluttende karakter
    </p>
  );
}

function SubjectCard({ subject }: { subject: SubjectGrades }) {
  const color = subjectColor(subject.hold || subject.subject);
  const { name, level } = splitLevel(subject.subject);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5">
        <span aria-hidden className="h-8 w-1 shrink-0 rounded-full" style={{ background: color.bar }} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold text-fg" title={subject.subject}>{name}</h3>
          {subject.hold && <p className="text-[12px] text-fg-subtle">{subject.hold}</p>}
        </div>
        {level && <Badge tone="outline" title={`Niveau ${level}`}>{level}-niveau</Badge>}
      </div>
      <div className="divide-y divide-border border-t border-border">
        {subject.forms.map((f, i) => <FormRow key={f.form + i} form={f.form} grades={f.grades} />)}
      </div>
    </Card>
  );
}

function FormRow({ form, grades }: { form: string; grades: Grade[] }) {
  const latest = latestGrade(grades);
  const first = grades.find((g) => gradeNumber(g.value) !== null);
  const a = gradeNumber(first?.value);
  const b = gradeNumber(latest?.value);
  const trend = a !== null && b !== null && first !== latest ? Math.sign(b - a) : 0;
  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-[12.5px]">
        <span className="font-medium text-fg-muted">{form || 'Samlet'}</span>
        {latest?.weight && <span className="text-fg-subtle tabular-nums">· vægt {latest.weight}</span>}
        {trend !== 0 && (
          <span className={cn('ml-auto inline-flex items-center gap-1 text-[12px]', trend > 0 ? 'text-success-soft-fg' : 'text-warning-soft-fg')} title={`Fra ${first?.value} til ${latest?.value}`}>
            {trend > 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
            {first?.value} → {latest?.value}
          </span>
        )}
      </div>
      {grades.length ? (
        <ol className="-mx-1 flex items-start overflow-x-auto px-1 pt-0.5 pb-1">
          {grades.map((g, i) => (
            <li key={g.type} className="flex items-start">
              {i > 0 && <span aria-hidden className="mx-1 mt-[39px] h-px w-3 shrink-0 bg-border-strong sm:w-5" />}
              <div className="flex min-w-12 flex-col items-center gap-1.5">
                <span className="text-[11px] whitespace-nowrap text-fg-subtle">{typeShort(g.type)}</span>
                <GradeChip value={g.value} final={g.final} title={[typeName(g.type), g.source && `Kilde: ${g.source}`, g.weight && `Vægt: ${g.weight}`, ...g.extra].filter(Boolean).join(' · ')} />
                {g.extra.length > 0 && <span className="text-[10.5px] whitespace-nowrap text-fg-subtle">{g.extra.join(' · ')}</span>}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[13px] text-fg-subtle">Ingen karakterer endnu</p>
      )}
    </div>
  );
}

function DiplomaCard({ diploma }: { diploma: Diploma }) {
  return (
    <Card>
      <CardHeader icon={<Award />} title="Eksamensbevis" description={`Bevistype ${diploma.title}`} />
      {/* Desktop: table */}
      <div className="hidden overflow-x-auto px-2 pb-3 sm:block">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-[12px] text-fg-subtle">
              <th scope="col" className="px-3 py-2 font-medium">Fag</th>
              {diploma.groups.map((g) => <th key={g} scope="col" className="px-3 py-2 font-medium">{g}</th>)}
            </tr>
          </thead>
          <tbody>
            {diploma.lines.map((line) => (
              <tr key={line.subject} className="border-t border-border">
                <th scope="row" className="px-3 py-2.5 text-left font-medium text-fg">{line.subject}</th>
                {line.results.map((r) => (
                  <td key={r.label} className="px-3 py-2.5">
                    <DiplomaResult result={r} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile: stacked rows */}
      <ul className="divide-y divide-border border-t border-border sm:hidden">
        {diploma.lines.map((line) => (
          <li key={line.subject} className="px-4 py-3">
            <p className="mb-2 text-[13.5px] font-medium text-fg">{line.subject}</p>
            <div className="grid grid-cols-2 gap-2">
              {line.results.map((r) => (
                <div key={r.label}>
                  <p className="mb-1 text-[11px] text-fg-subtle">{r.label}</p>
                  <DiplomaResult result={r} />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {diploma.averages.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border px-4 py-3 text-[13px] sm:px-5">
          {diploma.averages.map((a) => (
            <span key={a.label} className="text-fg-muted">
              {a.label}: <strong className="font-semibold text-fg tabular-nums">{a.value}</strong>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

function DiplomaResult({ result }: { result: Diploma['lines'][number]['results'][number] }) {
  if (result.empty) return <span className="text-fg-subtle" aria-label="Ingen karakter">–</span>;
  const meta = [result.fields['Vægt'] && `vægt ${result.fields['Vægt']}`, result.fields.ECTS && `ECTS ${result.fields.ECTS}`].filter(Boolean).join(' · ');
  return (
    <span className="inline-flex items-center gap-2">
      <GradeChip value={result.fields.Karakter} size="sm" />
      {meta && <span className="text-[12px] text-fg-subtle tabular-nums">{meta}</span>}
    </span>
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

