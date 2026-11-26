import { useMemo } from 'react';
import { Page, PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useLectioPage, useSchoolId } from '@/lib/lectio/query';
import { PATHS, pageUrl } from '@/lib/lectio/paths';
import { readHome } from '@/lib/lectio/readers/home.js';
import { readMe } from '@/lib/lectio/readers/thread.js';
import { dayDiff, fmtLongDate, urgency } from '@/lib/format';
import { NowCard } from './NowCard';
import { Timeline } from './Timeline';
import { MessagesCard, NeedsCard, NoticesCard, OtherCard } from './sections';
import { currentOrNext, focusDayIndex, greeting, needs, useIsDark, useNow, type HomeData } from './model';

const capital = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

/** Hero + side column on desktop; on mobile the side column (today's lessons) sits right below the hero. */
function Layout({ hero, side, main }: { hero: React.ReactNode; side: React.ReactNode; main: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr] lg:gap-6">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">{hero}</div>
      <aside className="min-w-0 space-y-5 lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-label="Skema">{side}</aside>
      <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-2">{main}</div>
    </div>
  );
}

function summary(data: HomeData, now: Date): string {
  const today = data.days.flatMap((d) => d.lessons).filter((l) => l.time && dayDiff(l.time.start, now) === 0 && l.status !== 'cancelled');
  const left = today.filter((l) => l.time!.end > now).length;
  const due = (data.assignments?.rows || []).filter((r) => ['soon', 'week'].includes(urgency(r.due, now))).length;
  const parts: string[] = [];
  if (today.length) parts.push(left ? `${left} ${left === 1 ? 'lektion' : 'lektioner'} tilbage i dag` : 'Dagens lektioner er slut');
  else parts.push('Ingen lektioner i dag');
  if (due) parts.push(`${due} ${due === 1 ? 'aflevering' : 'afleveringer'} inden for en uge`);
  return parts.join(' · ');
}

function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Indlæser">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Layout
        hero={
          <Card className="space-y-5 p-6">
            <div className="flex justify-between gap-4">
              <div className="flex-1 space-y-2.5"><Skeleton className="h-5 w-24 rounded-full" /><Skeleton className="h-8 w-1/2" /><Skeleton className="h-3.5 w-1/3" /></div>
              <div className="space-y-2"><Skeleton className="h-7 w-20" /><Skeleton className="ml-auto h-3 w-12" /></div>
            </div>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-2 w-full rounded-full" />
          </Card>
        }
        side={<Card className="space-y-4 p-5"><Skeleton className="h-4 w-24" /><SkeletonRows rows={5} /></Card>}
        main={
          <>
            <Card className="space-y-4 p-5"><Skeleton className="h-4 w-32" /><SkeletonRows rows={4} /></Card>
            <Card className="space-y-4 p-5"><Skeleton className="h-4 w-40" /><SkeletonRows rows={3} /></Card>
          </>
        }
      />
    </div>
  );
}

export default function HomePage() {
  const school = useSchoolId();
  const { data: loaded, isPending, error, refetch } = useLectioPage(PATHS.home, readHome);
  const now = useNow();
  useIsDark(); // re-render so subjectColor() picks the right palette after a theme switch

  const data = loaded?.data as unknown as HomeData | undefined;
  const firstName = useMemo(() => {
    if (!loaded) return '';
    try {
      return ((readMe(loaded.doc) as { name: string }).name || '').split(/\s+/)[0] || '';
    } catch {
      return '';
    }
  }, [loaded]);
  const items = useMemo(() => (data ? needs(data) : []), [data]);

  if (isPending) return <Page wide><HomeSkeleton /></Page>;
  if (error || !data) {
    return (
      <Page wide>
        <PageHeader eyebrow={capital(fmtLongDate(now))} title={greeting(now)} />
        <Card><ErrorState error={error} onRetry={() => refetch()} href={pageUrl(school, PATHS.home)} /></Card>
      </Page>
    );
  }

  const current = currentOrNext(data.days, now);
  const focus = focusDayIndex(data.days, now);

  return (
    <Page wide>
      <PageHeader
        eyebrow={capital(fmtLongDate(now))}
        title={firstName ? `${greeting(now)}, ${firstName}` : greeting(now)}
        description={summary(data, now)}
      />
      <Layout
        hero={<NowCard current={current} now={now} />}
        side={
          <>
            <Timeline days={data.days} focus={focus} now={now} groups={data.groups} />
            <div className="hidden lg:block"><OtherCard blocks={data.other} now={now} /></div>
          </>
        }
        main={
          <>
            <NeedsCard items={items} now={now} homeworkHref={data.homework?.href} />
            <MessagesCard block={data.messages} now={now} />
            <NoticesCard block={data.notices} />
            <div className="lg:hidden"><OtherCard blocks={data.other} now={now} /></div>
          </>
        }
      />
    </Page>
  );
}
