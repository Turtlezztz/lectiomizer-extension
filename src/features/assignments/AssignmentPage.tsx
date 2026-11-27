import { useMemo, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, CalendarClock, ExternalLink, FileText, Info, MessageSquare } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { RichText } from '@/components/RichText';
import { useAccount, useLectioAction, useLectioPage, useSchoolId, type Loaded } from '@/lib/lectio/query';
import { useBack } from '@/lib/nav';
import { assignmentPath, pageUrl, PATHS } from '@/lib/lectio/paths';
import { readAssignment } from '@/lib/lectio/readers/assignment.js';
import { dayDiff, fmtDate, fmtLongDate, fmtTime, untilText, urgency } from '@/lib/format';
import { subjectColor } from '@/lib/subjects';
import { cn } from '@/lib/cn';
import { hoursLabel, kindOfStatus, splitStudentStatus, type AssignmentData } from './model';
import { FileLink, StatusBadge, SubjectDot } from './parts';
import { HandInCard, HandInClosed } from './HandInCard';
import { GroupCard } from './GroupCard';
import { Person } from '@/features/people/PersonPopover';

const read = readAssignment as (doc: Document) => AssignmentData;

export default function AssignmentPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const school = useSchoolId();
  const back = useBack('/assignments');
  // Lectio only opens an assignment with the student's elevid. Links from the
  // list carry it; otherwise (notifications, search) look up who is signed in.
  const routeElevId = params.get('elevid');
  const account = useAccount();
  const elevId = routeElevId || account.data?.data.elevId || null;
  const accountMissing = !routeElevId && account.isSuccess && !elevId;
  const path = id && elevId ? assignmentPath(id, elevId) : null;
  const lectioUrl = pageUrl(school, path ?? PATHS.assignments);
  const page = useLectioPage(path, read);
  const { data: loaded, refetch } = page;
  const error = page.error || (!routeElevId && account.error) || (accountMissing ? new Error('Kunne ikke se, hvilken elev der er logget ind, så opgaven kan ikke åbnes.') : null);
  const isPending = !error && (path ? page.isPending : true);

  return (
    <Page>
      <div className="mb-4 flex items-center justify-between gap-3 md:pr-14">
        <Link to="/assignments" onClick={back} className="inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium text-fg-muted transition-colors hover:text-fg">
          <ArrowLeft className="size-4" /> Opgaver
        </Link>
        <Button variant="ghost" size="sm" asChild>
          <a href={lectioUrl} target="_blank" rel="noreferrer">
            <ExternalLink /> Åbn i Lectio
          </a>
        </Button>
      </div>
      {isPending ? (
        <DetailSkeleton />
      ) : error ? (
        <Card>
          <ErrorState error={error} onRetry={() => (path ? refetch() : account.refetch())} href={lectioUrl} />
        </Card>
      ) : (
        <AssignmentDetail loaded={loaded!} lectioUrl={lectioUrl} />
      )}
    </Page>
  );
}

function AssignmentDetail({ loaded, lectioUrl }: { loaded: Loaded<AssignmentData>; lectioUrl: string }) {
  const data = loaded.data;
  const handInAction = useLectioAction(loaded, read);
  const groupAction = useLectioAction(loaded, read);
  const busy = handInAction.isPending || groupAction.isPending;

  const hold = data.info.Hold?.text ?? '';
  const me = data.students[0];
  const { status, absence } = splitStudentStatus(me?.status);
  const kind = kindOfStatus(status);
  const now = useMemo(() => new Date(), [data]);
  const overdue = kind !== 'delivered' && urgency(data.deadline, now) === 'overdue';
  const description = data.info.Opgavebeskrivelse;
  const note = data.info.Opgavenote?.text;

  return (
    <div className="space-y-6">
      <Header data={data} hold={hold} status={status} kind={kind} overdue={overdue} awaiting={me?.awaiting} now={now} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {(description?.links.length || description?.text || note) && (
            <Card>
              <CardHeader icon={<FileText />} title="Opgavebeskrivelse" />
              <CardBody className="space-y-3">
                {description && description.links.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {description.links.map((d) => <FileLink key={d.href} label={d.label} href={d.href} />)}
                  </div>
                )}
                {description && !description.links.length && description.text && <p className="text-[14px] leading-relaxed whitespace-pre-line text-fg">{description.text}</p>}
                {note && (
                  <div className="rounded-lg bg-surface-2 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-fg">
                    <span className="mb-0.5 block text-[11.5px] font-medium tracking-wide text-fg-subtle uppercase">Note fra læreren</span>
                    {note}
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          <Timeline entries={data.entries} />

          {data.handIn ? (
            <HandInCard loaded={loaded} mutate={handInAction.mutateAsync} pending={handInAction.isPending} error={handInAction.error} busy={busy} lectioUrl={lectioUrl} />
          ) : (
            <HandInClosed />
          )}
        </div>

        <aside className="min-w-0 space-y-5">
          <Details data={data} absence={absence} me={me} />
          {data.group && <GroupCard group={data.group} mutate={groupAction.mutateAsync} pending={groupAction.isPending} error={groupAction.error} busy={busy} />}
        </aside>
      </div>
    </div>
  );
}

function Header({ data, hold, status, kind, overdue, awaiting, now }: { data: AssignmentData; hold: string; status: string; kind: ReturnType<typeof kindOfStatus>; overdue: boolean; awaiting?: string; now: Date }) {
  const color = subjectColor(hold);
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        {hold && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-[12.5px] font-medium" style={{ background: color.bg, color: color.fg }}>
            <SubjectDot hold={hold} className="size-2" />
            {hold}
          </div>
        )}
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.025em] text-balance text-fg">{data.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {status && <StatusBadge kind={kind} label={status} overdue={overdue && kind === 'waiting'} />}
          {awaiting && <Badge tone="outline">Afventer {awaiting.toLowerCase()}</Badge>}
        </div>
      </div>
      <div className="w-full sm:w-auto">
        <Countdown deadline={data.deadline} fallback={data.info.Afleveringsfrist?.text} delivered={kind === 'delivered'} now={now} />
      </div>
    </header>
  );
}

/** Deadline card: date, time and how long is left. */
function Countdown({ deadline, fallback, delivered, now }: { deadline: Date | null; fallback?: string; delivered: boolean; now: Date }) {
  if (!deadline) {
    return fallback ? <div className="rounded-xl border border-border bg-surface px-4 py-3 text-[13px] text-fg-muted shadow-card">Frist: {fallback}</div> : null;
  }
  const u = delivered ? 'none' : urgency(deadline, now);
  const days = dayDiff(deadline, now);
  const left =
    u === 'overdue'
      ? days === 0 ? 'Fristen er overskredet' : `Overskredet for ${-days} ${days === -1 ? 'dag' : 'dage'} siden`
      : delivered
        ? 'Afleveret'
        : u === 'soon'
          ? `Frist ${untilText(deadline, now)}`
          : `${days} dage tilbage`;
  const tone = { overdue: 'border-danger/30 bg-danger-soft text-danger-soft-fg', soon: 'border-warning/40 bg-warning-soft text-warning-soft-fg', week: 'border-info/25 bg-info-soft text-info-soft-fg', later: 'border-border bg-surface text-fg', none: 'border-border bg-surface text-fg' }[u];
  return (
    <div className={cn('flex items-center gap-3 rounded-xl border px-4 py-2.5 shadow-card', tone)}>
      <CalendarClock className="size-5 shrink-0 opacity-80" />
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold first-letter:uppercase">{left}</div>
        <div className="text-[12.5px] tabular-nums opacity-80 first-letter:uppercase">
          {fmtLongDate(deadline)} kl. {fmtTime(deadline)}
        </div>
      </div>
    </div>
  );
}

function Timeline({ entries }: { entries: AssignmentData['entries'] }) {
  return (
    <Card>
      <CardHeader icon={<MessageSquare />} title="Indlæg" action={entries.length > 0 && <Badge className="tabular-nums">{entries.length}</Badge>} />
      <CardBody>
        {entries.length ? (
          <ol className="relative">
            {entries.map((entry, i) => {
              const hasComment = !!entry.comment?.textContent?.trim();
              const last = i === entries.length - 1;
              return (
                <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
                  {!last && <span aria-hidden className="absolute top-9 bottom-1 left-[15px] w-px bg-border" />}
                  {entry.user ? (
                    <Person person={{ full: entry.user, id: entry.userId }} className="shrink-0 rounded-full">
                      <Avatar name={entry.user} size={32} />
                    </Person>
                  ) : (
                    <Avatar name="?" size={32} />
                  )}
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[13.5px] font-semibold text-fg" title={entry.userTitle || undefined}>
                        {entry.user ? <Person person={{ full: entry.user, id: entry.userId }} /> : 'Ukendt'}
                      </span>
                      <time className="text-[12px] tabular-nums text-fg-subtle">
                        {entry.time ? `${fmtDate(entry.time)} · ${fmtTime(entry.time)}` : entry.timeText}
                      </time>
                    </div>
                    {hasComment && (
                      <div className="mt-1.5 rounded-lg rounded-tl-sm bg-surface-2 px-3 py-2">
                        <RichText node={entry.comment} className="!text-[13.5px] [&>p:first-child]:mt-0 [&>p:last-child]:mb-0" />
                      </div>
                    )}
                    {entry.documents.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {entry.documents.map((d) => (
                          <div key={d.href} className="max-w-full min-w-48">
                            <FileLink label={d.label} href={d.href} compact />
                          </div>
                        ))}
                      </div>
                    )}
                    {!hasComment && !entry.documents.length && <p className="mt-1 text-[13px] text-fg-subtle">Tomt indlæg</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <EmptyState className="py-6" icon={<MessageSquare />} title="Ingen indlæg endnu" description="Dine afleveringer og lærerens kommentarer vises her." />
        )}
      </CardBody>
    </Card>
  );
}

function Details({ data, absence, me }: { data: AssignmentData; absence: string; me?: AssignmentData['students'][number] }) {
  const rows: Array<[string, ReactNode]> = [];
  const info = (key: string) => data.info[key]?.text;
  if (info('Ansvarlig')) rows.push(['Ansvarlig', info('Ansvarlig')]);
  if (info('Elevtid')) rows.push(['Elevtid', hoursLabel(info('Elevtid')) ?? info('Elevtid')]);
  if (info('Karakterskala')) rows.push(['Karakterskala', info('Karakterskala')]);
  if (info('I undervisningsbeskrivelse')) rows.push(['I undervisningsbeskrivelse', info('I undervisningsbeskrivelse')]);
  if (absence) rows.push(['Fravær', absence]);
  if (me?.grade) rows.push(['Karakter', <span className="font-semibold">{me.grade}</span>]);
  if (me?.finished != null) rows.push(['Afsluttet', me.finished ? 'Ja' : 'Nej']);
  const notes: Array<[string, string]> = [];
  if (me?.gradeNote) notes.push(['Karakternote', me.gradeNote]);
  if (me?.studentNote) notes.push(['Elevnote', me.studentNote]);

  if (!rows.length && !notes.length) return null;
  return (
    <Card>
      <CardHeader icon={<Info />} title="Detaljer" />
      <CardBody className="space-y-4">
        {rows.length > 0 && (
          <dl className="divide-y divide-border text-[13px]">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
                <dt className="text-fg-muted">{k}</dt>
                <dd className="min-w-0 text-right font-medium tabular-nums text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {notes.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
            <div className="mb-0.5 text-[11.5px] font-medium tracking-wide text-fg-subtle uppercase">{k}</div>
            <p className="leading-relaxed whitespace-pre-line text-fg">{v}</p>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Indlæser opgave">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <Skeleton className="h-14 w-56 rounded-xl" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
