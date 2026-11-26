import { useState } from 'react';
import { ChevronRight, LoaderCircle, UserPlus, Users, X } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { displayName, type AssignmentData } from './model';
import { InlineError } from './parts';

type Group = NonNullable<AssignmentData['group']>;
type Mutate = (input: { element?: Element | null; fields?: Record<string, string> }) => Promise<unknown>;

/** Who hands in together. Add/remove are Lectio postbacks; the list re-renders from Lectio's answer. */
export function GroupCard({ group, mutate, pending, error, busy }: { group: Group; mutate: Mutate; pending: boolean; error: unknown; busy: boolean }) {
  const [choice, setChoice] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [working, setWorking] = useState<{ kind: 'add' | 'remove'; key: string; name: string } | null>(null);
  const { members, add } = group;

  const run = async (next: NonNullable<typeof working>, input: Parameters<Mutate>[0]) => {
    setWorking(next);
    try {
      await mutate(input);
      if (next.kind === 'add') setChoice('');
    } catch {
      /* shown via `error` */
    } finally {
      setWorking(null);
      setConfirming(null);
    }
  };

  const addMember = () => {
    const option = add?.options.find((o) => o.value === choice);
    const name = add?.select.getAttribute('name');
    if (!add || !option || !name) return;
    run({ kind: 'add', key: option.value, name: displayName(option.label) }, { element: add.button, fields: { [name]: option.value } });
  };

  return (
    <Card>
      <CardHeader icon={<Users />} title="Gruppe" action={<Badge tone="neutral" className="tabular-nums">{members.length}</Badge>} />
      <CardBody className="space-y-4">
        <ul className="space-y-1">
          {members.map((m) => {
            const key = m.id || m.full;
            const removing = working?.kind === 'remove' && working.key === key;
            return (
              <li key={key} className={cn('flex items-center gap-3 rounded-lg px-1.5 py-1.5 transition-opacity', removing && 'opacity-50')}>
                <Avatar name={m.name} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-fg" title={m.full}>{m.name}</div>
                  <div className="truncate text-[12px] text-fg-subtle">{[m.me && 'Dig', m.className].filter(Boolean).join(' · ')}</div>
                </div>
                {m.remove &&
                  (confirming === key ? (
                    <div className="flex items-center gap-1 animate-in">
                      <Button variant="danger" size="sm" disabled={busy} onClick={() => run({ kind: 'remove', key, name: m.name }, { element: m.remove })}>
                        {removing ? <LoaderCircle className="animate-spin" /> : null} Fjern
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Fortryd" disabled={busy} onClick={() => setConfirming(null)}>
                        <X />
                      </Button>
                    </div>
                  ) : (
                    <Button variant="ghost" size="icon-sm" aria-label={`Fjern ${m.name} fra gruppen`} title="Fjern fra gruppen" disabled={busy} onClick={() => setConfirming(key)}>
                      <X />
                    </Button>
                  ))}
              </li>
            );
          })}
          {working?.kind === 'add' && (
            <li role="status" className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 opacity-70 animate-in">
              <Avatar name={working.name} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium text-fg">{working.name}</div>
                <div className="flex items-center gap-1 text-[12px] text-fg-subtle"><LoaderCircle className="size-3 animate-spin" /> Tilføjer…</div>
              </div>
            </li>
          )}
        </ul>

        {add && members.length <= 1 && !working && <p className="text-[12.5px] text-fg-muted">Du afleverer alene, indtil du tilføjer dem, du skal aflevere sammen med.</p>}

        {add &&
          (add.options.length ? (
            <div className="space-y-1.5 border-t border-border pt-4">
              <label htmlFor="group-add" className="text-[12.5px] font-medium text-fg-muted">Tilføj til gruppen</label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <select
                    id="group-add"
                    value={choice}
                    disabled={busy}
                    onChange={(e) => setChoice(e.target.value)}
                    className="h-9 w-full appearance-none truncate rounded-lg border border-border bg-surface pr-8 pl-3 text-sm text-fg outline-none hover:border-border-strong focus:border-accent focus:ring-3 focus:ring-accent/15 disabled:opacity-60"
                  >
                    <option value="">Vælg elev…</option>
                    {add.options.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <ChevronRight className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 rotate-90 text-fg-subtle" />
                </div>
                <Button disabled={!choice || busy} onClick={addMember}>
                  {working?.kind === 'add' ? <LoaderCircle className="animate-spin" /> : <UserPlus />} Tilføj
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-[12.5px] text-fg-subtle">Der er ikke flere elever, du kan tilføje.</p>
          ))}

        {!pending && <InlineError error={error} />}
      </CardBody>
    </Card>
  );
}
