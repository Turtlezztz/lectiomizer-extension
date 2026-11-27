// Answer a Spørgeskema. The answers live in local state and are written into
// Lectio's own form on "Gem" (draft, only the student sees it) or "Indsend"
// (final: the owner sees it, and it can no longer be changed).
import { useEffect, useMemo, useState } from 'react';
import { Link, useBlocker, useParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, CheckCircle2, ExternalLink, EyeOff, LoaderCircle, Lock, Save, Send, TriangleAlert } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { RichText } from '@/components/RichText';
import { getPage, postback, postbackTarget } from '@/lib/lectio/client';
import { useLectioPage, useSchoolId, type Loaded } from '@/lib/lectio/query';
import { PATHS, pageUrl, questionnairePath } from '@/lib/lectio/paths';
import { isAnswerPage, readQuestionnaire, readQuestionnaires } from '@/lib/lectio/readers/questionnaire.js';
import { useBack } from '@/lib/nav';
import { fmtDate, fmtTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  answerFields, answersOf, isAnswerable, isAnswered, isScale, progress, sameAnswers,
  type Answer, type Answers, type Question, type QuestionnaireData, type QuestionnairesData,
} from './model';

const read = readQuestionnaire as (doc: Document) => QuestionnaireData;
const readList = readQuestionnaires as (doc: Document) => QuestionnairesData;

export default function QuestionnairePage() {
  const { id = '' } = useParams();
  const school = useSchoolId();
  const url = pageUrl(school, questionnairePath(id));
  // The answers are local state: never refetch the page underneath them.
  const query = useLectioPage(questionnairePath(id), read, { staleTime: Infinity, refetchOnWindowFocus: false });
  // The deadline is only on the overview.
  const list = useLectioPage(PATHS.questionnaires, readList);
  const deadline = list.data?.data.open.find((q) => q.id === id)?.deadline ?? null;
  const back = useBack('/questionnaires');

  return (
    <Page className="max-w-[820px]">
      <Button variant="ghost" size="sm" asChild className="-ml-2.5 mb-3 text-fg-muted">
        <Link to="/questionnaires" onClick={back}><ArrowLeft /> Spørgeskemaer</Link>
      </Button>
      {query.isPending ? (
        <FormSkeleton />
      ) : query.error ? (
        <Card><ErrorState error={query.error} onRetry={() => query.refetch()} href={url} /></Card>
      ) : (
        <Questionnaire key={id} loaded={query.data!} url={url} deadline={deadline} />
      )}
    </Page>
  );
}

function Questionnaire({ loaded, url, deadline }: { loaded: Loaded<QuestionnaireData>; url: string; deadline: Date | null }) {
  const client = useQueryClient();
  const data = loaded.data;
  const initial = useMemo(() => answersOf(data.questions), [data]);
  const [answers, setAnswers] = useState<Answers>(initial);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [sent, setSent] = useState(false);
  const readOnly = !data.actions || sent;
  const dirty = !readOnly && !sameAnswers(answers, initial);
  const { answered, total } = progress(data.questions, answers);
  const unsupported = data.questions.some((q) => q.kind === 'unsupported');

  const refreshList = () => client.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'lectio' && /spoergeskema_rapport\.aspx/i.test(String(q.queryKey[1])) });

  const action = useMutation({
    mutationFn: async (mode: 'save' | 'submit') => {
      const button = mode === 'submit' ? data.actions?.submit : data.actions?.save;
      const target = postbackTarget(button);
      if (!target) throw new Error(mode === 'submit' ? 'Lectio tilbyder ikke at indsende lige nu.' : 'Lectio tilbyder ikke at gemme lige nu.');
      const { fields, omit } = answerFields(data.questions, answers);
      let doc = await postback(loaded.doc, { target: target.target, argument: target.argument, fields, omit });
      if (mode === 'submit') {
        // Still an answerable page: Lectio did not take the answer.
        if (isAnswerPage(doc) && read(doc).actions) throw new Error('Lectio tog ikke imod besvarelsen. Tjek dine svar, eller åbn spørgeskemaet i Lectio.');
        return { mode, next: null as Loaded<QuestionnaireData> | null };
      }
      // "Gem" may land back on the overview: load the questionnaire again to continue.
      if (!isAnswerPage(doc)) doc = await getPage(url);
      const next = read(doc);
      if (!sameAnswers(answersOf(next.questions), answers)) throw new Error('Lectio bekræftede ikke dine svar. Prøv igen, eller åbn spørgeskemaet i Lectio.');
      return { mode, next: { doc, data: next, url } satisfies Loaded<QuestionnaireData> };
    },
    onSuccess: ({ mode, next }) => {
      refreshList();
      const key = ['lectio', url, readQuestionnaire.name];
      if (mode === 'submit' || !next) {
        setSent(true);
        // Load the (now read-only) page again next time it is opened.
        client.invalidateQueries({ queryKey: key, refetchType: 'none' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      // The saved page carries the form for the next postback.
      client.setQueryData(key, next);
      setAnswers(answersOf(next.data.questions));
      setSavedAt(new Date());
    },
  });

  const submit = () => {
    const missing = total - answered;
    const warning = missing > 0 ? `Du har ikke svaret på ${missing} spørgsmål.\n\n` : '';
    if (window.confirm(`${warning}Når du indsender, kan ejeren se din besvarelse, og du kan ikke længere ændre den. Indsend nu?`)) action.mutate('submit');
  };

  // Unsaved answers: warn before leaving the page or the app tab.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !action.isPending && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('Du har svar, der ikke er gemt. Vil du forlade siden?')) blocker.proceed();
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

  const set = (key: string, value: Answer) => setAnswers((a) => ({ ...a, [key]: value }));
  const busy = action.isPending;

  return (
    <div className={cn('space-y-4', !readOnly && 'pb-24')}>
      <header>
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-fg-muted">
          {data.owner && <span>{data.owner}</span>}
          {data.anonymous && (
            <span className="inline-flex items-center gap-1"><span aria-hidden className="text-fg-subtle">·</span><EyeOff className="size-3" /> Anonym besvarelse</span>
          )}
          {deadline && (
            <span className="tabular-nums"><span aria-hidden className="mr-2 text-fg-subtle">·</span>Svarfrist {fmtDate(deadline)} {fmtTime(deadline)}</span>
          )}
        </div>
        <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.025em] text-fg">{data.title || 'Spørgeskema'}</h1>
      </header>

      {sent ? (
        <Notice tone="success" icon={<CheckCircle2 />}>
          Din besvarelse er indsendt. <Link to="/questionnaires" className="font-medium underline underline-offset-2">Tilbage til spørgeskemaer</Link>
        </Notice>
      ) : !data.actions ? (
        <Notice tone="neutral" icon={<Lock />}>
          Spørgeskemaet kan ikke besvares lige nu – det er allerede indsendt, eller svarfristen er overskredet.
        </Notice>
      ) : null}
      {unsupported && !readOnly && (
        <Notice tone="warning" icon={<TriangleAlert />}>
          Et spørgsmål bruger en type, Lectiomizer ikke kender.{' '}
          <a href={url} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">Besvar det i Lectio</a>.
        </Notice>
      )}

      <div className="space-y-3">
        {data.questions.map((q) => (
          <QuestionBlock key={q.key} q={q} answer={answers[q.key]} onChange={(v) => set(q.key, v)} disabled={readOnly || busy} url={url} />
        ))}
        {!data.questions.length && <Card><EmptyState title="Spørgeskemaet har ingen spørgsmål" /></Card>}
      </div>

      {action.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger-soft-fg">
          {action.error instanceof Error ? action.error.message : 'Noget gik galt.'} Dine svar er stadig her.
        </p>
      )}

      {!readOnly && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface/95 px-3 py-2.5 shadow-lg backdrop-blur">
          <Button variant="primary" onClick={submit} disabled={busy || !data.actions?.submit}>
            {busy && action.variables === 'submit' ? <LoaderCircle className="animate-spin" /> : <Send />} {busy && action.variables === 'submit' ? 'Indsender…' : 'Indsend'}
          </Button>
          <Button variant="secondary" onClick={() => action.mutate('save')} disabled={busy || !dirty || !data.actions?.save} title="Gemmer en kladde, som kun du kan se">
            {busy && action.variables === 'save' ? <LoaderCircle className="animate-spin" /> : <Save />} {busy && action.variables === 'save' ? 'Gemmer…' : 'Gem kladde'}
          </Button>
          <span className="ml-1 text-[12.5px] text-fg-muted" role="status" aria-live="polite">
            {busy ? null : dirty ? (
              <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-warning" /> Ikke gemt</span>
            ) : savedAt ? (
              <span className="inline-flex items-center gap-1.5 text-success"><Check className="size-3.5" /> Kladde gemt kl. {fmtTime(savedAt)}</span>
            ) : null}
          </span>
          <span className="ml-auto text-[12.5px] tabular-nums text-fg-muted">
            {answered}/{total} besvaret
          </span>
          <Button variant="ghost" size="sm" asChild className="text-fg-muted">
            <a href={url} target="_blank" rel="noreferrer"><ExternalLink /> Lectio</a>
          </Button>
        </div>
      )}
    </div>
  );
}

function Notice({ tone, icon, children }: { tone: 'success' | 'warning' | 'neutral'; icon: React.ReactNode; children: React.ReactNode }) {
  const styles = {
    success: 'border-success/30 bg-success-soft/60 [&>svg]:text-success-soft-fg',
    warning: 'border-warning/30 bg-warning-soft/60 [&>svg]:text-warning-soft-fg',
    neutral: 'border-border bg-surface-2 [&>svg]:text-fg-subtle',
  }[tone];
  return (
    <aside className={cn('flex gap-3 rounded-xl border px-4 py-3 text-[13px] text-fg [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0', styles)}>
      {icon}
      <p>{children}</p>
    </aside>
  );
}

function QuestionBlock({ q, answer, onChange, disabled, url }: { q: Question; answer: Answer | undefined; onChange: (v: Answer) => void; disabled: boolean; url: string }) {
  if (q.level === 1 && !isAnswerable(q)) {
    return (
      <section className="px-1 pt-4 first:pt-0">
        <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-fg">
          {q.number && <span className="mr-2 tabular-nums text-fg-subtle">{q.number}</span>}
          {q.title}
        </h2>
        {q.text && <RichText node={q.text} className="mt-1.5 text-[14px] text-fg-muted" />}
      </section>
    );
  }
  const labelId = `${q.key}-label`;
  const done = isAnswered(q, answer);
  return (
    <Card className="px-5 py-4">
      <div className="flex items-start gap-3">
        {q.number && (
          <span className={cn('mt-0.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums transition-colors', done ? 'bg-accent text-accent-fg' : 'bg-surface-3 text-fg-muted')}>
            {done ? <Check className="size-3" strokeWidth={3} /> : q.number}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 id={labelId} className="text-[14.5px] font-medium text-fg">{q.title || (q.number ? `Spørgsmål ${q.number}` : 'Spørgsmål')}</h3>
          {q.text && <RichText node={q.text} className="mt-1 text-[13.5px] text-fg-muted" />}
          <div className="mt-3">
            <Control q={q} answer={answer} onChange={onChange} disabled={disabled} labelId={labelId} url={url} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function Control({ q, answer, onChange, disabled, labelId, url }: { q: Question; answer: Answer | undefined; onChange: (v: Answer) => void; disabled: boolean; labelId: string; url: string }) {
  if (q.kind === 'text') {
    return (
      <Textarea
        aria-labelledby={labelId}
        value={typeof answer === 'string' ? answer : ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={4}
        placeholder={disabled ? 'Intet svar' : 'Skriv dit svar…'}
        className="resize-y"
      />
    );
  }
  if (q.kind === 'single') {
    const chosen = typeof answer === 'string' ? answer : null;
    if (isScale(q.options)) {
      return (
        <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
          {q.options.map((o) => {
            const on = chosen === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={disabled}
                onClick={() => onChange(o.value)}
                className={cn(
                  'h-9 min-w-10 flex-1 rounded-lg border px-2 text-[14px] font-medium tabular-nums transition-colors disabled:cursor-default sm:flex-none',
                  on ? 'border-accent bg-accent text-accent-fg shadow-sm' : 'border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-2 disabled:hover:bg-surface',
                  disabled && !on && 'opacity-60',
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <div role="radiogroup" aria-labelledby={labelId} className="space-y-1.5">
        {q.options.map((o) => (
          <Option key={o.value} type="radio" name={q.key} label={o.label} checked={chosen === o.value} disabled={disabled} onChange={() => onChange(o.value)} />
        ))}
      </div>
    );
  }
  if (q.kind === 'multi') {
    const checked = Array.isArray(answer) ? answer : q.options.map(() => false);
    return (
      <div role="group" aria-labelledby={labelId} className="space-y-1.5">
        {q.options.map((o, i) => (
          <Option key={o.name} type="checkbox" name={o.name} label={o.label} checked={!!checked[i]} disabled={disabled} onChange={(on) => onChange(checked.map((c, j) => (j === i ? on : c)))} />
        ))}
        {!disabled && <p className="pt-0.5 text-[12px] text-fg-subtle">Vælg gerne flere</p>}
      </div>
    );
  }
  if (q.kind === 'unsupported') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-soft-fg underline underline-offset-2">
        <ExternalLink className="size-3.5" /> Besvar dette spørgsmål i Lectio
      </a>
    );
  }
  return null;
}

function Option({ type, name, label, checked, disabled, onChange }: { type: 'radio' | 'checkbox'; name: string; label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-[14px] transition-colors',
        checked ? 'border-accent/50 bg-accent-soft/60 text-fg' : 'border-border bg-surface text-fg hover:border-border-strong hover:bg-surface-2',
        disabled && 'cursor-default hover:border-border hover:bg-surface',
        disabled && checked && 'hover:border-accent/50 hover:bg-accent-soft/60',
        disabled && !checked && 'opacity-60',
      )}
    >
      <input type={type} name={name} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="size-4 shrink-0 accent-[var(--color-accent)]" />
      <span className="min-w-0 break-words">{label || '–'}</span>
    </label>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Indlæser spørgeskemaet">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-8 w-80 max-w-full" />
      {[0, 1, 2].map((i) => (
        <Card key={i} className="space-y-3 px-5 py-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </Card>
      ))}
    </div>
  );
}
