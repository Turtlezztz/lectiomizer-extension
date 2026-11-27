import { useMemo, useState, type ReactNode } from 'react';
import {
  Check,
  ChevronDown,
  EyeOff,
  Flag,
  Folder as FolderIcon,
  Inbox,
  MailCheck,
  MailOpen,
  MoreHorizontal,
  Paperclip,
  Search,
  Send,
  SquarePen,
  User,
  Users,
  X,
} from 'lucide-react';
import { useLectioAction, type Loaded } from '@/lib/lectio/query';
import { personName } from '@/lib/lectio/readers/thread.js';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import { fieldName, read } from './data';
import { rowMatches, threadIdOf } from './model';
import { InlineError, Menu, MenuContent, MenuItem, MenuTrigger, MenuSeparator, PersonAvatar, errorText } from './parts';
import type { Folder, MessageRow, MessagesData } from './types';
import { Person } from '@/features/people/PersonPopover';

const FOLDER_ICONS: Record<string, typeof Inbox> = {
  '-40': MailOpen,
  '-50': Flag,
  '-70': Inbox,
  '-10': User,
  '-80': Send,
  '-20': Users,
};
export const folderIcon = (f: Folder) => FOLDER_ICONS[f.id] || FolderIcon;

/** The folder rail (wide screens). */
export function FolderRail({
  folders,
  current,
  onSelect,
  onCompose,
  className,
}: {
  folders: Folder[];
  current: string | null;
  onSelect: (id: string) => void;
  onCompose: () => void;
  className?: string;
}) {
  return (
    <nav aria-label="Mapper" className={cn('w-[212px] shrink-0 flex-col gap-1 border-r border-border bg-surface-2/40 px-3 py-4', className)}>
      <Button variant="primary" className="mb-3 w-full justify-start" onClick={onCompose}>
        <SquarePen /> Ny besked
      </Button>
      <div className="px-2.5 pb-1 text-[11.5px] font-medium tracking-wide text-fg-subtle uppercase">Mapper</div>
      {folders.length === 0 && Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="mx-2.5 my-2 h-4 w-3/4" />)}
      {folders.map((f) => {
        const Icon = folderIcon(f);
        const active = f.id === current;
        return (
          <button
            key={f.id}
            type="button"
            title={f.title || f.label}
            onClick={() => onSelect(f.id)}
            aria-current={active ? 'page' : undefined}
            style={{ paddingLeft: 10 + f.depth * 14 }}
            className={cn(
              'flex h-8 items-center gap-2.5 rounded-lg pr-2.5 text-left text-[13.5px] transition-colors',
              active ? 'bg-surface font-medium text-fg shadow-card ring-1 ring-border' : 'text-fg-muted hover:bg-surface-3/60 hover:text-fg',
            )}
          >
            <Icon className={cn('size-4 shrink-0', active ? 'text-accent' : 'text-fg-subtle')} />
            <span className="truncate">{f.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** The folder switcher above the list (narrower screens). */
function FolderMenu({ folders, current, label, onSelect }: { folders: Folder[]; current: string | null; label: string; onSelect: (id: string) => void }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          className="-ml-1.5 flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-left hover:bg-surface-2"
          aria-label={`Mappe: ${label}. Skift mappe`}
        >
          <h1 className="truncate text-[19px] font-semibold tracking-[-0.02em] text-fg">{label}</h1>
          <ChevronDown className="size-4 shrink-0 text-fg-subtle" />
        </button>
      </MenuTrigger>
      <MenuContent align="start">
        {folders.map((f) => {
          const Icon = folderIcon(f);
          return (
            <MenuItem key={f.id} onSelect={() => onSelect(f.id)}>
              <span style={{ width: f.depth * 14 }} className="shrink-0" />
              <Icon />
              <span className="flex-1 truncate">{f.label}</span>
              {f.id === current && <Check className="text-accent!" />}
            </MenuItem>
          );
        })}
      </MenuContent>
    </Menu>
  );
}

function Row({ row, active, read: wasRead, onOpen }: { row: MessageRow; active: boolean; read: boolean; onOpen: () => void }) {
  const unread = row.unread && !wasRead;
  const name = personName(row.sender) || row.sender || 'Ukendt';
  const meta = row.starter && personName(row.starter) !== name ? `Startet af ${personName(row.starter)}` : row.recipients ? `Til ${row.recipients}` : '';
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'group relative flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
          active ? 'bg-accent-soft/70 ring-1 ring-accent/20' : 'hover:bg-surface-2',
        )}
      >
        <span
          className={cn('absolute top-1/2 left-1 size-1.5 -translate-y-1/2 rounded-full bg-accent transition-opacity', unread ? 'opacity-100' : 'opacity-0')}
          aria-hidden
        />
        <PersonAvatar name={name} size={36} className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              className={cn('min-w-0 flex-1 truncate text-[13.5px]', unread ? 'font-semibold text-fg' : 'font-medium text-fg')}
              title={row.senderTitle || row.sender}
            >
              <Person person={{ name, full: row.senderTitle || row.sender }}>{name}</Person>
            </span>
            <span className={cn('shrink-0 text-[12px] tabular-nums', unread ? 'font-medium text-accent-soft-fg' : 'text-fg-subtle')}>{row.changed}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <span className={cn('min-w-0 flex-1 truncate text-[13px]', unread ? 'font-semibold text-fg' : 'text-fg-muted')}>
              {row.subject || '(intet emne)'}
            </span>
            {row.attachment && <Paperclip className="size-3.5 shrink-0 text-fg-subtle" aria-label="Vedhæftet fil" />}
            {row.flagged && <Flag className="size-3.5 shrink-0 fill-warning text-warning" aria-label="Flag" />}
            {unread && <span className="sr-only">Ulæst</span>}
          </span>
          {meta && (
            <span className="mt-0.5 block truncate text-[12px] text-fg-subtle" title={row.recipientsTitle || undefined}>
              {meta}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-1 px-2 py-1" aria-busy="true" aria-label="Indlæser beskeder">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex gap-3 px-3 py-2.5">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-1.5 pt-0.5">
            <div className="flex justify-between gap-6">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MessageList({
  query: q,
  folders,
  currentFolder,
  folderLabel,
  activeId,
  readIds,
  notice,
  onOpen,
  onFolder,
  onCompose,
  lectioHref,
}: {
  query: {
    data?: Loaded<MessagesData>;
    isPending: boolean;
    error: unknown;
    refetch: () => void;
  };
  folders: Folder[];
  currentFolder: string | null;
  folderLabel: string;
  activeId: string | null;
  readIds: Set<string>;
  notice?: ReactNode;
  onOpen: (id: string) => void;
  onFolder: (id: string) => void;
  onCompose: () => void;
  lectioHref: string;
}) {
  const loaded = q.data;
  const data = loaded?.data;
  const action = useLectioAction(loaded, read);
  const [filter, setFilter] = useState('');
  const rows = useMemo(() => (data?.messages || []).map((row, i) => ({ row, id: threadIdOf(row, i) })), [data]);
  const visible = rows.filter(({ row }) => rowMatches(row, filter));
  const unread = rows.filter(({ row, id }) => row.unread && !readIds.has(id)).length;
  const actions = data?.actions;

  // Enter searches all of Lectio's messages, not only the loaded list.
  const searchLectio = () => {
    if (!actions?.search || !actions.searchButton || !filter.trim()) return;
    action.mutate({
      element: actions.searchButton,
      fields: { [fieldName(actions.search)]: filter.trim() },
    });
  };

  return (
    <>
      <header className="flex flex-col gap-3 border-b border-border px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="xl:hidden">
              <FolderMenu folders={folders} current={currentFolder} label={folderLabel} onSelect={onFolder} />
            </div>
            <h1 className="hidden truncate text-[19px] font-semibold tracking-[-0.02em] text-fg xl:block">{folderLabel}</h1>
            <p className="text-[12.5px] text-fg-subtle tabular-nums">
              {q.isPending ? 'Henter …' : unread ? `${unread} ulæste · ${rows.length} tråde` : `${rows.length} tråde`}
            </p>
          </div>
          <Button variant="primary" size="sm" className="xl:hidden" onClick={onCompose} aria-label="Ny besked">
            <SquarePen /> <span className="max-sm:hidden">Ny besked</span>
          </Button>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Flere handlinger" disabled={!data || action.isPending}>
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuItem disabled={!actions?.markAllRead} onSelect={() => action.mutate({ element: actions?.markAllRead })}>
                <MailCheck /> Markér alle som læst
              </MenuItem>
              <MenuItem disabled={!actions?.toggleDeleted} onSelect={() => action.mutate({ element: actions?.toggleDeleted })}>
                <EyeOff /> Vis/skjul slettede
              </MenuItem>
              <MenuSeparator />
              <MenuItem asChild>
                <a href={lectioHref} target="_blank" rel="noreferrer">
                  <Inbox /> Åbn i Lectio
                </a>
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
        <form
          role="search"
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            searchLectio();
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setFilter('')}
            placeholder="Søg i beskeder"
            aria-label="Søg i beskeder"
            className="h-8 w-full rounded-lg border border-transparent bg-surface-3/60 pr-8 pl-8 text-[13px] text-fg outline-none placeholder:text-fg-subtle focus:border-accent focus:bg-surface focus:ring-3 focus:ring-accent/15 [&::-webkit-search-cancel-button]:hidden"
          />
          {filter && (
            <button
              type="button"
              aria-label="Ryd søgning"
              onClick={() => setFilter('')}
              className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-fg-subtle hover:bg-surface-3 hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          )}
        </form>
        {notice}
        {action.error && (
          <InlineError>
            <span className="flex items-start gap-2">
              <span className="flex-1">{errorText(action.error)}</span>
              <button type="button" className="font-medium underline" onClick={() => action.reset()}>
                OK
              </button>
            </span>
          </InlineError>
        )}
      </header>
      <div className={cn('min-h-0 flex-1 overflow-y-auto transition-opacity', action.isPending && 'pointer-events-none opacity-60')}>
        {q.isPending ? (
          <ListSkeleton />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={q.refetch} href={lectioHref} />
        ) : !rows.length ? (
          <EmptyState icon={<Inbox />} title="Ingen beskeder" description="Der er ingen tråde i denne mappe." />
        ) : !visible.length ? (
          <EmptyState
            icon={<Search />}
            title="Ingen tråde matcher"
            description={`Ingen af de viste tråde matcher „${filter.trim()}“.`}
            action={
              actions?.searchButton ? (
                <Button size="sm" onClick={searchLectio}>
                  <Search /> Søg i alle beskeder
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="space-y-0.5 p-2" aria-label="Tråde">
            {visible.map(({ row, id }) => (
              <Row key={id} row={row} active={id === activeId} read={readIds.has(id)} onOpen={() => onOpen(id)} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
