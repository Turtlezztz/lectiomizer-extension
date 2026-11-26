import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, Clock, ExternalLink, Eye, LoaderCircle, Lock, MapPin, MessagesSquare, PencilLine, Save, UserRound } from 'lucide-react';
import { readFeedback } from '@/lib/lectio/readers/feedback.js';
import { useLectioPage, useSchoolId, type Loaded } from '@/lib/lectio/query';
import { postback, uploadEditorFile } from '@/lib/lectio/client';
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
import { FeedbackEditor, type FeedbackEditorHandle } from './FeedbackEditor';
import { LessonTabs } from './LessonTabs';
import { isBlank, toEditorHtml, toLectioHtml } from './feedback-html';
import { feedbackPath, type FeedbackData, type FeedbackPaper } from './lesson-utils';

export default function FeedbackPage() {
  const { id = '' } = useParams();
  const school = useSchoolId();
  const path = id ? feedbackPath(id) : null;
  const href = path ? pageUrl(school, path) : '';
  // Never refetch behind the student's back while they write.
  const query = useLectioPage(path, readFeedback, { refetchOnWindowFocus: false, staleTime: 5 * 60_000 });
  const loaded = query.data as Loaded<FeedbackData> | undefined;

  return (
    <Page>
      <Button variant="ghost" size="sm" asChild className="-ml-2.5 mb-3 text-fg-muted">
        <Link to={`/lesson/${encodeURIComponent(id)}`}><ArrowLeft /> Lektion</Link>
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
  const written = data.others.length + data.teacher.length + (data.own && !isBlank(data.own.editor?.html || '') ? 1 : 0);

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
              {lesson?.room && <Meta icon={<MapPin />} label="Lokale">{lesson.room}</Meta>}
              {!!lesson?.teachers.length && <Meta icon={<UserRound />} label="Lærere">{lesson.teachers.join(', ')}</Meta>}
            </dl>
          </div>
          <Button size="sm" variant="secondary" asChild className="self-start sm:self-center">
            <a href={href} target="_blank" rel="noreferrer"><ExternalLink /> Åbn i Lectio</a>
          </Button>
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
            {data.canWrite && data.own ? (
              <OwnPaper key={loaded.url} loaded={loaded} paper={data.own} hint={data.hint} href={href} onReload={onReload} reloading={reloading} />
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

// ---------------------------------------------------------------- own paper (editor)

function OwnPaper({ loaded, paper, hint, href, onReload, reloading }: { loaded: Loaded<FeedbackData>; paper: FeedbackPaper; hint: string; href: string; onReload: () => void; reloading: boolean }) {
  const school = useSchoolId();
  const client = useQueryClient();
  const editor = useRef<FeedbackEditorHandle>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [version, setVersion] = useState(0);
  const initialHtml = useMemo(() => toEditorHtml(paper.editor?.html || ''), [paper.editor?.html]);

  const save = useMutation({
    mutationFn: async () => {
      const ed = paper.editor;
      if (!ed) throw new Error('Din feedback kan ikke redigeres lige nu');
      const html = toLectioHtml(editor.current?.getHtml() ?? '');
      const doc = await postback(loaded.doc, {
        target: ed.target,
        argument: 'save',
        fields: [[ed.textarea, html], [ed.dirtyName, '1']],
      });
      const data = readFeedback(doc) as FeedbackData;
      if (!data.own?.editor) throw new Error('Lectio bekræftede ikke gemningen. Åbn siden i Lectio og tjek din tekst.');
      return { doc, data, url: loaded.url } satisfies Loaded<FeedbackData>;
    },
    onSuccess: (next) => {
      client.setQueryData(['lectio', loaded.url, readFeedback.name], next);
      setSavedAt(new Date());
      setDirty(false);
    },
  });

  const onSave = useCallback(() => {
    if (!save.isPending) save.mutate();
  }, [save]);

  // Unsaved changes: warn before leaving the page or the app tab.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('Du har ændringer, der ikke er gemt. Vil du forlade siden?')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const discard = () => {
    if (!window.confirm('Kassér dine ændringer siden sidst du gemte?')) return;
    setVersion((v) => v + 1);
    save.reset();
  };

  return (
    <section aria-labelledby="own-heading" className="space-y-2.5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="own-heading" className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-fg"><PencilLine className="size-4 text-accent" /> Din feedback</h2>
          {hint && <p className="mt-0.5 text-[13px] text-fg-muted">{hint}</p>}
        </div>
      </div>

      {paper.editor?.hasBackup && (
        <aside className="flex gap-3 rounded-xl border border-warning/30 bg-warning-soft/60 px-4 py-3 text-[13px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-soft-fg" />
          <p className="text-fg">
            Lectio har en automatisk sikkerhedskopi af en redigering, der ikke blev gemt.{' '}
            <a href={href} target="_blank" rel="noreferrer" className="font-medium text-accent-soft-fg underline underline-offset-2">Åbn i Lectio</a> for at gendanne den.
          </p>
        </aside>
      )}

      <FeedbackEditor
        ref={editor}
        html={initialHtml}
        resetKey={`${paper.editor?.html.length}:${version}:${savedAt?.getTime() ?? 0}`}
        disabled={save.isPending}
        placeholder="Skriv din besvarelse, noter eller spørgsmål til læreren…"
        onDirtyChange={setDirty}
        onUpload={(file) => uploadEditorFile(school, file)}
        onSave={onSave}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={onSave} disabled={save.isPending || !dirty}>
          {save.isPending ? <LoaderCircle className="animate-spin" /> : <Save />} {save.isPending ? 'Gemmer…' : 'Gem'}
        </Button>
        {dirty && !save.isPending && (
          <Button variant="ghost" onClick={discard}>Kassér ændringer</Button>
        )}
        <span className="ml-1 text-[12.5px] text-fg-muted" role="status" aria-live="polite">
          {save.isPending ? null : dirty ? (
            <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-warning" /> Ikke gemt · <kbd className="font-sans">Ctrl+S</kbd> gemmer</span>
          ) : savedAt ? (
            <span className="inline-flex items-center gap-1.5 text-success"><Check className="size-3.5" /> Gemt i Lectio kl. {savedAt.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}</span>
          ) : null}
        </span>
        {!dirty && !save.isPending && (
          <Button variant="ghost" size="sm" className="ml-auto text-fg-muted" onClick={onReload} disabled={reloading}>
            {reloading ? <LoaderCircle className="animate-spin" /> : null} Opdatér
          </Button>
        )}
      </div>
      {save.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger-soft-fg">
          {save.error instanceof Error ? save.error.message : 'Kunne ikke gemme'} Din tekst er stadig her, så du kan prøve igen.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- others

function PaperCard({ paper, highlight }: { paper: FeedbackPaper; highlight?: boolean }) {
  return (
    <Card id={`paper-${paper.id}`} className={cn('scroll-mt-6', highlight && 'border-accent/30')}>
      <div className="flex items-center gap-2.5 px-5 pt-4 pb-1">
        <Avatar name={paper.name} size={26} />
        <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-fg">{paper.name}</h3>
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
