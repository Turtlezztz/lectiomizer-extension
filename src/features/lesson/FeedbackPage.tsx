import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Clock, ExternalLink, Eye, Lock, MapPin, MessagesSquare, PencilLine, RotateCw, UserRound } from 'lucide-react';
import { readFeedback } from '@/lib/lectio/readers/feedback.js';
import { useLectioPage, useSchoolId, type Loaded } from '@/lib/lectio/query';
import { pageUrl } from '@/lib/lectio/paths';
import { subjectColor } from '@/lib/subjects';
import { cn } from '@/lib/cn';
import { Page } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { RichText } from '@/components/RichText';
import { LessonTabs } from './LessonTabs';
import { isBlank, toEditorHtml } from './feedback-html';
import { feedbackPath, feedbackWriteRoute, type FeedbackData, type FeedbackPaper } from './lesson-utils';
import { People, Person } from '@/features/people/PersonPopover';
import { Rooms } from '@/features/rooms/RoomPopover';
import { dateFromShort } from '@/features/rooms/room';

export default function FeedbackPage() {
  const { id = '' } = useParams();
  const school = useSchoolId();
  const path = id ? feedbackPath(id) : null;
  const href = path ? pageUrl(school, path) : '';
  const query = useLectioPage(path, readFeedback);
  const loaded = query.data as Loaded<FeedbackData> | undefined;

  return (
    <Page>
      <Button variant="ghost" size="sm" asChild className="-ml-2.5 mb-3 text-fg-muted">
        <Link replace to={`/lesson/${encodeURIComponent(id)}`}><ArrowLeft /> Lektion</Link>
      </Button>
      {query.isPending ? <FeedbackSkeleton /> : query.error ? (
        <Card><ErrorState error={query.error} onRetry={() => query.refetch()} href={href} /></Card>
      ) : loaded ? <FeedbackContent id={id} loaded={loaded} href={href} onReload={() => query.refetch()} reloading={query.isFetching} /> : null}
    </Page>
  );
}

function FeedbackContent({ id, loaded, href, onReload, reloading }: { id: string; loaded: Loaded<FeedbackData>; href: string; onReload: () => void; reloading: boolean }) {
  const data = loaded.data;
  const { lesson } = data;
  const color = subjectColor(lesson?.holds[0] || lesson?.title || '');
  const ownWritten = data.own ? (data.own.editor ? !isBlank(data.own.editor.html) : data.own.items.length > 0) : false;
  const written = data.others.length + data.teacher.length + (ownWritten ? 1 : 0);

  return (
    <div className="space-y-5">
      <header className="relative overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <div aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: color.bar }} />
        <div className="flex flex-col gap-3 py-4 pr-5 pl-7 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              {lesson?.holds.map((h) => (
                <span key={h} className="inline-flex h-5 items-center rounded-full px-2 text-[11.5px] font-semibold text-fg" style={{ background: `color-mix(in oklch, ${color.bar} 20%, transparent)` }}>{h}</span>
              ))}
            </div>
            <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] text-fg">{lesson?.title || 'Elevfeedback'}</h1>
            <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-fg-muted">
              {(lesson?.date || lesson?.module) && <Meta icon={<Clock />} label="Tid">{[lesson.date, lesson.module].filter(Boolean).join(' · ')}</Meta>}
              {lesson?.room && <Meta icon={<MapPin />} label="Lokale"><Rooms rooms={lesson.room} day={dateFromShort(lesson.date, new Date())} /></Meta>}
              {!!lesson?.teachers.length && <Meta icon={<UserRound />} label="Lærere"><People names={lesson.teachers} kind="laerer" /></Meta>}
            </dl>
          </div>
          <div className="flex gap-2 self-start sm:self-center">
            <Button size="sm" variant="ghost" onClick={onReload} disabled={reloading} title="Hent igen fra Lectio" aria-label="Opdatér">
              <RotateCw className={reloading ? 'animate-spin' : undefined} />
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <a href={href} target="_blank" rel="noreferrer"><ExternalLink /> Åbn i Lectio</a>
            </Button>
          </div>
        </div>
      </header>

      <LessonTabs id={id} feedbackCount={written || undefined} />

      {!data.open ? (
        <Card>
          <EmptyState
            icon={<Lock />}
            title="Elevfeedback er ikke åben"
            description="Læreren har ikke åbnet for elevfeedback på dette modul. Når der bliver åbnet, kan du skrive og uploade her."
          />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="min-w-0 space-y-5">
            {data.canWrite ? (
              <OwnPaper id={id} data={data} />
            ) : (
              <aside className="flex gap-3 rounded-xl border border-border bg-surface-2/60 px-4 py-3">
                <Eye className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
                <p className="text-[13.5px] text-fg-muted">Elevfeedback er kun åben for læsning på dette modul. Du kan se, hvad læreren og de andre har skrevet.</p>
              </aside>
            )}
            {data.teacher.map((p) => <PaperCard key={p.id} paper={p} highlight />)}
            {data.others.length > 0 ? (
              <section aria-labelledby="others-heading" className="space-y-3">
                <h2 id="others-heading" className="flex items-center gap-2 pt-1 text-[13px] font-semibold text-fg-muted">
                  <MessagesSquare className="size-4" /> Fra klassen <span className="font-normal text-fg-subtle tabular-nums">{data.others.length}</span>
                </h2>
                {data.others.map((p) => <PaperCard key={p.id} paper={p} />)}
              </section>
            ) : (
              <Card>
                <EmptyState icon={<MessagesSquare />} title="Ingen har skrevet endnu" description="Når andre på holdet skriver elevfeedback, kan du læse det her." />
              </Card>
            )}
          </div>
          <Roster data={data} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- own paper (read-only, links to the writing page)

function OwnPaper({ id, data }: { id: string; data: FeedbackData }) {
  const paper = data.own;
  const editorHtml = paper?.editor?.html || '';
  const hasText = paper ? (paper.editor ? !isBlank(editorHtml) : paper.items.length > 0) : false;
  const write = feedbackWriteRoute(id);
  return (
    <section aria-labelledby="own-heading">
      <Card className="border-accent/25">
        <div className="flex flex-wrap items-start gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <h2 id="own-heading" className="flex scroll-mt-6 items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-fg"><PencilLine className="size-4 text-accent" /> Din feedback</h2>
            {data.hint && <p className="mt-0.5 text-[13px] text-fg-muted">{data.hint}</p>}
          </div>
          {hasText && (
            <Button size="sm" variant="secondary" asChild>
              <Link to={write}><PencilLine /> Rediger</Link>
            </Button>
          )}
        </div>
        {hasText ? (
          <div className="divide-y divide-border border-t border-border">
            {paper!.editor ? (
              <article className="px-5 py-3"><RichText html={toEditorHtml(editorHtml)} /></article>
            ) : (
              paper!.items.map((item) => (
                <article key={item.id} className="px-5 py-3 [&_.prose-lectio>h1:first-child]:mt-1 [&_.prose-lectio>h1:first-child]:text-[15px]">
                  <RichText node={item.node} />
                </article>
              ))
            )}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center">
            <p className="flex-1 text-[13.5px] text-fg-muted">Du har ikke skrevet noget endnu. Skriv tekst, og tilføj billeder, tabeller eller filer.</p>
            <Button variant="primary" asChild>
              <Link to={write}><PencilLine /> Skriv feedback</Link>
            </Button>
          </div>
        )}
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------- others

function PaperCard({ paper, highlight }: { paper: FeedbackPaper; highlight?: boolean }) {
  return (
    <Card id={`paper-${paper.id}`} className={cn('scroll-mt-6', highlight && 'border-accent/30')}>
      <div className="flex items-center gap-2.5 px-5 pt-4 pb-1">
        <Person person={{ name: paper.name, id: paper.contextId }} className="shrink-0 rounded-full">
          <Avatar name={paper.name} size={26} />
        </Person>
        <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-fg">
          <Person person={{ name: paper.name, id: paper.contextId }}>{paper.name}</Person>
        </h3>
        {highlight && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-soft-fg">Lærer</span>}
      </div>
      <div className="divide-y divide-border">
        {paper.items.map((item) => (
          <article key={item.id} className="px-5 py-3 [&_.prose-lectio>h1:first-child]:mt-1 [&_.prose-lectio>h1:first-child]:text-[15px]">
            <RichText node={item.node} />
          </article>
        ))}
      </div>
    </Card>
  );
}

function Roster({ data }: { data: FeedbackData }) {
  const papers = useMemo(() => new Map([...data.teacher, ...data.others].map((p) => [p.contextId, p])), [data.teacher, data.others]);
  const people = data.roster.filter((r) => r.contextId && !r.contextId.startsWith('T'));
  if (!people.length) return null;
  const done = people.filter((r) => r.entries.length > 0).length;
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-6 rounded-xl border border-border bg-surface p-3 shadow-card">
        <p className="mb-2 flex items-center justify-between px-1.5 text-[12px] font-semibold text-fg-muted">
          Holdet <span className="font-normal text-fg-subtle tabular-nums">{done}/{people.length} har skrevet</span>
        </p>
        <ul className="max-h-[70vh] space-y-px overflow-y-auto">
          {people.map((r) => {
            const paper = papers.get(r.contextId);
            const own = data.own?.contextId === r.contextId;
            const has = r.entries.length > 0;
            return (
              <li key={r.contextId}>
                <button
                  type="button"
                  disabled={!paper && !own}
                  onClick={() => document.getElementById(own ? 'own-heading' : `paper-${paper!.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[12.5px] hover:bg-surface-2 disabled:pointer-events-none"
                >
                  <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', has ? 'bg-success' : 'bg-border-strong')} />
                  <span className={cn('min-w-0 flex-1 truncate', has ? 'text-fg' : 'text-fg-subtle')}>{r.name}{own && ' (dig)'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

function Meta({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt className="text-fg-subtle [&_svg]:size-3.5" title={label}>{icon}<span className="sr-only">{label}</span></dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

function FeedbackSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Indlæser elevfeedback">
      <Card className="space-y-3 p-6">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-7 w-2/5" />
        <Skeleton className="h-3.5 w-48" />
      </Card>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-[340px] w-full rounded-xl" />
      <Card className="space-y-3 p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-3/5" />
      </Card>
    </div>
  );
}
