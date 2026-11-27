// Pure logic for the personal parts of the overview: "I aften", countdowns and the
// card layout the student can reorder/hide. Hooks that persist them are in ./personal.ts.
import { dayDiff } from '@/lib/format';
import { dateKey, homeworkKey, type Todo } from '@/features/homework/todo-model';
import type { Need } from './model';

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// ---------- I aften ----------

/**
 * The school day "I aften" prepares for: tomorrow, skipping the weekend
 * (Friday evening → Monday). Before 5 in the morning it is still today.
 */
export function tonightTarget(now: Date): Date {
  const d = startOfDay(now);
  if (now.getHours() >= 5) d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

/** "i morgen", "mandag" – the target day as the card's subtitle says it. */
export function targetLabel(target: Date, now: Date): string {
  const diff = dayDiff(target, now);
  if (diff === 0) return 'i dag';
  if (diff === 1) return 'i morgen';
  return target.toLocaleDateString('da-DK', { weekday: 'long' });
}

export interface TonightItem {
  kind: 'homework' | 'todo' | 'assignment';
  /** Tick key (homework) or to-do id; assignments have none. */
  key: string | null;
  title: string;
  context: string;
  href: string | null;
  due: Date | null;
  done: boolean;
}

/**
 * What to get done before the target day: its homework, to-dos dated up to it
 * (overdue ones included), and assignments due within 48 hours or by the end of that day. Done items stay
 * (dimmed) so they can be unticked; open items come first.
 */
export function tonightItems(needs: Need[], todos: Todo[], isDone: (key: string | null) => boolean, now: Date): TonightItem[] {
  const target = tonightTarget(now);
  const targetKey = dateKey(target);
  // Assignments due within 48 hours, or before the target day ends (Friday → Sunday night's deadlines too).
  const until = Math.max(now.getTime() + 2 * DAY, target.getTime() + DAY);
  const items: TonightItem[] = [];
  for (const n of needs) {
    if (n.kind === 'homework' && n.due && dayDiff(n.due, target) === 0) {
      const key = homeworkKey(n.href, n.due);
      items.push({ kind: 'homework', key, title: n.title, context: n.context, href: n.href, due: n.due, done: isDone(key) });
    } else if (n.kind === 'assignment' && n.due) {
      if (n.due > now && n.due.getTime() <= until) items.push({ kind: 'assignment', key: null, title: n.title, context: n.context, href: n.href, due: n.due, done: false });
    }
  }
  for (const t of todos) {
    if (!t.date) continue;
    if (t.done ? t.date === targetKey : t.date <= targetKey) {
      items.push({ kind: 'todo', key: t.id, title: t.text, context: '', href: null, due: null, done: t.done });
    }
  }
  return items.map((item, i) => ({ item, i })).sort((a, b) => Number(a.item.done) - Number(b.item.done) || a.i - b.i).map((x) => x.item);
}

// ---------- Nedtællinger ----------

export interface Countdown {
  id: string;
  title: string;
  /** Deadline or day (ms). Custom dates are local midnight. */
  at: number;
  /** Where the chip links to (an assignment), if anywhere. */
  href?: string | null;
  /** Identity of the pinned thing (e.g. the assignment's href), for isPinned(). */
  source?: string | null;
}

/** "i dag", "i morgen", "21 dage" */
export function countdownText(at: Date, now: Date): string {
  const d = dayDiff(at, now);
  if (d <= 0) return 'i dag';
  if (d === 1) return 'i morgen';
  return `${d} dage`;
}

/** Countdowns in date order, without those whose day has passed. Same array when nothing changed. */
export function pruneCountdowns(list: Countdown[], now: Date): Countdown[] {
  const all = Array.isArray(list) ? list : [];
  const kept = all.filter((c) => c && typeof c.at === 'number' && dayDiff(new Date(c.at), now) >= 0);
  const sorted = [...kept].sort((a, b) => a.at - b.at);
  const same = sorted.length === all.length && sorted.every((c, i) => c === all[i]);
  return same && Array.isArray(list) ? list : sorted;
}

export function addCountdown(list: Countdown[], input: Omit<Countdown, 'id'>, now = new Date()): Countdown[] {
  const rest = input.source ? list.filter((c) => c.source !== input.source) : list;
  const id = `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return [...rest, { ...input, title: input.title.trim(), id }].sort((a, b) => a.at - b.at);
}

// ---------- Tilpas: card order + visibility ----------

export type SectionId = 'now' | 'countdowns' | 'tonight' | 'needs' | 'messages' | 'notices' | 'timeline' | 'other';
export type Column = 'hero' | 'main' | 'side';

export const SECTIONS: Record<SectionId, { label: string; column: Column }> = {
  now: { label: 'Nu / næste modul', column: 'hero' },
  countdowns: { label: 'Nedtællinger', column: 'main' },
  tonight: { label: 'I aften', column: 'main' },
  needs: { label: 'Brug for dig', column: 'main' },
  messages: { label: 'Seneste beskeder', column: 'main' },
  notices: { label: 'Aktuel information', column: 'main' },
  timeline: { label: 'Dagens skema', column: 'side' },
  other: { label: 'Andet fra Lectio', column: 'side' },
};

export interface HomeLayout {
  order: SectionId[];
  hidden: SectionId[];
}

export const DEFAULT_LAYOUT: HomeLayout = {
  order: ['now', 'countdowns', 'tonight', 'needs', 'messages', 'notices', 'timeline', 'other'],
  hidden: [],
};

const isSection = (id: unknown): id is SectionId => typeof id === 'string' && id in SECTIONS;

/** Stored layout → a complete one: unknown ids dropped, new sections inserted where the default has them. */
export function normalizeLayout(raw: Partial<HomeLayout> | null | undefined): HomeLayout {
  const order = [...new Set((raw?.order ?? []).filter(isSection))];
  DEFAULT_LAYOUT.order.forEach((id, i) => {
    if (order.includes(id)) return;
    const before = DEFAULT_LAYOUT.order.slice(0, i).reverse().find((p) => order.includes(p));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  });
  const hidden = [...new Set((raw?.hidden ?? []).filter(isSection))];
  return { order, hidden };
}

/** The visible sections of one column, in order. */
export const columnSections = (layout: HomeLayout, column: Column) =>
  layout.order.filter((id) => SECTIONS[id].column === column && !layout.hidden.includes(id));

/** Swaps a section with its neighbour in the same column (dir -1 = up, 1 = down). */
export function moveSection(layout: HomeLayout, id: SectionId, dir: -1 | 1): HomeLayout {
  const column = SECTIONS[id].column;
  const peers = layout.order.filter((s) => SECTIONS[s].column === column);
  const at = peers.indexOf(id);
  const other = peers[at + dir];
  if (at < 0 || !other) return layout;
  const order = layout.order.map((s) => (s === id ? other : s === other ? id : s));
  return { ...layout, order };
}

export function toggleSection(layout: HomeLayout, id: SectionId): HomeLayout {
  const hidden = layout.hidden.includes(id) ? layout.hidden.filter((s) => s !== id) : [...layout.hidden, id];
  return { ...layout, hidden };
}
