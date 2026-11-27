import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronDown, ExternalLink, FileText } from 'lucide-react';
import { Page, PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { RichText } from '@/components/RichText';
import { useLectioPage, useSchoolId } from '@/lib/lectio/query';
import { appRoute, descriptionsPath, pageUrl } from '@/lib/lectio/paths';
import { readDescriptions } from '@/lib/lectio/readers/descriptions.js';
import { cn } from '@/lib/cn';

export interface UvbField {
  label: string;
  text: string;
  node: Element | null;
}

export interface UvbPhase {
  id: string;
  number: string;
  title: string;
  href: string | null;
  description: Element | null;
  fields: UvbField[];
}

export interface UvbDescription {
  kind: string;
  term: string;
  institution: string;
  subject: string;
  teachers: string;
  hold: string;
  info: UvbField[];
  phases: UvbPhase[];
}

export interface DescriptionsData {
  subjects: Array<{ id: string; name: string; selected: boolean }>;
  descriptions: UvbDescription[];
  empty: string;
}

const read = readDescriptions as (doc: Document) => DescriptionsData;

export default function DescriptionsPage() {
  const school = useSchoolId();
  const [params, setParams] = useSearchParams();
  const subjectId = params.get('fag');
  const path = descriptionsPath(subjectId);
  const { data: loaded, isPending, isFetching, error, refetch } = useLectioPage(path, read, { placeholderData: (prev) => prev });
  const lectioUrl = pageUrl(school, path);
  const data = loaded?.data;
  const selected = data?.subjects.find((s) => s.selected);

  return (
    <Page>
      <PageHeader
        title="Undervisningsbeskrivelser"
        description={selected ? selected.name : 'Hvad du har gennemgået i hvert fag – det censor ser til eksamen'}
        actions={
          <>
            {data && data.subjects.length > 0 && (
              <Select
                value={subjectId ?? selected?.id ?? ''}
                onChange={(e) => setParams({ fag: e.target.value }, { replace: true })}
                aria-label="Fag"
                className="w-52"
              >
                {data.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
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
        <div className="space-y-4" aria-busy="true" aria-label="Indlæser undervisningsbeskrivelse">
          <Skeleton className="h-36" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : error ? (
        <Card>
          <ErrorState error={error} onRetry={() => refetch()} href={lectioUrl} />
        </Card>
      ) : data?.descriptions.length ? (
        <div className={cn('space-y-8 transition-opacity', isFetching && 'opacity-60')}>
          {data.descriptions.map((d, i) => (
            <Description key={d.hold + i} description={d} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={<FileText />} title="Ingen undervisningsbeskrivelse" description={data?.empty || 'Der er ingen undervisningsbeskrivelse for faget endnu.'} />
        </Card>
      )}
    </Page>
  );
}

function Description({ description: d }: { description: UvbDescription }) {
  return (
    <section className="animate-in space-y-4">
      <Card>
        <div className="px-5 pt-4 pb-1">
          <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-fg">{d.subject || d.kind}</h2>
          {d.kind !== 'Undervisningsbeskrivelse' && <p className="text-[13px] text-fg-muted">{d.kind}</p>}
        </div>
        <dl className="grid gap-x-6 gap-y-3 px-5 pt-2 pb-4 text-[13.5px] sm:grid-cols-2">
          {d.info
            .filter((f) => !/^fag og niveau$/i.test(f.label) && f.text)
            .map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-[12px] text-fg-subtle">{f.label}</dt>
                <dd className="mt-0.5 text-fg">{f.text}</dd>
              </div>
            ))}
        </dl>
      </Card>
      {d.phases.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-baseline gap-2 px-1 text-[13px] font-semibold text-fg">
            Forløb <span className="font-normal text-fg-subtle tabular-nums">· {d.phases.length}</span>
          </h3>
          <Card className="divide-y divide-border overflow-hidden">
            {d.phases.map((p) => (
              <PhaseRow key={p.id} phase={p} />
            ))}
          </Card>
        </div>
      )}
    </section>
  );
}

function PhaseRow({ phase: p }: { phase: UvbPhase }) {
  const [open, setOpen] = useState(false);
  const route = appRoute(p.href);
  const scope = p.fields.find((f) => /^omfang$/i.test(f.label));
  const fields = p.fields.filter((f) => f.node);
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/60">
        <span className="w-6 shrink-0 text-[12.5px] text-fg-subtle tabular-nums">{p.number}</span>
        <span className="min-w-0 flex-1 text-[14px] font-medium text-fg">{p.title}</span>
        {scope && <span className="hidden shrink-0 text-[12.5px] text-fg-subtle sm:inline">{scope.text.match(/Estimeret:\s*([^D]+?)(?=Dækker|$)/)?.[1]?.trim() || ''}</span>}
        <ChevronDown className={cn('size-4 shrink-0 text-fg-subtle transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-4 px-4 pt-1 pb-5 sm:pl-13">
          {p.description && <RichText node={p.description} className="text-[14px] [&>*:first-child]:mt-0" />}
          {fields.map((f) => (
            <div key={f.label}>
              <h4 className="mb-1 text-[12px] font-medium text-fg-subtle">{f.label}</h4>
              <RichText node={f.node} className="text-[14px] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" />
            </div>
          ))}
          {route && (
            <Button variant="secondary" size="sm" asChild>
              <Link to={route}>Åbn forløbet</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
