import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { SlidersHorizontal } from 'lucide-react';
import { Page, PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/lib/settings';
import { cn } from '@/lib/cn';
import { forgetLaunch, openedWithoutRoute } from '@/lib/nav';
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
import { columnSections, moveSection, toggleSection, tonightItems, type SectionId } from './overview';
import { useHomeLayout, usePinnedCountdowns } from './personal';
import { CountdownsCard, CustomizePanel, TonightCard } from './PersonalCards';
import { homeworkKey } from '@/features/homework/todo-model';
import { useHomeworkTicks, useTodos } from '@/features/homework/store';

const START_ROUTES: Record<string, string> = { schedule: '/schedule', assignments: '/assignments', homework: '/homework', messages: '/messages' };

const capital = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

/** Hero + side column on desktop; on mobile the side column (today's lessons) sits right below the hero. */
function Layout({ hero, side, main }: { hero: React.ReactNode; side: React.ReactNode; main: React.ReactNode }) {
  const hasHero = !(Array.isArray(hero) && hero.length === 0);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr] lg:gap-6">
      {hasHero && <div className="min-w-0 lg:col-start-1 lg:row-start-1">{hero}</div>}
      {/* flex + gap rather than space-y: cards that are hidden at this width (display:none) leave no gap behind */}
      <aside className="flex min-w-0 flex-col gap-5 lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-label="Skema">{side}</aside>
      <div className={cn('flex min-w-0 flex-col gap-5 lg:col-start-1', hasHero ? 'lg:row-start-2' : 'lg:row-span-2 lg:row-start-1')}>{main}</div>
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

/**
 * The index route. When the app is opened without a route (toolbar button, plain
 * app.html) and another start page is chosen, go there instead. Overblik itself –
 * via the menu, a reload of #/ or a link – always stays here.
 */
export default function HomePage() {
  const { settings } = useSettings();
  const location = useLocation();
  const start = START_ROUTES[settings.startPage ?? ''];
  useEffect(() => forgetLaunch, []);
  if (start && location.key === 'default' && openedWithoutRoute()) return <Navigate to={start} replace />;
  return <Overview />;
}

function Overview() {
  const school = useSchoolId();
  const { data: loaded, isPending, error, refetch } = useLectioPage(PATHS.home, readHome);
  const now = useNow();
  useIsDark(); // re-render so subjectColor() picks the right palette after a theme switch
  const ticks = useHomeworkTicks();
  const todos = useTodos();
  const pinned = usePinnedCountdowns();
  const { layout, change, reset, isDefault } = useHomeLayout();
  const [customizing, setCustomizing] = useState(false);

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
  // Homework ticked off on Lektier (or below) no longer needs the student.
  const tonight = tonightItems(items, todos.todos, ticks.isDone, now);
  // What "I aften" shows isn't repeated in "Brug for dig" (same homework/assignment twice on one screen).
  const inTonight = new Set(layout.hidden.includes('tonight') ? [] : tonight.flatMap((t) => (t.kind !== 'todo' && t.href ? [`${t.kind}:${t.href}:${t.due?.getTime()}`] : [])));
  const open = items.filter(
    (n) => (n.kind !== 'homework' || !ticks.isDone(homeworkKey(n.href, n.due))) && !inTonight.has(`${n.kind}:${n.href}:${n.due?.getTime()}`),
  );

  const cards: Record<SectionId, () => ReactNode> = {
    now: () => <NowCard current={current} now={now} />,
    countdowns: () => <CountdownsCard countdowns={pinned.countdowns} now={now} onAdd={pinned.add} onRemove={pinned.remove} />,
    tonight: () => (
      <TonightCard
        items={tonight}
        now={now}
        onToggle={(item) => (item.kind === 'todo' ? item.key && todos.toggle(item.key) : ticks.toggle(item.key, item.due))}
      />
    ),
    needs: () => <NeedsCard items={open} now={now} homeworkHref={data.homework?.href} />,
    messages: () => <MessagesCard block={data.messages} now={now} />,
    notices: () => <NoticesCard block={data.notices} />,
    timeline: () => <Timeline days={data.days} focus={focus} now={now} groups={data.groups} />,
    other: () => <div className="hidden lg:block"><OtherCard blocks={data.other} now={now} /></div>,
  };
  const render = (ids: SectionId[]) => ids.map((id) => <Fragment key={id}>{cards[id]()}</Fragment>);
  const showOther = !layout.hidden.includes('other');

  return (
    <Page wide>
      <PageHeader
        eyebrow={capital(fmtLongDate(now))}
        title={firstName ? `${greeting(now)}, ${firstName}` : greeting(now)}
        description={summary(data, now)}
        actions={
          !customizing && (
            <Button variant="ghost" size="sm" onClick={() => setCustomizing(true)} className="text-fg-subtle">
              <SlidersHorizontal /> Tilpas
            </Button>
          )
        }
      />
      {customizing && (
        <CustomizePanel
          layout={layout}
          isDefault={isDefault}
          onMove={(id, dir) => change((l) => moveSection(l, id, dir))}
          onToggle={(id) => change((l) => toggleSection(l, id))}
          onReset={reset}
          onDone={() => setCustomizing(false)}
          onAddCountdown={pinned.add}
        />
      )}
      <Layout
        hero={render(columnSections(layout, 'hero'))}
        side={render(columnSections(layout, 'side'))}
        main={
          <>
            {render(columnSections(layout, 'main'))}
            {showOther && <div className="lg:hidden"><OtherCard blocks={data.other} now={now} /></div>}
          </>
        }
      />
    </Page>
  );
}
