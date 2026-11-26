import { cn } from '@/lib/cn';
import { fmtTime } from '@/lib/format';
import { subjectColor } from '@/lib/subjects';
import type { Lesson } from './lessons';
import type { Occupancy } from './occupancy';

const DAY_FROM = 8 * 60;
const DAY_TO = 16 * 60;

/** A day as a thin bar (08–16, stretched to fit lessons): bookings as blocks, `at` as a marker. */
export function DayStrip({ lessons, at, className }: { lessons: Lesson[]; at: Date; className?: string }) {
  const from = Math.min(DAY_FROM, ...lessons.map((l) => Math.floor(l.startMin / 60) * 60));
  const to = Math.max(DAY_TO, ...lessons.map((l) => Math.ceil(l.endMin / 60) * 60));
  const span = to - from;
  const pct = (min: number) => `${((Math.min(Math.max(min, from), to) - from) / span) * 100}%`;
  const atMin = at.getHours() * 60 + at.getMinutes();
  const label = lessons.length ? lessons.map((l) => `${fmtTime(l.startDate)}–${fmtTime(l.endDate)} ${l.hold || l.title}`).join(', ') : 'Ingen bookinger';
  return (
    <div className={cn('relative h-2 overflow-hidden rounded-full bg-success/15', className)} role="img" aria-label={label} title={label}>
      {lessons.map((l) => (
        <span
          key={l.id}
          className="absolute inset-y-0 rounded-[2px]"
          style={{ left: pct(l.startMin), width: `calc(${pct(l.endMin)} - ${pct(l.startMin)})`, background: subjectColor(l.hold || l.title).bar }}
        />
      ))}
      {atMin >= from && atMin <= to && <span aria-hidden className="absolute -inset-y-px w-0.5 rounded-full bg-fg" style={{ left: pct(atMin) }} />}
    </div>
  );
}

/** "Ledig til 11:30", "Optaget til 10:00", "Ledig resten af dagen". */
export function occupancyText(o: Occupancy): string {
  if (o.state === 'busy') return `Optaget til ${fmtTime(o.freeAt)}`;
  if (!o.next) return 'Ledig resten af dagen';
  return `Ledig til ${fmtTime(o.next.startDate)}`;
}

/** Duration in Danish: "45 min", "2 t 10 min". */
export function durationText(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} t ${m} min` : `${h} t`;
}
