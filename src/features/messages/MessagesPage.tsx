// Beskeder: a three-pane mail app on wide screens (folders | threads | the open
// thread or a new message); on small screens the list and the thread are
// separate steps. /messages/:id opens a thread, /messages/new writes one.
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { CheckCircle2, MessagesSquare, SquarePen, X } from 'lucide-react';
import { useSchoolId } from '@/lib/lectio/query';
import { pageUrl } from '@/lib/lectio/paths';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import { useMessageList } from './data';
import { NEW_ID, composePath, listPath, threadPath } from './model';
import { FolderRail, MessageList } from './MessageList';
import { ThreadPane } from './ThreadPane';
import { ComposePane } from './ComposePane';

export default function MessagesPage() {
  const { id = null } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const school = useSchoolId();
  const folder = params.get('mappe');
  const to = params.get('til');
  const list = useMessageList(folder);
  const listUrl = pageUrl(school, listPath(folder));
  const data = list.data?.data;

  // Threads opened in this session show as read until Lectio's list is fetched again.
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (id && id !== NEW_ID) setReadIds((s) => (s.has(id) ? s : new Set(s).add(id)));
  }, [id]);

  const sent = (location.state as { sent?: boolean } | null)?.sent;
  const keep = folder ? `?mappe=${encodeURIComponent(folder)}` : '';
  const goList = (state?: object) => navigate(`/messages${keep}`, { state });
  const open = (threadId: string) => navigate(`/messages/${encodeURIComponent(threadId)}${keep}`);
  const compose = (recipient?: string) =>
    navigate(`/messages/${NEW_ID}${recipient ? `?til=${encodeURIComponent(recipient)}${folder ? `&mappe=${encodeURIComponent(folder)}` : ''}` : keep}`);
  const selectFolder = (next: string) => {
    const p = new URLSearchParams(params);
    p.set('mappe', next);
    p.delete('til');
    setParams(p);
    if (id && id !== NEW_ID) navigate(`/messages?${p}`);
  };

  const folders = data?.folders || [];
  const current = folder ?? folders.find((f) => f.current)?.id ?? folders.find((f) => f.label === data?.folder)?.id ?? null;
  const folderLabel = (folder && folders.find((f) => f.id === folder)?.label) || data?.folder || folders.find((f) => f.id === current)?.label || 'Beskeder';
  const detail = !!id;
  const composing = id === NEW_ID;

  const notice = sent ? (
    <p role="status" className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-[13px] text-success-soft-fg animate-in">
      <CheckCircle2 className="size-4 shrink-0" />
      <span className="flex-1">Beskeden er sendt.</span>
      <button
        type="button"
        aria-label="Luk"
        onClick={() =>
          navigate(location.pathname + location.search, {
            replace: true,
            state: null,
          })
        }
      >
        <X className="size-3.5" />
      </button>
    </p>
  ) : undefined;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 overflow-hidden md:h-dvh">
      <FolderRail className="hidden xl:flex" folders={folders} current={current} onSelect={selectFolder} onCompose={() => compose()} />
      <section
        aria-label="Tråde"
        className={cn(
          'min-h-0 min-w-0 flex-col border-border bg-bg lg:w-[340px] lg:shrink-0 lg:border-r xl:w-[360px]',
          detail ? 'hidden lg:flex' : 'flex flex-1 lg:flex-none',
        )}
      >
        <MessageList
          query={list}
          folders={folders}
          currentFolder={current}
          folderLabel={folderLabel}
          activeId={composing ? null : id}
          readIds={readIds}
          notice={notice}
          onOpen={open}
          onFolder={selectFolder}
          onCompose={() => compose()}
          lectioHref={listUrl}
        />
      </section>
      <section aria-label={composing ? 'Ny besked' : 'Tråd'} className={cn('min-h-0 min-w-0 flex-1 flex-col bg-bg', detail ? 'flex' : 'hidden lg:flex')}>
        {composing ? (
          <ComposePane
            key={to || ''}
            to={to}
            listUrl={listUrl}
            lectioHref={pageUrl(school, composePath(to))}
            onBack={() => goList()}
            onSent={() => goList({ sent: true })}
          />
        ) : id ? (
          <ThreadPane
            key={id}
            id={id}
            listUrl={listUrl}
            lectioHref={pageUrl(school, threadPath(id))}
            onBack={() => goList()}
            onDeleted={() => {
              list.refetch();
              goList();
            }}
            onWrite={(recipient) => compose(recipient)}
          />
        ) : (
          <EmptyState
            className="flex-1"
            icon={<MessagesSquare />}
            title="Vælg en tråd"
            description="Vælg en besked i listen for at læse den, eller skriv en ny."
            action={
              <Button size="sm" onClick={() => compose()}>
                <SquarePen /> Ny besked
              </Button>
            }
          />
        )}
      </section>
    </div>
  );
}
