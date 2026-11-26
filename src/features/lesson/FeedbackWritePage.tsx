// Dedicated page for writing your own elevfeedback.
//
// Lectio remembers per session whether the elevfeedback tab is in read or edit
// mode. This page always works in edit mode: if Lectio answers in read mode, we
// press its "Rediger" button (a postback) first, and again after a save if
// Lectio drops back to read mode, so the student can keep writing.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, ExternalLink, LoaderCircle, Lock, Save } from 'lucide-react';
import { readFeedback } from '@/lib/lectio/readers/feedback.js';
import { useSchoolId, type Loaded } from '@/lib/lectio/query';
import { NotLoggedInError, activate, getPage, postback, uploadEditorFile } from '@/lib/lectio/client';
import { pageUrl } from '@/lib/lectio/paths';
import { subjectColor } from '@/lib/subjects';
import { Page } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { FeedbackEditor, type FeedbackEditorHandle } from './FeedbackEditor';
import { toEditorHtml, toLectioHtml } from './feedback-html';
import { feedbackPath, type FeedbackData } from './lesson-utils';

const read = (doc: Document) => readFeedback(doc) as FeedbackData;

/** Load (or keep) the page in Lectio's edit mode. */
async function enterEditMode(doc: Document): Promise<{ doc: Document; data: FeedbackData }> {
  let data = read(doc);
  if (!data.editing && data.editButton) {
    doc = await activate(doc, data.editButton);
    data = read(doc);
  }
  return { doc, data };
}

export const editQueryKey = (url: string) => ['lectio-feedback-edit', url];

export default function FeedbackWritePage() {
  const { id = '' } = useParams();
  const school = useSchoolId();
  const url = pageUrl(school, feedbackPath(id));
  const backTo = `/lesson/${encodeURIComponent(id)}/feedback`;
  const query = useQuery<Loaded<FeedbackData>>({
    queryKey: editQueryKey(url),
    queryFn: async () => ({ ...(await enterEditMode(await getPage(url))), url }),
    // The editor owns this page's state; never refetch under it.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: (count, error) => !(error instanceof NotLoggedInError) && count < 1,
  });
  const loaded = query.data;

  return (
    <Page className="max-w-[920px]">
      <Button variant="ghost" size="sm" asChild className="-ml-2.5 mb-3 text-fg-muted">
        <Link replace to={backTo}><ArrowLeft /> Elevfeedback</Link>
      </Button>
      {query.isPending ? (
        <WriteSkeleton />
      ) : query.error ? (
        <Card><ErrorState error={query.error} onRetry={() => query.refetch()} href={url} /></Card>
      ) : loaded && loaded.data.editing && loaded.data.own?.editor ? (
        <Writer loaded={loaded} url={url} backTo={backTo} />
      ) : (
        <Card>
          <EmptyState
            icon={<Lock />}
            title={loaded?.data.open ? 'Du kan ikke skrive her' : 'Elevfeedback er ikke åben'}
            description={loaded?.data.open ? 'Elevfeedback er kun åben for læsning på dette modul.' : 'Læreren har ikke åbnet for elevfeedback på dette modul.'}
            action={<Button size="sm" asChild><Link replace to={backTo}>Tilbage til elevfeedback</Link></Button>}
          />
        </Card>
      )}
    </Page>
  );
}

function Writer({ loaded, url, backTo }: { loaded: Loaded<FeedbackData>; url: string; backTo: string }) {
  const school = useSchoolId();
  const client = useQueryClient();
  const navigate = useNavigate();
  const editor = useRef<FeedbackEditorHandle>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [version, setVersion] = useState(0);
  const { data } = loaded;
  const paper = data.own!;
  const lesson = data.lesson;
  const color = subjectColor(lesson?.holds[0] || lesson?.title || '');
  const initialHtml = useMemo(() => toEditorHtml(paper.editor?.html || ''), [paper.editor?.html]);

  const save = useMutation({
    mutationFn: async (then: 'stay' | 'leave') => {
      const ed = paper.editor;
      if (!ed) throw new Error('Din feedback kan ikke redigeres lige nu.');
      const html = toLectioHtml(editor.current?.getHtml() ?? '');
      const saved = await postback(loaded.doc, {
        target: ed.target,
        argument: 'save',
        fields: [[ed.textarea, html], [ed.dirtyName, '1']],
      });
      const after = read(saved);
      if (!after.own) throw new Error('Lectio bekræftede ikke gemningen. Åbn siden i Lectio og tjek din tekst.');
      // Lectio may drop back to read mode after saving: switch back so the next save works.
      const next = then === 'stay' ? await enterEditMode(saved) : { doc: saved, data: after };
      return { next: { ...next, url }, saved: { doc: saved, data: after, url }, then };
    },
    onSuccess: ({ next, saved, then }) => {
      // The overview shows the saved page right away.
      client.setQueryData(['lectio', url, readFeedback.name], saved);
      setDirty(false);
      if (then === 'leave') {
        navigate(backTo, { replace: true });
        return;
      }
      client.setQueryData(editQueryKey(url), next);
      setSavedAt(new Date());
    },
  });

  const onSave = useCallback(() => {
    if (!save.isPending) save.mutate('stay');
  }, [save]);

  // Unsaved changes: warn before leaving the page or the app tab.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !save.isPending && currentLocation.pathname !== nextLocation.pathname);
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
    <div className="space-y-4 pb-24">
      <header>
        <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-muted">
          {lesson?.holds.map((h) => (
            <span key={h} className="inline-flex h-5 items-center rounded-full px-2 text-[11.5px] font-semibold text-fg" style={{ background: `color-mix(in oklch, ${color.bar} 20%, transparent)` }}>{h}</span>
          ))}
          <span className="tabular-nums">{[lesson?.date, lesson?.module, lesson?.title].filter(Boolean).join(' · ')}</span>
        </div>
        <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.025em] text-fg">Skriv elevfeedback</h1>
        {data.hint && <p className="mt-1 text-[14px] text-fg-muted">{data.hint}</p>}
      </header>

      {paper.editor?.hasBackup && (
        <aside className="flex gap-3 rounded-xl border border-warning/30 bg-warning-soft/60 px-4 py-3 text-[13px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-soft-fg" />
          <p className="text-fg">
            Lectio har en automatisk sikkerhedskopi af en redigering, der ikke blev gemt.{' '}
            <a href={url} target="_blank" rel="noreferrer" className="font-medium text-accent-soft-fg underline underline-offset-2">Åbn i Lectio</a> for at gendanne den.
          </p>
        </aside>
      )}

      <FeedbackEditor
        ref={editor}
        html={initialHtml}
        resetKey={`${version}:${savedAt?.getTime() ?? 0}`}
        disabled={save.isPending}
        placeholder="Skriv din besvarelse, noter eller spørgsmål til læreren…"
        onDirtyChange={setDirty}
        onUpload={(file) => uploadEditorFile(school, file)}
        onSave={onSave}
        className="[&_[role=textbox]]:min-h-[55vh]"
      />

      {save.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger-soft-fg">
          {save.error instanceof Error ? save.error.message : 'Kunne ikke gemme.'} Din tekst er stadig her, så du kan prøve igen.
        </p>
      )}

      {/* Action bar */}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface/95 px-3 py-2.5 shadow-lg backdrop-blur">
        <Button variant="primary" onClick={onSave} disabled={save.isPending || !dirty}>
          {save.isPending && save.variables === 'stay' ? <LoaderCircle className="animate-spin" /> : <Save />} {save.isPending && save.variables === 'stay' ? 'Gemmer…' : 'Gem'}
        </Button>
        <Button
          variant="secondary"
          disabled={save.isPending}
          onClick={() => (dirty ? save.mutate('leave') : navigate(backTo, { replace: true }))}
        >
          {save.isPending && save.variables === 'leave' ? <LoaderCircle className="animate-spin" /> : <Check />} {dirty ? 'Gem og luk' : 'Færdig'}
        </Button>
        {dirty && !save.isPending && <Button variant="ghost" onClick={discard}>Kassér ændringer</Button>}
        <span className="ml-1 text-[12.5px] text-fg-muted" role="status" aria-live="polite">
          {save.isPending ? null : dirty ? (
            <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-warning" /> Ikke gemt · <kbd className="font-sans">Ctrl+S</kbd> gemmer</span>
          ) : savedAt ? (
            <span className="inline-flex items-center gap-1.5 text-success"><Check className="size-3.5" /> Gemt i Lectio kl. {savedAt.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}</span>
          ) : null}
        </span>
        <Button variant="ghost" size="sm" asChild className="ml-auto text-fg-muted">
          <a href={url} target="_blank" rel="noreferrer"><ExternalLink /> Lectio</a>
        </Button>
      </div>
    </div>
  );
}

function WriteSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Åbner editoren">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-[55vh] w-full rounded-xl" />
    </div>
  );
}
