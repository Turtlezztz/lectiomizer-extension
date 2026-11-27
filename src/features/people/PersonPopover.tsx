// Click a student's or teacher's name anywhere in the app: a card with their
// photo (click to enlarge), class/initials, what they are doing right now,
// today's schedule, their holds and shortcuts to their page and a message.
import { Fragment, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { CalendarClock, CalendarDays, ExternalLink, Mail, MapPin, Maximize2, Minimize2 } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { appRoute, pageUrl } from '@/lib/lectio/paths';
import { useSchoolId } from '@/lib/lectio/query';
import { subjectColor } from '@/lib/subjects';
import { cn } from '@/lib/cn';
import { useNow } from '@/features/schedule/hooks';
import { DayStrip } from '@/features/schedule/DayStrip';
import { holdsOf, nowStatus, parseRef, usePerson, type PersonRef } from './person';
import { schedulePath } from './directory';
import { CardPopover } from './CardPopover';

/**
 * A clickable name (or avatar). Safe inside links and buttons: the click opens
 * the card instead of following the row it sits in.
 */
export function Person({ person, children, className, title }: { person: PersonRef; children?: ReactNode; className?: string; title?: string }) {
  const label = parseRef(person).name || person.name || person.full || '';
  return (
    <CardPopover label={label} title={title} className={className} trigger={children ?? label}>
      {(close) => <PersonCard person={person} onNavigate={close} />}
    </CardPopover>
  );
}

/** "Lene Madsen (lm), Per Hansen (ph)" as separate clickable names. */
export function People({ names, kind, short, className }: { names: string[]; kind?: PersonRef['kind']; short?: boolean; className?: string }) {
  return (
    <>
      {names.map((full, i) => {
        const p = parseRef({ full, kind });
        return (
          <Fragment key={full + i}>
            {i > 0 && ', '}
            <Person person={{ full, kind }} className={className}>
              {short ? p.code || p.name : p.name || p.code}
            </Person>
          </Fragment>
        );
      })}
    </>
  );
}

function PersonCard({ person, onNavigate }: { person: PersonRef; onNavigate: () => void }) {
  const school = useSchoolId();
  const now = useNow();
  const [big, setBig] = useState(false);
  const p = usePerson(person, true, now);
  const profile = p.profile.data;
  const entry = p.entry;
  const name = p.parsed.name || profile?.name || entry?.name || p.parsed.code;
  const kind = p.kind;
  const photo = profile?.photo ?? null;
  const loadingCard = p.resolving || (!!p.cardId && p.profile.isPending);

  const detail = (re: RegExp) => profile?.details.find((d) => re.test(d.label))?.value || '';
  const className = entry?.kind === 'elev' ? entry.code : detail(/^(stam)?klasse$/i) || (kind === 'elev' ? p.parsed.code.split(' ')[0] : '');
  const number = entry?.number || (kind === 'elev' ? p.parsed.code.split(' ')[1] || '' : '');
  const initials = kind === 'laerer' ? entry?.code || detail(/^initialer$/i) || p.parsed.code : '';
  const role = profile?.role || (kind === 'elev' ? 'Elev' : kind === 'laerer' ? 'Lærer' : '');
  const extra = (profile?.details ?? []).filter((d) => !/^(hold|klasse|stamklasse|initialer|billede|foto)$/i.test(d.label)).slice(0, 4);
  const holds = holdsOf(profile, p.week.data);
  const route = p.target ? `/${p.target.kind === 'elev' ? 'students' : 'teachers'}/${encodeURIComponent(p.target.id)}` : null;
  const lectio = p.target ? pageUrl(school, schedulePath(p.target.kind, p.target.id)) : null;

  return (
    <div>
      {big && photo && (
        <button type="button" onClick={() => setBig(false)} aria-label="Formindsk billedet" className="group relative block w-full bg-surface-2">
          <img src={photo} alt={name ? `Billede af ${name}` : ''} className="mx-auto max-h-[min(440px,60vh)] w-full object-contain" />
          <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Minimize2 className="size-3.5" />
          </span>
        </button>
      )}

      <div className="flex gap-4 p-4">
        {!big &&
          (photo ? (
            <button
              type="button"
              onClick={() => setBig(true)}
              aria-label="Forstør billedet"
              className="group relative h-[120px] w-24 shrink-0 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border"
            >
              <img src={photo} alt={name ? `Billede af ${name}` : ''} className="size-full object-cover object-top transition-transform duration-200 group-hover:scale-[1.04]" />
              <span className="absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Maximize2 className="size-3" />
              </span>
            </button>
          ) : loadingCard ? (
            <Skeleton className="h-[120px] w-24 shrink-0 rounded-xl" />
          ) : (
            <Avatar name={name || '?'} size={72} className="mt-1" />
          ))}
        <div className="min-w-0 flex-1 py-0.5">
          {role && <div className="mb-0.5 text-[12px] font-medium text-fg-subtle">{role}</div>}
          {name ? <h3 className="text-[17px] leading-snug font-semibold tracking-[-0.015em] break-words text-fg">{name}</h3> : <Skeleton className="h-5 w-40" />}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {className && (
              <Badge tone="outline">
                Klasse {className}
                {number && ` · nr. ${number}`}
              </Badge>
            )}
            {initials && <Badge tone="outline">Initialer {initials}</Badge>}
          </div>
          {extra.length > 0 && (
            <dl className="mt-2 space-y-0.5 text-[12px]">
              {extra.map((d) => (
                <div key={d.label + d.value} className="flex gap-1.5">
                  <dt className="shrink-0 text-fg-subtle">{d.label}</dt>
                  <dd className="min-w-0 truncate text-fg-muted" title={d.value}>
                    {d.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      <div className="space-y-3 px-4 pb-4">
        {loadingCard && !p.found ? (
          <Skeleton className="h-[68px] w-full rounded-xl" />
        ) : !p.found ? (
          <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-[12.5px] text-fg-muted">
            Lectio viste ikke {name ? `${name}s` : 'personens'} skema, så det kan ikke ses, hvad {name ? 'de' : 'personen'} laver nu.
          </p>
        ) : (
          <NowBox week={p.week} now={now} onNavigate={onNavigate} />
        )}

        {holds.length > 0 && (
          <section>
            <h4 className="mb-1.5 text-[12px] font-medium text-fg-subtle">Hold</h4>
            <HoldChips holds={holds} />
          </section>
        )}
      </div>

      {(route || p.cardId) && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border bg-surface-2/50 px-3 py-2.5">
          {route && (
            <Button size="sm" variant="secondary" asChild>
              <Link to={route} onClick={onNavigate}>
                <CalendarDays /> Profil og skema
              </Link>
            </Button>
          )}
          {p.cardId && (
            <Button size="sm" variant="ghost" asChild>
              <Link to={`/messages/new?til=${encodeURIComponent(p.cardId)}`} onClick={onNavigate}>
                <Mail /> Send besked
              </Link>
            </Button>
          )}
          {lectio && (
            <Button size="icon-sm" variant="ghost" asChild className="ml-auto">
              <a href={lectio} target="_blank" rel="noreferrer" aria-label="Åbn i Lectio" title="Åbn i Lectio">
                <ExternalLink />
              </a>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function NowBox({ week, now, onNavigate }: { week: ReturnType<typeof usePerson>['week']; now: Date; onNavigate: () => void }) {
  if (week.isPending) return <Skeleton className="h-[68px] w-full rounded-xl" />;
  if (week.error || !week.data) return <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-[12.5px] text-fg-muted">Skemaet kunne ikke hentes fra Lectio.</p>;
  const s = nowStatus(week.data, now, 'elev');
  const lessonRoute = s.lesson ? appRoute(s.lesson.href) : null;
  const sub = s.sub && (
    <span className="flex min-w-0 items-center gap-1 text-[12.5px] text-fg-muted">
      {s.busy && <MapPin className="size-3 shrink-0" />}
      <span className="truncate">{s.sub}</span>
    </span>
  );
  return (
    <div className={cn('rounded-xl border px-3 py-2.5', s.busy ? 'border-danger/25 bg-danger-soft/60' : 'border-success/25 bg-success-soft/60')}>
      <div className="flex items-center gap-2 text-[13.5px] font-semibold text-fg">
        <CalendarClock className={cn('size-4 shrink-0', s.busy ? 'text-danger' : 'text-success')} />
        {s.title}
      </div>
      {sub &&
        (lessonRoute ? (
          <Link to={lessonRoute} onClick={onNavigate} className="mt-0.5 block hover:underline">
            {sub}
          </Link>
        ) : (
          <div className="mt-0.5">{sub}</div>
        ))}
      <DayStrip lessons={s.today} at={now} className="mt-2" />
    </div>
  );
}

const MAX_HOLDS = 14;

function HoldChips({ holds }: { holds: string[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? holds : holds.slice(0, MAX_HOLDS);
  return (
    <ul className="flex flex-wrap gap-1">
      {shown.map((h) => {
        const c = subjectColor(h);
        return (
          <li key={h} className="inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-[11.5px] font-medium" style={{ background: c.bg, color: c.fg }}>
            <span aria-hidden className="size-1.5 rounded-full" style={{ background: c.bar }} />
            {h}
          </li>
        );
      })}
      {!all && holds.length > MAX_HOLDS && (
        <li>
          <button type="button" onClick={() => setAll(true)} className="h-[22px] rounded-full px-2 text-[11.5px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg">
            +{holds.length - MAX_HOLDS} mere
          </button>
        </li>
      )}
    </ul>
  );
}
