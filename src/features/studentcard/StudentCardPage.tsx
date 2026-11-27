import { useEffect, useState } from 'react';
import { ExternalLink, IdCard, QrCode, UserRound } from 'lucide-react';
import { Page, PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useLectioPage, useSchoolId } from '@/lib/lectio/query';
import { PATHS, pageUrl } from '@/lib/lectio/paths';
import { readStudentCard } from '@/lib/lectio/readers/student.js';
import { cn } from '@/lib/cn';

export interface StudentCardData {
  name: string;
  school: string;
  birthday: string;
  photo: string | null;
  logo: string | null;
  qr: string | null;
  qrRefreshMs: number | null;
  stamp: string;
}

const read = readStudentCard as (doc: Document) => StudentCardData;

/** Lectio's QR code changes over time; load a fresh one as often as Lectio itself does. */
function useFreshUrl(url: string | null, ms: number | null) {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (!url) return;
    const id = setInterval(() => setTick(Date.now()), Math.max(10_000, ms ?? 36_000));
    return () => clearInterval(id);
  }, [url, ms]);
  if (!url) return null;
  const u = new URL(url);
  u.searchParams.set('t', String(tick));
  return u.href;
}

export default function StudentCardPage() {
  const school = useSchoolId();
  const { data: loaded, isPending, error, refetch } = useLectioPage(PATHS.studentCard, read, { staleTime: 0 });
  const lectioUrl = pageUrl(school, PATHS.studentCard);
  const card = loaded?.data;
  const [side, setSide] = useState<'photo' | 'qr'>('photo');
  const qr = useFreshUrl(card?.qr ?? null, card?.qrRefreshMs ?? null);
  const now = useClock();

  return (
    <Page>
      <PageHeader
        title="Studiekort"
        description="Dit digitale studiekort fra Lectio"
        actions={
          <Button variant="ghost" size="sm" asChild>
            <a href={lectioUrl} target="_blank" rel="noreferrer">
              <ExternalLink /> Åbn i Lectio
            </a>
          </Button>
        }
      />
      {isPending ? (
        <Skeleton className="mx-auto aspect-[1.586] w-full max-w-md rounded-2xl" />
      ) : error ? (
        <Card>
          <ErrorState error={error} onRetry={() => refetch()} href={lectioUrl} />
        </Card>
      ) : card ? (
        <div className="mx-auto max-w-md space-y-4">
          <div className="relative overflow-hidden rounded-2xl bg-accent p-5 text-accent-fg shadow-lg">
            <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full bg-white/10" />
            <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 size-56 rounded-full bg-black/10" />
            <div className="relative flex items-start justify-between gap-3">
              <span className="text-[12px] font-semibold tracking-[0.2em] opacity-85">STUDIEKORT</span>
              {card.logo && <img src={card.logo} alt="" className="h-8 max-w-28 object-contain" />}
            </div>
            <div className="relative mt-4 flex items-end gap-4">
              <div className="flex aspect-[3/4] w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-md">
                {side === 'qr' ? (
                  qr ? <img src={qr} alt="QR-kode til studiekortet" className="size-full object-contain p-1.5" /> : <QrCode className="size-10 text-black/30" />
                ) : card.photo ? (
                  <img src={card.photo} alt={`Billede af ${card.name}`} className="size-full object-cover" />
                ) : (
                  <UserRound className="size-10 text-black/30" />
                )}
              </div>
              <div className="min-w-0 pb-1">
                <div className="text-[19px] leading-tight font-semibold tracking-[-0.015em] break-words">{card.name}</div>
                <div className="mt-1 text-[13px] opacity-90">{card.school}</div>
                {card.birthday && <div className="mt-2 text-[12.5px] opacity-85">Født {card.birthday}</div>}
              </div>
            </div>
            <div className="relative mt-4 flex items-center justify-between text-[11.5px] tabular-nums opacity-80">
              <span>Lectio</span>
              <span>{now.toLocaleString('da-DK', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </div>
          </div>
          <div className="flex justify-center">
            <Segmented
              value={side}
              onChange={setSide}
              options={[
                { value: 'photo', label: <><IdCard className="size-3.5" /> Billede</> },
                { value: 'qr', label: <><QrCode className="size-3.5" /> QR-kode</> },
              ]}
            />
          </div>
          <p className={cn('text-center text-[12.5px] text-fg-muted')}>
            Uret på kortet går, så det kan ses, at det ikke er et skærmbillede. QR-koden hentes på ny fra Lectio med jævne mellemrum.
          </p>
        </div>
      ) : null}
    </Page>
  );
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
