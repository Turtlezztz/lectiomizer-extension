// "Eksamenslæsning" on a hold's page: the whole year's notes, homework and
// files of the hold on one searchable page, oldest first.
import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BookOpenText, ChevronRight, FileText, LoaderCircle, Search, SearchX, StickyNote, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { termLabel } from '@/lib/lectio/term';
import { fmtTime } from '@/lib/format';
import { filterStudy, groupByMonth, type StudyEntry, type StudyFile } from './study';
import { useStudy } from './useStudy';
import { PackButton } from './ExamPack';

export function StudyView({ teamId, name, lectioHref }: { teamId: string; name: string; lectioHref: string }) {
  const study = useStudy(teamId);
  const [query, setQuery] = useState('');
  const [onlyFiles, setOnlyFiles] = useState(false);
  const deferred = useDeferredValue(query);
  const shown = useMemo(() => filterStudy(study.entries, deferred, onlyFiles), [study.entries, deferred, onlyFiles]);
  const groups = useMemo(() => groupByMonth(shown), [shown]);
  const filtering = !!deferred.trim() || onlyFiles;

  if (study.error) {
    return (
      <Card>
        <ErrorState error={study.error} onRetry={study.retry} href={lectioHref} />
      </Card>
    );
  }

  const loading = !study.done;
  const starting = loading && !study.entries.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Søg i noter, lektier og filer…" aria-label="Søg i holdets indhold" className="pr-9 pl-9" />
          {query && (
            <button type="button" aria-label="Ryd søgning" onClick={() => setQuery('')} className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-fg-subtle hover:text-fg">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-[13px] text-fg-muted">
          <Switch checked={onlyFiles} onChange={setOnlyFiles} label="Kun lektioner med filer" />
          Kun med filer
        </label>
        <PackButton entries={shown} name={name} term={termLabel(study.year)} disabled={loading} />
      </div>

      <Status study={study} shown={shown.length} filtering={filtering} />

      {starting ? (
        <StudySkeleton />
      ) : !shown.length ? (
        loading ? null : (
          <Card>
            {filtering ? (
              <EmptyState icon={<SearchX />} title="Intet matcher" description="Prøv et andet ord, eller slå “Kun med filer” fra." />
            ) : (
              <EmptyState icon={<BookOpenText />} title="Intet at læse op på" description={`Lectio har ingen noter, lektier eller filer på holdets lektioner i ${termLabel(study.year)}.`} />
            )}
          </Card>
        )
      ) : (
        groups.map((g) => (
          <section key={g.key}>
            <h2 className="mb-2 px-1 text-[12.5px] font-semibold tracking-wide text-fg-subtle uppercase">{g.label}</h2>
            <Card className="divide-y divide-border overflow-hidden">
              {g.entries.map((e) => (
                <StudyRow key={e.lesson.absid} entry={e} />
              ))}
            </Card>
          </section>
        ))
      )}
    </div>
  );
}

function Status({ study, shown, filtering }: { study: ReturnType<typeof useStudy>; shown: number; filtering: boolean }) {
  const loading = !study.done;
  const total = study.weeksTotal + study.lessonsTotal;
  const done = study.weeksDone + study.lessonsDone;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-fg-subtle tabular-nums">
      {loading ? (
        <>
          <span className="flex items-center gap-1.5">
            <LoaderCircle className="size-3.5 animate-spin" />
            {study.weeksDone < study.weeksTotal ? `Gennemgår skemaet: uge ${study.weeksDone} af ${study.weeksTotal}` : `Læser lektioner: ${study.lessonsDone} af ${study.lessonsTotal}`}
          </span>
          <span className="h-1 w-24 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <span className="block h-full rounded-full bg-accent transition-[width]" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
          </span>
        </>
      ) : (
        <span>
          {filtering ? `${shown} af ${study.entries.length} lektioner` : `${study.entries.length} lektioner med indhold`} · {termLabel(study.year)}
        </span>
      )}
      {study.failed > 0 && !loading && (
        <span className="text-warning-soft-fg">
          {study.failed} {study.failed === 1 ? 'side' : 'sider'} kunne ikke hentes ·{' '}
          <button type="button" onClick={study.retry} className="font-medium underline-offset-2 hover:underline">
            Prøv igen
          </button>
        </span>
      )}
    </div>
  );
}

function StudyRow({ entry }: { entry: StudyEntry }) {
  const { lesson, content } = entry;
  const d = lesson.startDate;
  const title = content.title && !lesson.holds.includes(content.title) ? content.title : lesson.title;
  return (
    <article className="px-5 py-4">
      <Link to={`/lesson/${encodeURIComponent(lesson.absid)}`} className="group mb-2 flex items-baseline gap-2 text-[13px]">
        <span className="font-semibold text-fg tabular-nums first-letter:uppercase">
          {d.toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' })} · {fmtTime(d)}
        </span>
        {title && <span className="min-w-0 truncate text-fg-muted">{title}</span>}
        {lesson.status === 'cancelled' && <span className="text-[12px] text-danger-soft-fg">Aflyst</span>}
        <ChevronRight className="ml-auto size-4 shrink-0 self-center text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
      {content.note && (
        <p className="mb-2 flex gap-2 rounded-lg bg-warning-soft/60 px-3 py-2 text-[13.5px] whitespace-pre-line text-fg">
          <StickyNote className="mt-0.5 size-3.5 shrink-0 text-warning-soft-fg" />
          <span className="min-w-0">{content.note}</span>
        </p>
      )}
      {content.sections.map((s, i) => (
        <div key={i} className="mb-2 last:mb-0">
          {content.sections.length > 1 && s.title && <p className="mb-1 text-[12px] font-medium text-fg-subtle">{s.title}</p>}
          {/* Already sanitised by RichText's sanitize() when the page was read. */}
          {s.blocks.map((html, j) => (
            <div key={j} className="prose-lectio text-[14px] [&>h1:first-child]:mt-0 [&>h1:first-child]:text-[14.5px]" dangerouslySetInnerHTML={{ __html: html }} />
          ))}
        </div>
      ))}
      {content.files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {content.files.map((f) => (
            <FileChip key={f.href} file={f} />
          ))}
        </div>
      )}
    </article>
  );
}

function FileChip({ file }: { file: StudyFile }) {
  return (
    <a href={file.href} target="_blank" rel="noreferrer" className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[12.5px] transition-colors hover:border-border-strong hover:bg-surface-2">
      <FileText className="size-3.5 shrink-0 text-fg-subtle" />
      <span className="truncate font-medium text-fg">{file.label}</span>
      {file.ext && <span className="text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase">{file.ext}</span>}
    </a>
  );
}

function StudySkeleton() {
  return (
    <Card className="divide-y divide-border" aria-busy="true" aria-label="Indlæser">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="space-y-2 px-5 py-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      ))}
    </Card>
  );
}
