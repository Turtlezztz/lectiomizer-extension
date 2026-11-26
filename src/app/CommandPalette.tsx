import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Dialog } from 'radix-ui';
import { CornerDownLeft, Search } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/cn';
import { appRoute } from '@/lib/lectio/paths';
import { NAV, NAV_SCHOOL } from './Shell';

interface Item {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
}

/** Collect searchable things already loaded into the query cache (assignments, messages…). */
function cachedItems(client: ReturnType<typeof useQueryClient>, go: (to: string) => void): Item[] {
  const out: Item[] = [];
  for (const query of client.getQueryCache().getAll()) {
    if (query.queryKey[0] === 'lectio-directory' && Array.isArray(query.state.data)) {
      const kind = query.queryKey[2] as string;
      const [group, base] = kind === 'elev' ? ['Elever', '/students'] : kind === 'laerer' ? ['Lærere', '/teachers'] : ['Lokaler', '/rooms'];
      for (const e of query.state.data as Array<{ id: string; name: string; label: string; code: string }>) {
        out.push({ id: `${kind}${e.id}`, label: kind === 'lokale' ? e.label : e.name, hint: e.code || undefined, group, run: () => go(`${base}/${encodeURIComponent(e.id)}`) });
      }
      continue;
    }
    const data = (query.state.data as any)?.data;
    if (!data) continue;
    for (const a of data.assignments ?? []) {
      const id = a.href && new URL(a.href).searchParams.get('exerciseid');
      const route = appRoute(a.href);
      if (id && route && a.title) out.push({ id: `a${id}`, label: a.title, hint: a.hold, group: 'Opgaver', run: () => go(route) });
    }
    for (const m of data.messages ?? []) {
      const id = m.href && new URL(m.href).searchParams.get('id');
      if (id && m.subject) out.push({ id: `m${id}`, label: m.subject, hint: m.sender, group: 'Beskeder', run: () => go(`/messages/${id}`) });
    }
  }
  const seen = new Set<string>();
  return out.filter((i) => !seen.has(i.id) && !!seen.add(i.id));
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };
  const items = useMemo(() => {
    if (!open) return [];
    const nav: Item[] = [...NAV, ...NAV_SCHOOL].map((n) => ({ id: n.to, label: n.label, group: 'Gå til', run: () => go(n.to) }));
    const all = [...nav, ...cachedItems(client, go)];
    const needle = q.trim().toLocaleLowerCase('da');
    return (needle ? all.filter((i) => `${i.label} ${i.hint ?? ''}`.toLocaleLowerCase('da').includes(needle)) : all).slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q, client]);
  useEffect(() => {
    setActive(0);
  }, [q, open]);
  useEffect(() => {
    if (!open) setQ('');
  }, [open]);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const groups = items.reduce<Record<string, Item[]>>((acc, i) => ((acc[i.group] ||= []).push(i), acc), {});
  let index = -1;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px] animate-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 w-[min(600px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-pop animate-pop"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === 'Enter') { e.preventDefault(); items[active]?.run(); }
          }}
        >
          <Dialog.Title className="sr-only">Søg</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-[18px] text-fg-subtle" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg i sider, opgaver og beskeder…" className="h-13 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-subtle" />
            <kbd className="rounded border border-border px-1.5 text-[11px] text-fg-subtle">Esc</kbd>
          </div>
          <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
            {!items.length && <p className="px-3 py-8 text-center text-sm text-fg-muted">Ingen resultater</p>}
            {Object.entries(groups).map(([group, list]) => (
              <div key={group} className="mb-1">
                <div className="px-3 pt-2 pb-1 text-[11.5px] font-medium tracking-wide text-fg-subtle uppercase">{group}</div>
                {list.map((item) => {
                  index++;
                  const i = index;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-active={i === active}
                      onMouseMove={() => setActive(i)}
                      onClick={item.run}
                      className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm', i === active ? 'bg-surface-3 text-fg' : 'text-fg-muted')}
                    >
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.hint && <span className="truncate text-[12.5px] text-fg-subtle">{item.hint}</span>}
                      {i === active && <CornerDownLeft className="size-3.5 text-fg-subtle" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
