import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { Popover } from 'radix-ui';
import { ArrowLeft, ExternalLink, GraduationCap, Layers, Link2, Pencil, Presentation, Users } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Card, CardHeader } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { pageUrl } from '@/lib/lectio/paths';
import { useSchoolId } from '@/lib/lectio/query';
import { canGoBack, useBack } from '@/lib/nav';
import { subjectColor, useSubjectLabel, useSubjectLinks } from '@/lib/subjects';
import { SubjectEditor } from '@/features/settings/SubjectColors';
import { WeekSchedule } from '@/features/schedule/SchedulePage';
import { useDarkClass } from '@/features/schedule/hooks';
import { compareText } from '@/features/people/directory';
import { teamMembersPath, teamSchedulePath, useTeamMembers, type Team, type TeamMember } from './teams';
import { StudyView } from './StudyView';

type Tab = 'skema' | 'deltagere' | 'laesning';
const TABS: Tab[] = ['skema', 'deltagere', 'laesning'];

export default function TeamPage() {
  useDarkClass();
  const { id = '' } = useParams();
  const school = useSchoolId();
  const back = useBack('/teams');
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t !== 'skema' && t === params.get('vis')) ?? 'skema';
  const setTab = (t: Tab) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (t === 'skema') next.delete('vis');
        else next.set('vis', t);
        return next;
      },
      { replace: true },
    );

  // The list is usually cached already; it gives the subject without an extra request.
  const team = useQueryClient().getQueryData<Team[]>(['lectio-teams', school])?.find((t) => t.id === id);
  const members = useTeamMembers(id);
  const name = team?.name || members.data?.data.title || '';
  const color = subjectColor(name);
  const label = useSubjectLabel()(name);
  const links = useSubjectLinks(name);
  const base = teamSchedulePath(id);
  const teachers = members.data?.data.teachers ?? [];
  const students = members.data?.data.students ?? [];

  return (
    <Page wide>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2.5 text-fg-muted">
          <Link to="/teams" onClick={back}>
            <ArrowLeft /> {canGoBack() ? 'Tilbage' : 'Hold'}
          </Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <a href={pageUrl(school, tab === 'deltagere' ? teamMembersPath(id) : base)} target="_blank" rel="noreferrer">
            <ExternalLink /> Åbn i Lectio
          </a>
        </Button>
      </div>

      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl" style={{ background: color.bg, color: color.fg }}>
            <Layers className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[12.5px] font-medium text-fg-subtle">
              Hold{label !== name ? ` · ${name}` : team?.subject ? ` · ${team.subject}` : ''}
            </div>
            {name ? (
              <div className="flex min-w-0 items-center gap-1.5">
                <h1 className="truncate text-[26px] leading-tight font-semibold tracking-[-0.025em] text-fg">{label}</h1>
                <CustomizeButton hold={name} />
              </div>
            ) : (
              <Skeleton className="h-8 w-56" />
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {members.isPending ? (
                <Skeleton className="h-5 w-40" />
              ) : members.data ? (
                <>
                  <Badge tone="outline">
                    <Presentation /> {teachers.length} {teachers.length === 1 ? 'lærer' : 'lærere'}
                  </Badge>
                  <Badge tone="outline">
                    <Users /> {students.length} {students.length === 1 ? 'elev' : 'elever'}
                  </Badge>
                  {teachers.length > 0 && <span className="truncate text-[13px] text-fg-muted">{teachers.map((t) => t.name).join(', ')}</span>}
                </>
              ) : null}
            </div>
            {links.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {links.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    title={l.url}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[12.5px] font-medium text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
                  >
                    <Link2 className="size-3.5" /> {l.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="mb-4">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'skema', label: 'Skema' },
            { value: 'deltagere', label: 'Lærere og elever', count: members.data ? teachers.length + students.length : undefined },
            { value: 'laesning', label: <><span className="sm:hidden">Læsning</span><span className="hidden sm:inline">Eksamenslæsning</span></> },
          ]}
        />
      </div>

      {tab === 'laesning' ? (
        <StudyView teamId={id} name={label || name} lectioHref={pageUrl(school, base)} />
      ) : tab === 'skema' ? (
        <WeekSchedule base={base} eyebrow={`Skema for ${name || 'holdet'}`} emptyText={(week) => `Holdet har ingen moduler i uge ${week}.`} />
      ) : members.isPending ? (
        <MembersSkeleton />
      ) : members.error ? (
        <Card>
          <ErrorState error={members.error} onRetry={() => members.refetch()} href={pageUrl(school, teamMembersPath(id))} />
        </Card>
      ) : !teachers.length && !students.length ? (
        <Card>
          <EmptyState icon={<Users />} title="Ingen deltagere" description="Lectio viste ingen lærere eller elever på holdet." />
        </Card>
      ) : (
        <div className="space-y-5">
          {teachers.length > 0 && <MemberCard title="Lærere" icon={<Presentation />} members={teachers} />}
          {students.length > 0 && <MemberCard title="Elever" icon={<GraduationCap />} members={students} />}
        </div>
      )}
    </Page>
  );
}

function MemberCard({ title, icon, members }: { title: string; icon: React.ReactNode; members: TeamMember[] }) {
  const sorted = useMemo(() => [...members].sort((a, b) => compareText(a.code, b.code) || compareText(a.name, b.name)), [members]);
  return (
    <Card className="overflow-hidden">
      <CardHeader title={`${title} (${members.length})`} icon={icon} />
      <ul className="-mb-px grid border-t border-border sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((m) => (
          <li key={`${m.kind}${m.id}`} className="border-b border-border">
            <Link to={`${m.kind === 'elev' ? '/students' : '/teachers'}/${encodeURIComponent(m.id)}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/70">
              <Avatar name={m.name} src={m.photo} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium text-fg">{m.name}</div>
                <div className="truncate text-[12px] text-fg-subtle tabular-nums">{[m.code, m.line].filter(Boolean).join(' · ')}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MembersSkeleton() {
  return (
    <Card className="grid sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Indlæser">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </Card>
  );
}

/** Own name, colour and links for the hold's subject (the same values as in Indstillinger). */
function CustomizeButton({ hold }: { hold: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Tilpas navn, farve og links" title="Tilpas navn, farve og links" className="shrink-0 text-fg-subtle">
          <Pencil className="size-3.5" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className="z-50 w-[288px] animate-pop rounded-xl border border-border bg-surface p-3 shadow-pop">
          <SubjectEditor hold={hold} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
