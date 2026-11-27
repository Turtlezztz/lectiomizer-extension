import { BookCopy, ExternalLink } from 'lucide-react';
import { Page, PageHeader } from '@/components/ui/page';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useLectioAction, useLectioPage, useSchoolId } from '@/lib/lectio/query';
import { PATHS, pageUrl } from '@/lib/lectio/paths';
import { readBooks } from '@/lib/lectio/readers/student.js';
import { dayDiff, fmtDate } from '@/lib/format';
import { subjectColor } from '@/lib/subjects';
import { cn } from '@/lib/cn';
import { useDarkClass } from '@/features/schedule/hooks';

export interface Book {
  title: string;
  hold: string;
  lent: Date | null;
  returned: Date | null;
  due: Date | null;
  price: number | null;
}

export interface BooksData {
  books: Book[];
  /** State of Lectio's "Vis kun aktive" checkbox; null when the page has none. */
  activeOnly: boolean | null;
  toggle: HTMLInputElement | null;
  empty: string;
}

const read = readBooks as (doc: Document) => BooksData;

const fmtFull = (d: Date) => `${fmtDate(d)} ${d.getFullYear()}`;
const kr = (n: number) => n.toLocaleString('da-DK', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' kr.';

export default function BooksPage() {
  useDarkClass();
  const school = useSchoolId();
  const { data: loaded, isPending, error, refetch } = useLectioPage(PATHS.books, read);
  const action = useLectioAction(loaded, read);
  const lectioUrl = pageUrl(school, PATHS.books);
  const data = loaded?.data;
  const books = data?.books ?? [];
  const out = books.filter((b) => !b.returned);
  const value = out.reduce((n, b) => n + (b.price ?? 0), 0);

  const setActiveOnly = (on: boolean) => {
    const box = data?.toggle;
    if (!box || on === data.activeOnly) return;
    // An unchecked checkbox is simply not sent; Lectio reads its state from the postback.
    action.mutate(on ? { target: box.name, fields: { [box.name]: 'on' } } : { target: box.name, omit: [box.name] });
  };

  return (
    <Page>
      <PageHeader
        title="Bøger"
        description={data ? (out.length ? `${out.length} ${out.length === 1 ? 'bog' : 'bøger'} lånt${value ? ` · ${kr(value)} i alt` : ''}` : 'Ingen lånte bøger') : 'Bøger du har lånt af skolen'}
        actions={
          <>
            {data?.activeOnly != null && (
              <Segmented
                value={data.activeOnly ? 'active' : 'all'}
                onChange={(v) => setActiveOnly(v === 'active')}
                options={[
                  { value: 'active', label: 'Aktive' },
                  { value: 'all', label: 'Alle' },
                ]}
              />
            )}
            <Button variant="ghost" size="sm" asChild>
              <a href={lectioUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> Åbn i Lectio
              </a>
            </Button>
          </>
        }
      />
      {isPending ? (
        <div className="space-y-2" aria-busy="true" aria-label="Indlæser bøger">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <ErrorState error={error} onRetry={() => refetch()} href={lectioUrl} />
        </Card>
      ) : books.length ? (
        <Card className={cn('divide-y divide-border overflow-hidden transition-opacity', action.isPending && 'opacity-60')}>
          {books.map((b, i) => (
            <BookRow key={b.title + i} book={b} />
          ))}
        </Card>
      ) : (
        <Card>
          <EmptyState icon={<BookCopy />} title="Ingen bøger" description={data?.empty && !/ingen data/i.test(data.empty) ? data.empty : 'Du har ingen bøger lånt af skolen lige nu.'} />
        </Card>
      )}
      {action.error && <p className="mt-3 text-[13px] text-danger">{action.error.message}</p>}
    </Page>
  );
}

function BookRow({ book: b }: { book: Book }) {
  const color = subjectColor(b.hold || b.title);
  const days = b.due && !b.returned ? dayDiff(b.due) : null;
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div aria-hidden className="flex h-11 w-8 shrink-0 items-end rounded-[3px] pb-1 pl-1 shadow-sm" style={{ background: `color-mix(in oklch, ${color.bar} 55%, var(--color-surface))` }}>
        <span className="h-full w-[3px] rounded-full bg-black/10" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn('min-w-0 text-[14.5px] font-medium text-fg', b.returned && 'text-fg-muted')}>{b.title}</h3>
          {b.returned && <Badge tone="success">Afleveret</Badge>}
          {days != null && days < 0 && <Badge tone="danger">Overskredet</Badge>}
          {days != null && days >= 0 && days <= 14 && <Badge tone="warning">Snart</Badge>}
        </div>
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-[12.5px] text-fg-muted">
          {b.hold && <span>{b.hold}</span>}
          {b.lent && <span>Lånt {fmtFull(b.lent)}</span>}
          {b.returned && <span>Afleveret {fmtFull(b.returned)}</span>}
          {b.price != null && <span className="tabular-nums">{kr(b.price)}</span>}
        </p>
      </div>
      {b.due && !b.returned && (
        <div className="shrink-0 text-right">
          <div className="text-[11.5px] text-fg-subtle">Afleveres senest</div>
          <div className="text-[13.5px] font-medium text-fg tabular-nums">{fmtFull(b.due)}</div>
        </div>
      )}
    </div>
  );
}
