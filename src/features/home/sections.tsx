import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowUpRight, BookOpen, ChevronDown, ClipboardList, Inbox, Mail, Megaphone, PartyPopper, Sparkles, UserX } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, type Tone } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/states';
import { RichText } from '@/components/RichText';
import { dayDiff, fmtDate, fmtTime, relativeDay, urgency } from '@/lib/format';
import { subjectColor } from '@/lib/subjects';
import { cn } from '@/lib/cn';
import { SmartLink } from './SmartLink';
import { cleanName, subjectName, type Block, type Need } from './model';

function HeaderLink({ to, href, children }: { to?: string; href?: string | null; children: ReactNode }) {
  const cls = 'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12.5px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg';
  if (to) return <Link to={to} className={cls}>{children} <ArrowUpRight className="size-3.5" /></Link>;
  return <SmartLink href={href} className={cls}>{children} <ArrowUpRight className="size-3.5" /></SmartLink>;
}

const KIND = {
  assignment: { icon: ClipboardList, label: 'Opgave' },
  homework: { icon: BookOpen, label: 'Lektie' },
  absence: { icon: UserX, label: 'Fravær' },
} as const;

function dueBadge(need: Need, now: Date): { tone: Tone; text: string } | null {
  if (need.kind === 'absence') return { tone: 'danger', text: 'Mangler årsag' };
  const u = urgency(need.due, now);
  if (u === 'none') return null;
  if (need.kind === 'homework') {
    const d = dayDiff(need.due!, now);
    return { tone: d <= 0 ? 'warning' : d === 1 ? 'info' : 'neutral', text: `Til ${relativeDay(need.due!, now)}` };
  }
  if (u === 'overdue') return { tone: 'danger', text: 'Overskredet' };
  const d = dayDiff(need.due!, now);
  if (u === 'soon') return { tone: 'warning', text: d === 0 ? 'I dag' : d === 1 ? 'I morgen' : 'Snart' };
  if (u === 'week') return { tone: 'info', text: 'Denne uge' };
  return { tone: 'neutral', text: `Om ${d} dage` };
}

function dueText(need: Need, now: Date) {
  if (!need.due) return '';
  const d = dayDiff(need.due, now);
  const day = Math.abs(d) < 7 ? relativeDay(need.due, now) : fmtDate(need.due);
  return need.kind === 'homework' ? day : `${day} ${fmtTime(need.due)}`;
}

export function NeedsCard({ items, now, homeworkHref }: { items: Need[]; now: Date; homeworkHref?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 6;
  const shown = expanded ? items : items.slice(0, LIMIT);
  const pressing = items.filter((n) => n.kind === 'absence' || ['overdue', 'soon'].includes(urgency(n.due, now))).length;
  return (
    <Card>
      <CardHeader
        icon={<Sparkles />}
        title={<span className="inline-flex items-center gap-2">Brug for dig {items.length > 0 && <Badge tone={pressing ? 'accent' : 'neutral'} className="tabular-nums">{items.length}</Badge>}</span>}
        description={items.length ? (pressing ? `${pressing} kræver opmærksomhed snart` : 'Intet haster lige nu') : undefined}
        action={<HeaderLink to="/assignments">Opgaver</HeaderLink>}
      />
      {items.length === 0 ? (
        <EmptyState className="pt-2 pb-8" icon={<PartyPopper />} title="Du er helt med" description="Ingen afleveringer, lektier eller manglende fraværsårsager lige nu." />
      ) : (
        <CardBody className="px-2 pb-2">
          <ul>
            {shown.map((n, i) => {
              const { icon: Icon, label } = KIND[n.kind];
              const badge = dueBadge(n, now);
              const hold = n.context && n.kind !== 'absence' ? n.context : '';
              const color = hold ? subjectColor(hold) : null;
              const late = n.kind === 'assignment' && urgency(n.due, now) === 'overdue';
              return (
                <li key={i}>
                  <SmartLink href={n.href} className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-2">
                    <span
                      className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[17px]', !color && (n.kind === 'absence' ? 'bg-danger-soft text-danger-soft-fg' : 'bg-surface-3 text-fg-muted'))}
                      style={color ? { background: color.bg, color: color.fg } : undefined}
                    >
                      <Icon />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-fg" title={n.title}>{n.title}</div>
                      <div className="truncate text-[12px] text-fg-muted">
                        {label}{hold && <> · {subjectName(hold) !== hold ? `${subjectName(hold)} (${hold})` : hold}</>}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {badge && <Badge tone={badge.tone}>{badge.text}</Badge>}
                      {n.due && n.kind !== 'homework' && <span className={cn('text-[11.5px] tabular-nums', late ? 'text-danger-soft-fg' : 'text-fg-subtle')}>{dueText(n, now)}</span>}
                    </div>
                  </SmartLink>
                </li>
              );
            })}
          </ul>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 pt-2.5 pb-1.5 text-[12.5px]">
            {items.length > LIMIT ? (
              <button type="button" onClick={() => setExpanded((v) => !v)} className="inline-flex items-center gap-1 font-medium text-fg-muted hover:text-fg">
                <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
                {expanded ? 'Vis færre' : `Vis alle ${items.length}`}
              </button>
            ) : <span />}
            <div className="flex gap-3">
              {homeworkHref && <SmartLink href={homeworkHref} className="inline-flex items-center gap-0.5 font-medium text-fg-muted hover:text-fg">Alle lektier <ArrowUpRight className="size-3" /></SmartLink>}
            </div>
          </div>
        </CardBody>
      )}
    </Card>
  );
}

function messageTime(d: Date | null, raw: string, now: Date) {
  if (!d) return raw;
  const diff = dayDiff(d, now);
  if (diff === 0) return fmtTime(d);
  if (diff === -1) return 'i går';
  if (diff > -7) return d.toLocaleDateString('da-DK', { weekday: 'short' }).replace('.', '');
  return fmtDate(d);
}

export function MessagesCard({ block, now }: { block: Block | null; now: Date }) {
  const unread = Number(block?.info.match(/(\d+)\s*ulæste/i)?.[1] || 0);
  return (
    <Card>
      <CardHeader
        icon={<Mail />}
        title={<span className="inline-flex items-center gap-2">Seneste beskeder {unread > 0 && <Badge tone="accent" className="tabular-nums">{unread} ulæste</Badge>}</span>}
        action={<HeaderLink to="/messages">Alle</HeaderLink>}
      />
      {!block?.rows.length ? (
        <EmptyState className="pt-2 pb-8" icon={<Inbox />} title="Ingen nye beskeder" />
      ) : (
        <CardBody className="px-2 pb-2">
          <ul>
            {block.rows.map((row, i) => {
              const name = cleanName(row.senderTitle || row.sender) || 'Ukendt';
              return (
                <li key={i}>
                  <SmartLink href={row.href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-2">
                    <Avatar name={name} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-fg">{row.text}</span>
                        <span className="shrink-0 text-[11.5px] text-fg-subtle tabular-nums">{messageTime(row.due, row.dueText, now)}</span>
                      </div>
                      <div className="truncate text-[12.5px] text-fg-muted">{name}</div>
                    </div>
                  </SmartLink>
                </li>
              );
            })}
          </ul>
        </CardBody>
      )}
    </Card>
  );
}

export function NoticesCard({ block }: { block: Block | null }) {
  if (!block?.rows.length) return null;
  const rows = [...block.rows].sort((a, b) => Number(b.important) - Number(a.important));
  return (
    <Card>
      <CardHeader icon={<Megaphone />} title={block.title || 'Aktuel information'} action={block.href ? <HeaderLink href={block.href}>Lectio</HeaderLink> : undefined} />
      <CardBody className="space-y-2">
        {rows.map((row, i) => (
          <div
            key={i}
            className={cn(
              'rounded-lg border border-border bg-surface-2/60 px-3.5 py-2.5',
              row.important && 'border-l-[3px] border-l-accent',
            )}
          >
            {row.important && <Badge tone="accent" className="mb-1">Vigtigt</Badge>}
            <RichText node={row.node} className="text-[13.5px] [&_p]:my-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" />
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

export function OtherCard({ blocks, now }: { blocks: Block[]; now: Date }) {
  const list = blocks.filter((b) => b.rows.length || b.info);
  if (!list.length) return null;
  return (
    <Card>
      <CardHeader icon={<Inbox />} title="Andet fra Lectio" />
      <CardBody className="space-y-4 px-3 pb-3">
        {list.map((b) => (
          <div key={b.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2 px-2">
              <SmartLink href={b.href} className="text-[12px] font-semibold tracking-wide text-fg-subtle uppercase hover:text-fg">{b.title}</SmartLink>
              {b.info && <span className="truncate text-[11.5px] text-fg-subtle">{b.info}</span>}
            </div>
            <ul>
              {b.rows.map((row, i) => (
                <li key={i}>
                  <SmartLink href={row.href} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-surface-2">
                    <span className="min-w-0 flex-1 truncate text-fg">{row.text}</span>
                    {row.due && <span className="shrink-0 text-[11.5px] text-fg-subtle tabular-nums">{relativeDay(row.due, now)}</span>}
                  </SmartLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
