import { Link, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, Columns2, DoorOpen, ExternalLink, MapPin, Star, UserRound, Users } from 'lucide-react';
import { Page } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { pageUrl } from '@/lib/lectio/paths';
import { useSchoolId } from '@/lib/lectio/query';
import { canGoBack, useBack } from '@/lib/nav';
import { cn } from '@/lib/cn';
import { WeekSchedule } from '@/features/schedule/SchedulePage';
import { useNow } from '@/features/schedule/hooks';
import { useWeekLessons } from '@/features/schedule/week-lessons';
import { DayStrip } from '@/features/schedule/DayStrip';
import { cardIdOf, schedulePath, type DirectoryEntry, type DirectoryKind } from './directory';
import { nowStatus, useProfile } from './person';
import { useFavorites } from './favorites';

const META: Record<DirectoryKind, { list: string; listLabel: string; noun: string }> = {
  elev: { list: '/students', listLabel: 'Elever', noun: 'eleven' },
  laerer: { list: '/teachers', listLabel: 'Lærere', noun: 'læreren' },
  lokale: { list: '/rooms', listLabel: 'Lokaler', noun: 'lokalet' },
};

/** The entry from an already-loaded directory list (no extra request when opened directly). */
function useCachedEntry(kind: DirectoryKind, id: string): DirectoryEntry | undefined {
  const school = useSchoolId();
  const client = useQueryClient();
  return client.getQueryData<DirectoryEntry[]>(['lectio-directory', school, kind])?.find((e) => e.id === id);
}

export default function DirectoryDetailPage({ kind }: { kind: DirectoryKind }) {
  const { id = '' } = useParams();
  const school = useSchoolId();
  const meta = META[kind];
  const back = useBack(meta.list);
  const entry = useCachedEntry(kind, id);
  const cardId = cardIdOf(kind, id);
  const profile = useProfile(cardId);
  const base = schedulePath(kind, id);
  const name = entry?.name || profile.data?.name || (kind === 'lokale' ? 'Lokale' : '');
  const code = entry?.code || '';
  const details = (profile.data?.details ?? []).filter((d) => !/^(billede|foto)$/i.test(d.label)).slice(0, 4);
  const favorites = useFavorites();
  const person = kind === 'elev' || kind === 'laerer' ? kind : null;
  const starred = !!person && favorites.has(person, id);

  return (
    <Page wide>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2.5 text-fg-muted">
          <Link to={meta.list} onClick={back}>
            <ArrowLeft /> {canGoBack() ? 'Tilbage' : meta.listLabel}
          </Link>
        </Button>
        <div className="flex items-center gap-1">
          {person && (
            <>
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={starred}
                disabled={!name}
                onClick={() => favorites.toggle({ kind: person, id, name, code })}
                title={starred ? 'Fjern fra favoritter' : 'Føj til favoritter, så de står øverst og kan sammenlignes med dit skema'}
              >
                <Star className={cn(starred && 'fill-current text-warning')} /> {starred ? 'Favorit' : 'Gør til favorit'}
              </Button>
              <Button variant="ghost" size="sm" asChild title="Se jeres skemaer side om side og hvornår I begge har fri">
                <Link to={`/schedule?med=${person}:${encodeURIComponent(id)}`}>
                  <Columns2 /> Sammenlign med mit skema
                </Link>
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" asChild>
            <a href={pageUrl(school, base)} target="_blank" rel="noreferrer">
              <ExternalLink /> Åbn i Lectio
            </a>
          </Button>
        </div>
      </div>

      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
          {kind === 'lokale' ? (
            <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-fg-muted">
              <DoorOpen className="size-7" />
            </span>
          ) : (
            <Avatar name={name || '?'} src={profile.data?.photo} size={64} />
          )}
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[12.5px] font-medium text-fg-subtle">{kind === 'elev' ? 'Elev' : kind === 'laerer' ? 'Lærer' : 'Lokale'}</div>
            {name ? (
              <h1 className="truncate text-[26px] leading-tight font-semibold tracking-[-0.025em] text-fg">{kind === 'lokale' ? entry?.label || name : name}</h1>
            ) : (
              <Skeleton className="h-8 w-56" />
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {code && (
                <Badge tone="outline">
                  {kind === 'elev' ? <Users /> : <UserRound />}
                  {kind === 'elev' ? `Klasse ${code}${entry?.number ? ` · nr. ${entry.number}` : ''}` : `Initialer ${code}`}
                </Badge>
              )}
              {details.map((d) => (
                <Badge key={d.label + d.value} tone="neutral" title={d.label}>
                  {d.label}: {d.value}
                </Badge>
              ))}
            </div>
          </div>
          <NowPanel base={base} kind={kind} />
        </div>
      </Card>

      <WeekSchedule
        base={base}
        eyebrow={`Skema for ${kind === 'lokale' ? entry?.label || 'lokalet' : name || meta.noun}`}
        emptyText={(week) => `Der er ikke noget på skemaet for ${meta.noun} i uge ${week}.`}
      />
    </Page>
  );
}

/** Where they are (or whether the room is in use) right now, plus today's bookings as a strip. */
function NowPanel({ base, kind }: { base: string; kind: DirectoryKind }) {
  const now = useNow();
  const week = useWeekLessons(base, now);
  if (week.isPending) return <Skeleton className="h-16 w-full rounded-xl sm:w-72" />;
  if (week.error || !week.data) return null;
  const { busy, title, sub, today } = nowStatus(week.data, now, kind);
  const isRoom = kind === 'lokale';
  return (
    <div className={cn('w-full shrink-0 rounded-xl border px-4 py-3 sm:w-72', busy ? 'border-danger/25 bg-danger-soft/60' : 'border-success/25 bg-success-soft/60')}>
      <div className="flex items-center gap-2 text-[13.5px] font-semibold text-fg">
        <CalendarClock className={cn('size-4', busy ? 'text-danger' : 'text-success')} />
        {title}
      </div>
      {sub && (
        <div className="mt-0.5 flex items-center gap-1 truncate text-[12.5px] text-fg-muted">
          {!isRoom && busy && <MapPin className="size-3 shrink-0" />}
          <span className="truncate">{sub}</span>
        </div>
      )}
      <DayStrip lessons={today} at={now} className="mt-2.5" />
    </div>
  );
}
