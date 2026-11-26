import { readMe } from '@/lib/lectio/readers/thread.js';
import { useLectioPage } from '@/lib/lectio/query';
import { PATHS } from '@/lib/lectio/paths';
import { useSettings } from '@/lib/settings';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/cn';

function readUser(doc: Document) {
  return readMe(doc) as { ids: string[]; name: string; photo: string | null };
}

export function UserBadge({ collapsed }: { collapsed: boolean }) {
  const { settings } = useSettings();
  const { data } = useLectioPage(PATHS.home, readUser, { staleTime: 10 * 60_000 });
  const name = data?.data.name || 'Elev';
  return (
    <div className={cn('flex items-center gap-2.5 rounded-lg px-1.5 py-1.5', collapsed && 'justify-center px-0')}>
      <Avatar name={name} src={data?.data.photo} size={30} />
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[13px] font-medium text-fg">{name}</div>
          <div className="truncate text-[12px] text-fg-subtle">{settings.school?.name}</div>
        </div>
      )}
    </div>
  );
}
