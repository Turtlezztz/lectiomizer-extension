import { Link, useParams } from 'react-router';
import { ArrowLeft, CalendarRange, ClipboardList, ExternalLink, StickyNote } from 'lucide-react';
import { Page, PageHeader } from '@/components/ui/page';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { RichText } from '@/components/RichText';
import { useLectioPage, useSchoolId } from '@/lib/lectio/query';
import { pageUrl, phasePath } from '@/lib/lectio/paths';
import { readPhase } from '@/lib/lectio/readers/studyplan.js';
import { subjectColor } from '@/lib/subjects';
import { cn } from '@/lib/cn';
import { SmartLink } from '@/features/home/SmartLink';
import { useDarkClass } from '@/features/schedule/hooks';
import type { PhaseActivity, PhaseData, PhaseField } from './model';
import { fmtPeriod } from './StudyPlanPage';

const read = readPhase as (doc: Document) => PhaseData;

// "23-11-2026 — 18-12-2026" → "23. nov. – 18. dec."
function period(value = ''): string {
  const d = [...value.matchAll(/(\d{1,2})-(\d{1,2})-(\d{4})/g)].map((m) => new Date(+m[3], +m[2] - 1, +m[1]));
  return d.length === 2 ? fmtPeriod({ start: d[0], end: d[1] }) : value.replace(/\s*—\s*/, ' – ');
}

// Shown as the facts row at the top rather than in the field list.
const FACTS = new Set(['Hold', 'Periode', 'Fag', 'Lærer', 'Lærere', 'Estimat']);

export default function PhasePage() {
  useDarkClass();
  const { id = '' } = useParams();
  const school = useSchoolId();
  const path = phasePath(id);
  const { data: loaded, isPending, error, refetch } = useLectioPage(path, read);
  const lectioUrl = pageUrl(school, path);
  const data = loaded?.data;
  const field = (label: string) => data?.fields.find((f) => f.label === label);
  const holds = field('Hold')?.lines ?? [];
  const hold = holds.at(-1)?.replace(/^\d{4}\/\d{2}:\s*/, '') ?? '';
  const color = subjectColor(hold || data?.title || '');

  return (
    <Page>
      <div className="mb-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2.5 text-fg-muted">
          <Link to="/studyplan">
            <ArrowLeft /> Studieplan
          </Link>
        </Button>
      </div>
      <PageHeader
        eyebrow={field('Fag')?.text || hold || undefined}
        title={data?.title || (isPending ? <Skeleton className="h-8 w-64" /> : 'Forløb')}
        description={data && [period(field('Periode')?.text), field('Estimat')?.text && field('Estimat')!.text !== 'Ikke angivet' ? field('Estimat')!.text : ''].filter(Boolean).join(' · ')}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <a href={lectioUrl} target="_blank" rel="noreferrer">
              <ExternalLink /> Åbn i Lectio
            </a>
          </Button>
        }
      />
      {isPending ? (
        <div className="space-y-4" aria-busy="true" aria-label="Indlæser forløb">
          <Skeleton className="h-32" />
          <Skeleton className="h-48" />
        </div>
      ) : error ? (
        <Card>
          <ErrorState error={error} onRetry={() => refetch()} href={lectioUrl} />
        </Card>
      ) : data ? (
        <div className="space-y-6">
          <Card className="relative overflow-hidden">
            <div aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: color.bar }} />
            <dl className="grid gap-x-6 gap-y-3 py-4 pr-5 pl-7 text-[13.5px] sm:grid-cols-2">
              {holds.length > 0 && <Fact label="Hold">{holds.join(', ')}</Fact>}
              {(field('Lærer') || field('Lærere'))?.text && <Fact label="Lærer">{(field('Lærer') || field('Lærere'))!.text}</Fact>}
            </dl>
            <Fields fields={data.fields.filter((f) => !FACTS.has(f.label) && f.node)} />
          </Card>

          {data.exercises.length > 0 && (
            <Card>
              <CardHeader title="Skriftligt arbejde" icon={<ClipboardList />} />
              <CardBody className="pb-3">
                <ul className="divide-y divide-border">
                  {data.exercises.map((e, i) => (
                    <li key={(e.href || '') + i} className="flex items-center gap-3 py-2 text-[14px]">
                      <SmartLink href={e.href} className="min-w-0 flex-1 truncate font-medium text-fg hover:text-accent-soft-fg">{e.title}</SmartLink>
                      <span className="shrink-0 text-[12.5px] text-fg-subtle tabular-nums">{e.deadline}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          <section>
            <h2 className="mb-2 flex items-baseline gap-2 px-1 text-[13px] font-semibold text-fg">
              Aktiviteter <span className="font-normal text-fg-subtle tabular-nums">· {data.activities.length}</span>
            </h2>
            {data.activities.length ? (
              <div className="space-y-3">
                {data.activities.map((a) => (
                  <ActivityCard key={a.id} activity={a} />
                ))}
              </div>
            ) : (
              <Card>
                <EmptyState icon={<CalendarRange />} title="Ingen aktiviteter" description="Der er ikke lagt moduler ind i forløbet endnu." />
              </Card>
            )}
          </section>
        </div>
      ) : null}
    </Page>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 text-fg">{children}</dd>
    </div>
  );
}

function Fields({ fields }: { fields: PhaseField[] }) {
  if (!fields.length) return null;
  return (
    <div className="space-y-4 border-t border-border py-4 pr-5 pl-7">
      {fields.map((f) => (
        <div key={f.label}>
          <h3 className="mb-1 text-[12px] font-medium text-fg-subtle">{f.label}</h3>
          <RichText node={f.node} className="text-[14px] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" />
        </div>
      ))}
    </div>
  );
}

function ActivityCard({ activity }: { activity: PhaseActivity }) {
  const { lesson } = activity;
  const cancelled = lesson?.status === 'cancelled';
  const items = activity.sections.flatMap((s) => s.items.map((item) => ({ ...item, section: s.title })));
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-3.5 pb-2">
        <SmartLink href={lesson?.href} className={cn('text-[14px] font-semibold text-fg hover:text-accent-soft-fg', cancelled && 'line-through decoration-danger/60')}>
          {[lesson?.date, lesson?.module].filter(Boolean).join(' · ') || 'Modul'}
        </SmartLink>
        {activity.title && <span className="text-[14px] text-fg">{activity.title}</span>}
        {lesson?.room && <span className="text-[12.5px] text-fg-subtle">{lesson.room}</span>}
        {cancelled && <Badge tone="danger">Aflyst</Badge>}
        {lesson?.status === 'changed' && <Badge tone="warning">Ændret</Badge>}
      </div>
      {(activity.note || items.length > 0) && (
        <div className="space-y-3 px-5 pb-4">
          {activity.note && (
            <aside className="flex gap-2.5 rounded-lg bg-warning-soft/60 px-3 py-2">
              <StickyNote className="mt-0.5 size-4 shrink-0 text-warning-soft-fg" />
              <p className="min-w-0 text-[13.5px] whitespace-pre-line text-fg">{activity.note}</p>
            </aside>
          )}
          {items.length > 0 && (
            <div className="divide-y divide-border">
              {items.map((item) => (
                <article key={item.id} className="py-2 first:pt-0 last:pb-0 [&_.prose-lectio>*:first-child]:mt-0 [&_.prose-lectio>*:last-child]:mb-0 [&_.prose-lectio>h1:first-child]:text-[15px]">
                  {item.section && <div className="mb-1 text-[11.5px] font-medium tracking-wide text-fg-subtle uppercase">{item.section}</div>}
                  <RichText node={item.node} embeds />
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
