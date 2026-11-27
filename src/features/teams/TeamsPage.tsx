import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronRight, ExternalLink, Layers, Search, SearchX, X } from 'lucide-react';
import { Page, PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { pageUrl } from '@/lib/lectio/paths';
import { useSchoolId } from '@/lib/lectio/query';
import { subjectColor } from '@/lib/subjects';
import { useDarkClass } from '@/features/schedule/hooks';
import { groupTeams, searchTeams, teamRoute, TEAMS_PATH, useTeams, type Team } from './teams';

export default function TeamsPage() {
  const school = useSchoolId();
  const teams = useTeams();
  const lectioUrl = pageUrl(school, TEAMS_PATH);
  const count = teams.data?.length;

  return (
    <Page wide>
      <PageHeader
        title="Hold"
        description={count != null ? `${count} ${count === 1 ? 'hold' : 'hold'} på skolen` : 'Alle hold på skolen, med skema, lærere og elever'}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <a href={lectioUrl} target="_blank" rel="noreferrer">
              <ExternalLink /> Åbn i Lectio
            </a>
          </Button>
        }
      />
      {teams.isPending ? (
        <TeamsSkeleton />
      ) : teams.error ? (
        <Card>
          <ErrorState error={teams.error} onRetry={() => teams.refetch()} href={lectioUrl} />
        </Card>
      ) : !teams.data.length ? (
        <Card>
          <EmptyState icon={<Layers />} title="Ingen hold" description="Lectio viste ingen aktuelle hold for din skole." />
        </Card>
      ) : (
        <TeamList teams={teams.data} />
      )}
    </Page>
  );
}

function TeamList({ teams }: { teams: Team[] }) {
  useDarkClass(); // subject colours depend on the theme
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const subject = params.get('fag') ?? '';
  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const subjects = useMemo(() => groupTeams(teams).map((g) => g.subject), [teams]);
  const visible = useMemo(() => searchTeams(subject ? teams.filter((t) => (t.subject || 'Øvrige hold') === subject) : teams, query), [teams, subject, query]);
  const groups = useMemo(() => groupTeams(visible), [visible]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setParam('q', e.target.value || null);
            }}
            placeholder="Søg efter hold, klasse eller fag…"
            aria-label="Søg efter hold, klasse eller fag"
            className="pl-9"
          />
          {query && (
            <button type="button" aria-label="Ryd søgning" onClick={() => (setQuery(''), setParam('q', null))} className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {subjects.length > 1 && (
          <Select value={subject} onChange={(e) => setParam('fag', e.target.value || null)} aria-label="Fag" className="w-52">
            <option value="">Alle fag</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        )}
      </div>

      {(query || subject) && (
        <p className="text-[13px] text-fg-muted tabular-nums">
          {visible.length} {visible.length === 1 ? 'hold' : 'hold'}
        </p>
      )}

      {groups.length ? (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.subject}>
              <h2 className="mb-2 flex items-baseline gap-2 px-1 text-[13px] font-semibold text-fg">
                {g.subject}
                {g.code && g.code !== g.subject && <span className="text-[12px] font-normal text-fg-subtle">{g.code}</span>}
                <span className="text-[12px] font-normal text-fg-subtle tabular-nums">· {g.teams.length}</span>
              </h2>
              <Card className="overflow-hidden">
                <ul className="-mb-px grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {g.teams.map((t) => (
                    <TeamRow key={t.id} team={t} />
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={<SearchX />} title={query ? `Ingen hold matcher “${query}”` : 'Ingen hold'} description="Prøv et andet holdnavn, en klasse eller et fag." />
        </Card>
      )}
    </div>
  );
}

function TeamRow({ team }: { team: Team }) {
  const color = subjectColor(team.name);
  return (
    <li className="border-b border-border">
      <Link to={teamRoute(team.id)} className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/70">
        <span aria-hidden className="h-6 w-1 shrink-0 rounded-full" style={{ background: color.bar }} />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-fg">{team.name}</span>
        <ChevronRight className="size-4 shrink-0 text-fg-subtle opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
      </Link>
    </li>
  );
}

function TeamsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Indlæser">
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-52" />
      </div>
      {Array.from({ length: 3 }, (_, s) => (
        <div key={s} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Card className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-6 w-1 rounded-full" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}
