import { ExternalLink, HandHelping } from 'lucide-react';
import { Page, PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { RichText } from '@/components/RichText';
import { useLectioPage, useSchoolId } from '@/lib/lectio/query';
import { PATHS, pageUrl } from '@/lib/lectio/paths';
import { readSps } from '@/lib/lectio/readers/student.js';

interface Grid {
  labels: string[];
  rows: string[][];
  empty: string;
}

export interface SpsData {
  current: Element | null;
  currentEmpty: string;
  settings: Grid;
  registrations: Grid;
}

const read = readSps as (doc: Document) => SpsData;

/** Specialpædagogisk støtte: the student's SPS recommendation and the support registered. */
export default function SpsPage() {
  const school = useSchoolId();
  const { data: loaded, isPending, error, refetch } = useLectioPage(PATHS.sps, read);
  const lectioUrl = pageUrl(school, PATHS.sps);
  const data = loaded?.data;
  const nothing = data && !data.current && !data.settings.rows.length && !data.registrations.rows.length;

  return (
    <Page>
      <PageHeader
        title="SPS"
        description="Specialpædagogisk støtte: dine indstillinger og registreret støtte"
        actions={
          <Button variant="ghost" size="sm" asChild>
            <a href={lectioUrl} target="_blank" rel="noreferrer">
              <ExternalLink /> Åbn i Lectio
            </a>
          </Button>
        }
      />
      {isPending ? (
        <div className="space-y-4" aria-busy="true" aria-label="Indlæser SPS">
          <Skeleton className="h-28" />
          <Skeleton className="h-40" />
        </div>
      ) : error ? (
        <Card>
          <ErrorState error={error} onRetry={() => refetch()} href={lectioUrl} />
        </Card>
      ) : data ? (
        <div className="space-y-5">
          {nothing && (
            <Card className="flex gap-3 px-5 py-4">
              <HandHelping className="mt-0.5 size-5 shrink-0 text-fg-subtle" />
              <p className="text-[13.5px] text-fg-muted">
                Du har ingen SPS-indstillinger eller registreringer. Har du brug for specialpædagogisk støtte, fx ordblindehjælp eller en mentor, så tal med skolens SPS-ansvarlige.
              </p>
            </Card>
          )}
          {!nothing && (
            <>
              <Card>
                <CardHeader title="Indstilling" />
                <CardBody>{data.current ? <RichText node={data.current} className="text-[14px]" /> : <p className="text-[13.5px] text-fg-muted">{data.currentEmpty || 'Ingen indstilling.'}</p>}</CardBody>
              </Card>
              <GridCard title="Alle indstillinger" grid={data.settings} />
              <GridCard title="Registreringer" grid={data.registrations} />
            </>
          )}
        </div>
      ) : null}
    </Page>
  );
}

function GridCard({ title, grid }: { title: string; grid: Grid }) {
  return (
    <Card>
      <CardHeader title={title} description={grid.rows.length ? `${grid.rows.length} i alt` : undefined} />
      {grid.rows.length ? (
        <div className="overflow-x-auto px-5 pb-4">
          <table className="w-full text-left text-[13.5px]">
            {grid.labels.length > 0 && (
              <thead>
                <tr className="border-b border-border text-[12px] text-fg-subtle">
                  {grid.labels.map((l, i) => (
                    <th key={i} className="py-1.5 pr-4 font-medium">{l}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody className="divide-y divide-border">
              {grid.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className="py-2 pr-4 text-fg">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <CardBody>
          <p className="text-[13.5px] text-fg-muted">{grid.empty && !/ingen data/i.test(grid.empty) ? grid.empty : 'Ingen endnu.'}</p>
        </CardBody>
      )}
    </Card>
  );
}
