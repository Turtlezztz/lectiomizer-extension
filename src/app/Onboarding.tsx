import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, ExternalLink, LogIn, Search } from 'lucide-react';
import { fetchSchools } from '@/lib/lectio/schools';
import { loginUrl } from '@/lib/lectio/paths';
import { useSettings, type School } from '@/lib/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { extApi, isExtension } from '@/lib/storage';

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60rem_30rem_at_50%_-10%,var(--color-accent-soft),transparent)]" />
      <div className="relative w-full max-w-[440px] animate-in">{children}</div>
    </div>
  );
}

export function SchoolPicker() {
  const { update } = useSettings();
  const [q, setQ] = useState('');
  const schools = useQuery({ queryKey: ['schools'], queryFn: fetchSchools, staleTime: Infinity });
  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('da');
    return (schools.data ?? []).filter((s) => !needle || s.name.toLocaleLowerCase('da').includes(needle)).slice(0, 60);
  }, [schools.data, q]);
  return (
    <Frame>
      <div className="mb-6 text-center">
        <h1 className="text-[28px] font-semibold tracking-[-0.03em]">Velkommen til Lectiomizer</h1>
        <p className="mt-2 text-fg-muted">Et hurtigere og pænere Lectio. Vælg din skole for at komme i gang.</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
        <div className="relative border-b border-border p-3">
          <Search className="absolute top-1/2 left-6 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input autoFocus placeholder="Søg efter skole…" value={q} onChange={(e) => setQ(e.target.value)} className="h-10 pl-9" />
        </div>
        <div className="max-h-[360px] overflow-y-auto p-1.5">
          {schools.isPending && <div className="space-y-2 p-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-8" />)}</div>}
          {schools.isError && <p className="p-4 text-sm text-danger">Kunne ikke hente skolelisten fra Lectio.</p>}
          {filtered.map((s) => (
            <button key={s.id} type="button" onClick={() => update({ school: s })} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2">
              <span className="truncate">{s.name}</span>
              <ArrowRight className="size-4 text-fg-subtle" />
            </button>
          ))}
        </div>
      </div>
    </Frame>
  );
}

export function LoginGate({ school }: { school: School }) {
  const { update } = useSettings();
  const client = useQueryClient();
  const [opened, setOpened] = useState(false);
  const open = () => {
    setOpened(true);
    if (isExtension) extApi.runtime.sendMessage({ type: 'open-login', url: loginUrl(school.id) });
    else window.open(loginUrl(school.id), '_blank');
  };
  return (
    <Frame>
      <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-pop">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-fg">
          <LogIn className="size-5" />
        </div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Log ind på Lectio</h1>
        <p className="mt-2 text-[14px] text-fg-muted">
          Lectiomizer bruger dit eget Lectio-login hos <span className="font-medium text-fg">{school.name}</span>. Log ind i fanen der åbner – så kommer du automatisk tilbage hertil.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button variant="primary" size="lg" onClick={open}>
            Log ind med Lectio <ExternalLink />
          </Button>
          <Button variant="ghost" onClick={() => client.invalidateQueries()} className={cn(!opened && 'hidden')}>
            <Check /> Jeg er logget ind
          </Button>
          <button type="button" onClick={() => update({ school: null })} className="mt-2 text-[13px] text-fg-subtle hover:text-fg">
            Skift skole
          </button>
        </div>
      </div>
    </Frame>
  );
}
