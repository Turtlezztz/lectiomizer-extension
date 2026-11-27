import { Link } from 'react-router';
import { Archive, ArchiveRestore, BarChart3, ChevronDown, ChevronRight, ExternalLink, EyeOff, ListChecks, Pencil, Plus } from 'lucide-react';
import { Page, PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useLectioPage, useSchoolId } from '@/lib/lectio/query';
import { PATHS, pageUrl } from '@/lib/lectio/paths';
import { readQuestionnaires } from '@/lib/lectio/readers/questionnaire.js';
import { fmtDate, fmtTime, untilText, urgency } from '@/lib/format';
import { cn } from '@/lib/cn';
import { HIDDEN_QUESTIONNAIRES, PREFS_DEFAULT, hideKey, sortOpen, toggleHidden, type OpenQuestionnaire, type QuestionnairePrefs, type QuestionnairesData } from './model';
import { useStudentStore } from '@/features/messages/store';
import { Switch } from '@/components/ui/switch';

const read = readQuestionnaires as (doc: Document) => QuestionnairesData;

const when = (d: Date | null) => (d ? `${fmtDate(d)} ${fmtTime(d)}` : '–');

export default function QuestionnairesPage() {
  const school = useSchoolId();
  const { data: loaded, isPending, error, refetch } = useLectioPage(PATHS.questionnaires, read);
  const lectioUrl = pageUrl(school, PATHS.questionnaires);
  const data = loaded?.data;
  // Hidden questionnaires and "Kun fra lærere" are the student's own, kept locally.
  const prefs = useStudentStore<QuestionnairePrefs>(HIDDEN_QUESTIONNAIRES, PREFS_DEFAULT);
  const open = sortOpen(data?.open ?? [], prefs.value);
  const present = (data?.open ?? []).map(hideKey);
  const toggle = (q: OpenQuestionnaire) => prefs.update((p) => toggleHidden({ ...PREFS_DEFAULT, ...p }, hideKey(q), present));
  const setTeachersOnly = (on: boolean) => prefs.update((p) => ({ ...PREFS_DEFAULT, ...p, teachersOnly: on }));
  const teachersOnly = open.canFilter && !!prefs.value.teachersOnly;
  const set = open.hidden.length + open.filtered;

  return (
    <Page>
      <PageHeader
        title="Spørgeskemaer"
        description={
          data
            ? open.shown.length
              ? `${open.shown.length} åbne for besvarelse`
              : data.open.length
                ? 'Ingen åbne spørgeskemaer, der ikke er skjult'
                : 'Ingen åbne spørgeskemaer lige nu'
            : 'Spørgeskemaer fra Lectio'
        }
        actions={
          <>
            {data?.createHref && (
              <Button variant="secondary" size="sm" asChild title="Oprettelse foregår i Lectio">
                <a href={data.createHref} target="_blank" rel="noreferrer">
                  <Plus /> Opret i Lectio
                </a>
              </Button>
            )}
            <Button variant="ghost" size="sm" asChild>
              <a href={lectioUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> Åbn i Lectio
              </a>
            </Button>
          </>
        }
      />
      {isPending ? (
        <ListSkeleton />
      ) : error ? (
        <Card>
          <ErrorState error={error} onRetry={() => refetch()} href={lectioUrl} />
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="space-y-2">
            <Section
              title="Åbne for besvarelse"
              count={open.shown.length}
              dot="bg-accent"
              action={
                open.canFilter && (
                  <label className="ml-auto flex items-center gap-2 text-[12.5px] text-fg-muted" title="Skjul spørgeskemaer, som elever har lavet">
                    <Switch checked={teachersOnly} onChange={setTeachersOnly} label="Kun fra lærere" />
                    Kun fra lærere
                  </label>
                )
              }
            >
              {open.shown.length ? (
                <ul className="divide-y divide-border">
                  {open.shown.map((q, i) => (
                    <li key={(q.id || q.title) + i} className="group/row flex items-center transition-colors hover:bg-surface-2">
                      <OpenRow q={q} />
                      <HideButton q={q} onClick={() => toggle(q)} />
                    </li>
                  ))}
                </ul>
              ) : set > 0 ? (
                <EmptyState icon={<ListChecks />} title="Intet tilbage at besvare" description="De åbne spørgeskemaer er skjult eller filtreret fra." />
              ) : (
                <EmptyState icon={<ListChecks />} title="Ingen spørgeskemaer at besvare" description="Når nogen sender et spørgeskema til dig, dukker det op her." />
              )}
            </Section>
            {teachersOnly && open.filtered > 0 && (
              <p className="px-1 text-[12.5px] text-fg-subtle">
                {open.filtered} fra elever vises ikke.{' '}
                <button type="button" className="font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline" onClick={() => setTeachersOnly(false)}>
                  Vis alle
                </button>
              </p>
            )}
            {open.hidden.length > 0 && (
              <details className="group/hidden px-1">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12.5px] font-medium text-fg-muted select-none hover:text-fg [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="size-3.5 -rotate-90 transition-transform group-open/hidden:rotate-0" />
                  Skjulte ({open.hidden.length})
                </summary>
                <Card className="mt-2 overflow-hidden">
                  <ul className="divide-y divide-border">
                    {open.hidden.map((q, i) => (
                      <li key={(q.id || q.title) + i} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13.5px] text-fg-muted">{q.title || 'Uden titel'}</div>
                          <div className="truncate text-[12px] text-fg-subtle">
                            {q.owner}
                            {q.deadline && ` · Frist ${when(q.deadline)}`}
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => toggle(q)}>
                          <ArchiveRestore /> Vis igen
                        </Button>
                      </li>
                    ))}
                  </ul>
                </Card>
              </details>
            )}
          </div>

          {data!.reports.length > 0 && (
            <Section title="Resultater" count={data!.reports.length} dot="bg-info" hint="Åbner i Lectio">
              <ul className="divide-y divide-border">
                {data!.reports.map((q, i) => (
                  <li key={(q.id || q.title) + i}>
                    <ExternalRow href={q.href} title={q.title} meta={[q.owner, q.expires && `Tilgængelig til ${when(q.expires)}`]} icon={<BarChart3 />} />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {data!.own.length > 0 && (
            <Section title="Egne spørgeskemaer" count={data!.own.length} dot="bg-success" hint="Redigering og resultater i Lectio">
              <ul className="divide-y divide-border">
                {data!.own.map((q, i) => (
                  <li key={(q.id || q.title) + i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium text-fg">{q.title || 'Uden titel'}</div>
                      <div className="mt-0.5 text-[12.5px] text-fg-muted">
                        {q.deadline ? `Svarfrist ${when(q.deadline)}` : 'Ikke sendt ud endnu'}
                      </div>
                    </div>
                    {q.editHref && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={q.editHref} target="_blank" rel="noreferrer"><Pencil /> Rediger</a>
                      </Button>
                    )}
                    {q.href && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={q.href} target="_blank" rel="noreferrer"><BarChart3 /> Resultater</a>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </Page>
  );
}

function Section({ title, count, dot, hint, action, children }: { title: string; count: number; dot: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="animate-in">
      <h2 className="mb-2 flex items-center gap-2 px-1 text-[13px] font-semibold text-fg">
        <span aria-hidden className={cn('size-1.5 rounded-full', dot)} />
        {title}
        <span className="font-normal tabular-nums text-fg-subtle">{count}</span>
        {hint && <span className="ml-auto text-[12px] font-normal text-fg-subtle">{hint}</span>}
        {action}
      </h2>
      <Card className="overflow-hidden">{children}</Card>
    </section>
  );
}

function DeadlineBadge({ deadline }: { deadline: Date | null }) {
  if (!deadline) return null;
  const u = urgency(deadline);
  if (u === 'overdue') return <Badge tone="danger">Lukket</Badge>;
  if (u === 'soon') return <Badge tone="warning">Lukker {untilText(deadline)}</Badge>;
  return null;
}

function OpenRow({ q }: { q: OpenQuestionnaire }) {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-fg group-hover:text-accent-soft-fg">{q.title || 'Uden titel'}</div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-fg-muted">
          <span className="min-w-0 truncate">{q.owner}</span>
          {q.anonymous && (
            <span className="inline-flex items-center gap-1 text-fg-subtle">
              <EyeOff className="size-3" /> Anonym
            </span>
          )}
          <span className="tabular-nums sm:hidden">
            <span aria-hidden className="mr-2 text-fg-subtle">·</span>
            {q.deadline ? `Frist ${when(q.deadline)}` : q.deadlineText}
          </span>
        </div>
      </div>
      <DeadlineBadge deadline={q.deadline} />
      <div className="hidden w-[120px] shrink-0 text-right text-[13px] tabular-nums text-fg sm:block">
        {q.deadline ? (
          <>
            {fmtDate(q.deadline)} <span className="text-fg-muted">{fmtTime(q.deadline)}</span>
          </>
        ) : (
          <span className="text-fg-subtle">{q.deadlineText || 'Ingen frist'}</span>
        )}
      </div>
      <ChevronRight className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
    </>
  );
  const cls = 'group flex min-w-0 flex-1 items-center gap-3 py-3 pr-2 pl-4 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 sm:pl-5';
  if (q.id) return <Link to={`/questionnaires/${encodeURIComponent(q.id)}`} className={cls}>{content}</Link>;
  return <a href={q.href ?? '#'} target="_blank" rel="noreferrer" className={cls}>{content}</a>;
}

function HideButton({ q, onClick }: { q: OpenQuestionnaire; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      aria-label={`Skjul ${q.title || 'spørgeskemaet'}`}
      title="Skjul"
      className="mr-2 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 sm:mr-3 [@media(hover:none)]:opacity-100"
    >
      <Archive />
    </Button>
  );
}

function ExternalRow({ href, title, meta, icon }: { href: string | null; title: string; meta: Array<string | null | false | undefined>; icon: React.ReactNode }) {
  const content = (
    <>
      <span className="text-fg-subtle [&_svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-fg group-hover:text-accent-soft-fg">{title || 'Uden titel'}</div>
        <div className="mt-0.5 truncate text-[12.5px] text-fg-muted">{meta.filter(Boolean).join(' · ')}</div>
      </div>
      <ExternalLink className="size-3.5 shrink-0 text-fg-subtle" />
    </>
  );
  const cls = 'group flex items-center gap-3 px-4 py-3 sm:px-5';
  return href ? <a href={href} target="_blank" rel="noreferrer" className={cn(cls, 'hover:bg-surface-2')}>{content}</a> : <div className={cls}>{content}</div>;
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Indlæser spørgeskemaer">
      <Skeleton className="h-4 w-40" />
      <Card className="divide-y divide-border">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3.5">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </Card>
    </div>
  );
}
