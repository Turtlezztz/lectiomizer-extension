import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronRight, ExternalLink, Presentation, Search, SearchX, Users, X } from 'lucide-react';
import { Page, PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { pageUrl } from '@/lib/lectio/paths';
import { useSchoolId } from '@/lib/lectio/query';
import { compareText, directoryPath, searchEntries, sortEntries, useDirectory, type DirectoryEntry, type PeopleSort } from './directory';

type Kind = 'elev' | 'laerer';

const META = {
  elev: { title: 'Elever', route: '/students', search: 'Søg efter navn eller klasse…', codeSort: 'Klasse', icon: Users, empty: 'Lectio viste ingen elever. Nogle skoler giver ikke elever adgang til andre elevers skema.' },
  laerer: { title: 'Lærere', route: '/teachers', search: 'Søg efter navn eller initialer…', codeSort: 'Initialer', icon: Presentation, empty: 'Lectio viste ingen lærere for din skole.' },
} as const;

const PAGE = 240;

export default function PeoplePage({ kind }: { kind: Kind }) {
  const school = useSchoolId();
  const meta = META[kind];
  const directory = useDirectory(kind);
  const lectioUrl = pageUrl(school, directoryPath(kind));
  const count = directory.data?.length;

  return (
    <Page wide>
      <PageHeader
        title={meta.title}
        description={count != null ? `${count} ${kind === 'elev' ? (count === 1 ? 'elev' : 'elever') : count === 1 ? 'lærer' : 'lærere'} på skolen` : kind === 'elev' ? 'Alle elever på skolen' : 'Alle lærere på skolen'}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <a href={lectioUrl} target="_blank" rel="noreferrer">
              <ExternalLink /> Åbn i Lectio
            </a>
          </Button>
        }
      />
      {directory.isPending ? (
        <PeopleSkeleton />
      ) : directory.error ? (
        <Card>
          <ErrorState error={directory.error} onRetry={() => directory.refetch()} href={lectioUrl} />
        </Card>
      ) : !directory.data.length ? (
        <Card>
          <EmptyState icon={<meta.icon />} title={`Ingen ${meta.title.toLowerCase()}`} description={meta.empty} />
        </Card>
      ) : (
        <PeopleList kind={kind} entries={directory.data} />
      )}
    </Page>
  );
}

function PeopleList({ kind, entries }: { kind: Kind; entries: DirectoryEntry[] }) {
  const meta = META[kind];
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const sort = (params.get('sorter') as PeopleSort) || (kind === 'elev' ? 'code' : 'first');
  const group = params.get('klasse') ?? '';
  const [limit, setLimit] = useState(PAGE);
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

  const classes = useMemo(() => (kind === 'elev' ? Array.from(new Set(entries.map((e) => e.code).filter(Boolean))).sort(compareText) : []), [entries, kind]);
  const visible = useMemo(() => {
    const found = searchEntries(group ? entries.filter((e) => e.code === group) : entries, query);
    return sortEntries(found, sort);
  }, [entries, query, sort, group]);

  // Group under class headings when sorted by class.
  const sections = useMemo(() => {
    const shown = visible.slice(0, limit);
    if (kind !== 'elev' || sort !== 'code') return [{ title: '', items: shown }];
    const out: Array<{ title: string; items: DirectoryEntry[] }> = [];
    for (const e of shown) {
      const last = out[out.length - 1];
      if (last && last.title === (e.code || 'Uden klasse')) last.items.push(e);
      else out.push({ title: e.code || 'Uden klasse', items: [e] });
    }
    return out;
  }, [visible, limit, kind, sort]);

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
              setLimit(PAGE);
            }}
            placeholder={meta.search}
            aria-label={meta.search}
            className="pl-9"
          />
          {query && (
            <button type="button" aria-label="Ryd søgning" onClick={() => (setQuery(''), setParam('q', null))} className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {kind === 'elev' && classes.length > 1 && (
          <Select value={group} onChange={(e) => setParam('klasse', e.target.value || null)} aria-label="Klasse" className="w-40">
            <option value="">Alle klasser</option>
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        )}
        <Select value={sort} onChange={(e) => setParam('sorter', e.target.value)} aria-label="Sortér" className="w-48">
          <option value="first">Sortér: Fornavn</option>
          <option value="last">Sortér: Efternavn</option>
          <option value="code">Sortér: {meta.codeSort}</option>
        </Select>
      </div>

      {(query || group) && (
        <p className="text-[13px] text-fg-muted tabular-nums">
          {visible.length} {visible.length === 1 ? 'resultat' : 'resultater'}
        </p>
      )}

      {visible.length ? (
        <div className="space-y-5">
          {sections.map((section) => (
            <section key={section.title || 'all'}>
              {section.title && (
                <h2 className="mb-2 flex items-baseline gap-2 px-1 text-[13px] font-semibold text-fg">
                  {section.title}
                  <span className="text-[12px] font-normal text-fg-subtle tabular-nums">{entries.filter((e) => e.code === section.title).length}</span>
                </h2>
              )}
              <Card className="overflow-hidden">
                <ul className="-mb-px grid sm:grid-cols-2 xl:grid-cols-3">
                  {section.items.map((e) => (
                    <PersonRow key={e.id} entry={e} route={`${meta.route}/${encodeURIComponent(e.id)}`} kind={kind} />
                  ))}
                </ul>
              </Card>
            </section>
          ))}
          {visible.length > limit && (
            <div className="flex justify-center">
              <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                Vis flere ({visible.length - limit} tilbage)
              </Button>
            </div>
          )}
        </div>
      ) : (
        <Card>
          <EmptyState icon={<SearchX />} title={query ? `Ingen matcher “${query}”` : 'Ingen resultater'} description="Prøv et andet navn, en klasse eller initialer." />
        </Card>
      )}
    </div>
  );
}

function PersonRow({ entry, route, kind }: { entry: DirectoryEntry; route: string; kind: Kind }) {
  return (
    <li className="border-b border-border">
      <Link to={route} className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/70">
        <Avatar name={entry.name} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-fg">{entry.name}</div>
          {entry.code && (
            <div className="truncate text-[12px] text-fg-subtle tabular-nums">
              {kind === 'elev' ? `${entry.code}${entry.number ? ` · nr. ${entry.number}` : ''}` : entry.code}
            </div>
          )}
        </div>
        <ChevronRight className="size-4 shrink-0 text-fg-subtle opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
      </Link>
    </li>
  );
}

function PeopleSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Indlæser">
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-48" />
      </div>
      <Card className="grid sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
