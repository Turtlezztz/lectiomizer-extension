import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Clock, ExternalLink, FileText, Layers, Link2, MapPin, Paperclip, StickyNote, Users, UserRound,
} from 'lucide-react';
import { readActivity } from '@/lib/lectio/readers/activity.js';
import { useLectioPage, useSchoolId, type Loaded } from '@/lib/lectio/query';
import { activate, postbackTarget } from '@/lib/lectio/client';
import { pageUrl } from '@/lib/lectio/paths';
import { canGoBack, useBack } from '@/lib/nav';
import { subjectColor } from '@/lib/subjects';
import { cn } from '@/lib/cn';
import { Page } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { RichText } from '@/components/RichText';
import { absidOf, activityPath, asAttachment, hasFeedbackTab, isActionable, type ActivityData, type ActivityItem, type Attachment, type NavLinkData } from './lesson-utils';
import { LessonTabs } from './LessonTabs';
import { People } from '@/features/people/PersonPopover';
import { Rooms } from '@/features/rooms/RoomPopover';
import { dateFromShort } from '@/features/rooms/room';

export default function LessonPage() {
  const { id = '' } = useParams();
  const school = useSchoolId();
  const path = id ? activityPath(id) : null;
  const href = path ? pageUrl(school, path) : '';
  const query = useLectioPage(path, readActivity);
  const loaded = query.data as Loaded<ActivityData> | undefined;

  return (
    <Page>
      {query.isPending ? <LessonSkeleton /> : query.error ? (
        <>
          <BackButton className="mb-3" />
          <Card><ErrorState error={query.error} onRetry={() => query.refetch()} href={href} /></Card>
        </>
      ) : loaded ? <LessonContent loaded={loaded} href={href} /> : null}
    </Page>
  );
}


/** Back to where the lesson was opened from (schedule, overview, a person's schedule…), else the schedule. */
function BackButton({ className }: { className?: string }) {
  const back = useBack('/schedule');
  return (
    <Button variant="ghost" size="sm" asChild className={cn('-ml-2.5 text-fg-muted', className)}>
      <Link to="/schedule" onClick={back}><ArrowLeft /> {canGoBack() ? 'Tilbage' : 'Skema'}</Link>
    </Button>
  );
}

/** Prev/next are postbacks: run them, find out which lesson Lectio answered with, and route there. */
function useActivityNav(loaded: Loaded<ActivityData>) {
  const school = useSchoolId();
  const client = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (el: Element) => {
      const doc = await activate(loaded.doc, el);
      return { doc, data: readActivity(doc) as ActivityData, id: absidOf(doc) };
    },
    onSuccess: ({ doc, data, id }) => {
      if (id) {
        const url = pageUrl(school, activityPath(id));
        client.setQueryData(['lectio', url, readActivity.name], { doc, data, url });
        // Replace, so "Tilbage" leaves the lesson instead of stepping through every lesson visited.
        navigate(`/lesson/${encodeURIComponent(id)}`, { replace: true });
      } else {
        client.setQueryData(['lectio', loaded.url, readActivity.name], { doc, data, url: loaded.url });
      }
    },
  });
}

function LessonContent({ loaded, href }: { loaded: Loaded<ActivityData>; href: string }) {
  const { id = '' } = useParams();
  const data = loaded.data;
  const feedback = hasFeedbackTab(data);
  const extras = feedback ? data.extras.filter((e) => !/elevfeedback/i.test(e.label)) : data.extras;
  const { lesson } = data;
  const nav = useActivityNav(loaded);
  const color = subjectColor(lesson?.holds[0] || lesson?.title || '');
  const title = lesson?.title || lesson?.holds.join(', ') || 'Lektion';

  const sections = useMemo(
    () =>
      data.sections.map((s) => {
        const files: Array<Attachment & { id: string }> = [];
        const blocks: ActivityItem[] = [];
        for (const item of s.items) {
          const file = asAttachment(item.node);
          if (file) files.push({ ...file, id: item.id });
          else blocks.push(item);
        }
        return { title: s.title, files, blocks };
      }),
    [data.sections],
  );

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <BackButton />
      {nav.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger-soft-fg">
          {nav.error instanceof Error ? nav.error.message : 'Kunne ikke skifte aktivitet'}
        </p>
      )}

      {/* Header */}
      <Card className={cn('relative overflow-hidden', nav.isPending && 'opacity-60 transition-opacity')}>
        <div aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: color.bar }} />
        <div className="flex flex-col gap-4 py-5 pr-5 pl-7 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              {lesson?.holds.map((h) => (
                <span key={h} className="inline-flex h-5 items-center rounded-full px-2 text-[11.5px] font-semibold text-fg" style={{ background: `color-mix(in oklch, ${color.bar} 20%, transparent)` }}>{h}</span>
              ))}
              {lesson?.status === 'cancelled' && <Badge tone="danger">Aflyst</Badge>}
              {lesson?.status === 'changed' && <Badge tone="warning">Ændret</Badge>}
            </div>
            <h1 className={cn('text-[24px] leading-tight font-semibold tracking-[-0.025em] text-fg sm:text-[26px]', lesson?.status === 'cancelled' && 'line-through decoration-danger/60')}>{title}</h1>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-fg-muted">
              {(lesson?.date || lesson?.module) && (
                <Meta icon={<Clock />} label="Tid">{[lesson.date, lesson.module].filter(Boolean).join(' · ')}</Meta>
              )}
              {lesson?.room && <Meta icon={<MapPin />} label="Lokale"><Rooms rooms={lesson.room} day={dateFromShort(lesson.date, new Date())} /></Meta>}
              {!!lesson?.teachers.length && <Meta icon={<UserRound />} label="Lærere"><People names={lesson.teachers} kind="laerer" /></Meta>}
              {!!lesson?.holds.length && <Meta icon={<Users />} label="Hold">{lesson.holds.join(', ')}</Meta>}
            </dl>
          </div>
          <Button size="sm" variant="secondary" asChild className="self-start">
            <a href={href} target="_blank" rel="noreferrer"><ExternalLink /> Åbn i Lectio</a>
          </Button>
        </div>
        {(data.phases.length > 0 || data.previous || data.next || data.hold) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 border-t border-border bg-surface-2/50 py-2.5 pr-4 pl-7 text-[12.5px]">
            {data.phases.length > 0 && (
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex items-center gap-1.5 text-fg-subtle"><Layers className="size-3.5" /> Forløb</span>
                {data.phases.map((p) => (
                  <a key={p.href} href={p.href} target="_blank" rel="noreferrer" className="font-medium text-fg-muted hover:text-accent">{p.label}</a>
                ))}
              </div>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Stepper label="Mine aktiviteter" previous={data.previous} next={data.next} onGo={(el) => nav.mutate(el)} busy={nav.isPending} />
              {data.hold && (
                <Stepper
                  label={data.hold.label || 'Holdets aktiviteter'}
                  labelHref={(data.hold.source as HTMLAnchorElement).href}
                  previous={data.hold.previous}
                  next={data.hold.next}
                  onGo={(el) => nav.mutate(el)}
                  busy={nav.isPending}
                  className="hidden sm:inline-flex"
                />
              )}
            </div>
          </div>
        )}
      </Card>

      {feedback && <LessonTabs id={id} />}

      {/* Note */}
      {data.note && (
        <aside className="flex gap-3 rounded-xl border border-warning/30 bg-warning-soft/60 px-4 py-3">
          <StickyNote className="mt-0.5 size-4 shrink-0 text-warning-soft-fg" />
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold text-warning-soft-fg">Note til lektionen</p>
            <p className="mt-0.5 text-[14px] whitespace-pre-line text-fg">{data.note}</p>
          </div>
        </aside>
      )}

      {/* Content */}
      {sections.length ? (
        sections.map((s, i) => (
          <Card key={i}>
            <div className="flex items-center gap-2.5 px-5 pt-4 pb-1">
              <span className={cn('flex size-7 items-center justify-center rounded-lg [&_svg]:size-4', /lekti/i.test(s.title) ? 'bg-accent-soft text-accent-soft-fg' : 'bg-surface-2 text-fg-muted')}>
                {/lekti/i.test(s.title) ? <BookOpen /> : <Layers />}
              </span>
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{s.title || 'Indhold'}</h2>
            </div>
            <div className="divide-y divide-border">
              {s.blocks.map((item) => (
                <article key={item.id} id={`item-${item.id}`} className="px-5 py-3 [&_.prose-lectio>h1:first-child]:mt-1 [&_.prose-lectio>h1:first-child]:text-[15px]">
                  <RichText node={item.node} />
                </article>
              ))}
            </div>
            {s.files.length > 0 && (
              <div className={cn('px-5 pt-2 pb-4', s.blocks.length > 0 && 'border-t border-border pt-3')}>
                <p className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-fg-subtle"><Paperclip className="size-3.5" /> Materialer</p>
                <div className="flex flex-wrap gap-2">{s.files.map((f) => <AttachmentChip key={f.id} file={f} />)}</div>
              </div>
            )}
            {!s.files.length && <div className="h-2" />}
          </Card>
        ))
      ) : (
        <Card>
          <EmptyState icon={<BookOpen />} title="Intet indhold" description={data.empty || 'Der er ikke lagt lektier eller materialer på denne lektion.'} />
        </Card>
      )}

      {extras.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-fg-subtle">Mere i Lectio:</span>
          {extras.map((e) =>
            e.href ? (
              <a key={e.label} href={e.href} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-fg-muted hover:border-border-strong hover:text-fg">
                <Link2 className="size-3.5" /> {e.label}
              </a>
            ) : (
              <span key={e.label} className="inline-flex h-7 items-center rounded-md px-2 text-fg-subtle">{e.label}</span>
            ),
          )}
        </div>
      )}
    </div>
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

function Stepper({ label, labelHref, previous, next, onGo, busy, className }: { label: string; labelHref?: string; previous: NavLinkData | null; next: NavLinkData | null; onGo: (el: Element) => void; busy: boolean; className?: string }) {
  const canPrev = isActionable(previous?.source, postbackTarget);
  const canNext = isActionable(next?.source, postbackTarget);
  if (!previous && !next) return null;
  return (
    <div role="group" aria-label={label} className={cn('inline-flex h-8 items-center rounded-lg border border-border bg-surface shadow-card', className)}>
      <button type="button" className="flex h-full w-8 items-center justify-center rounded-l-lg text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-35 disabled:hover:bg-transparent" disabled={!canPrev || busy} onClick={() => previous && onGo(previous.source)} title={previous?.label || 'Forrige'} aria-label={previous?.label || 'Forrige'}>
        <ChevronLeft className="size-4" />
      </button>
      {labelHref ? (
        <a href={labelHref} target="_blank" rel="noreferrer" className="border-x border-border px-2.5 text-[12.5px] leading-[30px] font-medium text-fg-muted hover:text-fg">{label}</a>
      ) : (
        <span className="border-x border-border px-2.5 text-[12.5px] leading-[30px] font-medium text-fg-muted">{label}</span>
      )}
      <button type="button" className="flex h-full w-8 items-center justify-center rounded-r-lg text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-35 disabled:hover:bg-transparent" disabled={!canNext || busy} onClick={() => next && onGo(next.source)} title={next?.label || 'Næste'} aria-label={next?.label || 'Næste'}>
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

function AttachmentChip({ file }: { file: Attachment }) {
  return (
    <a href={file.href} target="_blank" rel="noreferrer" className="group inline-flex h-9 max-w-full items-center gap-2 rounded-lg border border-border bg-surface pr-3 pl-2 text-[13px] shadow-card transition-colors hover:border-border-strong hover:bg-surface-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-3 text-fg-muted"><FileText className="size-3.5" /></span>
      <span className="truncate font-medium text-fg">{file.label}</span>
      {file.ext && <span className="text-[10.5px] font-semibold tracking-wide text-fg-subtle uppercase">{file.ext}</span>}
    </a>
  );
}

function LessonSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Indlæser lektion">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-8 w-48 rounded-lg" />
      </div>
      <Card className="space-y-3 p-6">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-7 w-2/5" />
        <div className="flex gap-5"><Skeleton className="h-3.5 w-28" /><Skeleton className="h-3.5 w-12" /><Skeleton className="h-3.5 w-16" /></div>
      </Card>
      <Skeleton className="h-16 w-full rounded-xl" />
      <Card className="space-y-3 p-5">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-11/12" />
        <Skeleton className="h-3.5 w-3/5" />
      </Card>
    </div>
  );
}
