// Shared state for background checks, notifications and Google Calendar sync.
// The background script is the only writer of history and status; the app
// reads them (and changes preferences).
import { getItem, setItem } from '../storage';

export const INTERVALS = [
  { minutes: 3, label: 'Hvert 3. minut' },
  { minutes: 15, label: 'Hvert kvarter' },
  { minutes: 30, label: 'Hver halve time' },
  { minutes: 60, label: 'Hver time' },
  { minutes: 180, label: 'Hver 3. time' },
  { minutes: 360, label: 'Hver 6. time' },
  { minutes: 1440, label: 'Hver dag' },
] as const;
export const WEEK_CHOICES = [1, 2, 4, 8] as const;

/** What the student can switch on/off. Several notice kinds can share a type. */
export const NOTICE_TYPES = [
  { type: 'cancelled', label: 'Aflyste moduler', on: true },
  { type: 'changed', label: 'Ændrede moduler', on: true },
  { type: 'room', label: 'Lokaleændringer', on: true },
  { type: 'homework', label: 'Lektier til næste skoledag', on: true },
  { type: 'message', label: 'Nye beskeder', on: true },
  { type: 'assignment', label: 'Nye opgaver', on: true },
  { type: 'deadline', label: 'Frister (24 og 2 timer før)', on: true },
  { type: 'grade', label: 'Nye karakterer', on: true },
  { type: 'absence', label: 'Nyt fravær', on: true },
  { type: 'digest', label: 'Din dag', on: false },
] as const;
export type NoticeType = (typeof NOTICE_TYPES)[number]['type'];
export type NoticeKind = 'changed' | 'cancelled' | 'removed' | 'restored' | 'room' | 'homework' | 'message' | 'assignment' | 'deadline' | 'grade' | 'absence' | 'digest';

export const typeOfKind = (kind: NoticeKind): NoticeType => (kind === 'removed' || kind === 'restored' ? 'cancelled' : kind);
export function typeEnabled(prefs: Pick<SyncPrefs, 'types'>, type: NoticeType): boolean {
  return prefs.types?.[type] ?? NOTICE_TYPES.find((t) => t.type === type)?.on ?? true;
}

const minutesOf = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m ? +m[1] * 60 + +m[2] : null;
};
/** Wall-clock minutes since midnight in Copenhagen. */
const clockMinutes = (now: number) => {
  const [h, m] = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(now)).split(':');
  return +h * 60 + +m;
};
/** Inside Stilletimer? The range may wrap midnight (22:00–07:00); from === to means never. */
export function inQuietHours(prefs: Pick<SyncPrefs, 'quiet' | 'quietFrom' | 'quietTo'>, now = Date.now()): boolean {
  const from = minutesOf(prefs.quietFrom);
  const to = minutesOf(prefs.quietTo);
  if (!prefs.quiet || from === null || to === null || from === to) return false;
  const t = clockMinutes(now);
  return from < to ? t >= from && t < to : t >= from || t < to;
}
/** When the next "Din dag" is due (browser-local time), for a one-shot alarm. */
export function nextDigestAt(prefs: Pick<SyncPrefs, 'digestTime'>, now = Date.now()): number {
  const at = minutesOf(prefs.digestTime) ?? 7 * 60;
  const d = new Date(now);
  d.setHours(Math.floor(at / 60), at % 60, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}
/** Has today's digest time passed? */
export const digestDue = (prefs: Pick<SyncPrefs, 'digestTime'>, now = Date.now()) => clockMinutes(now) >= (minutesOf(prefs.digestTime) ?? 7 * 60);

export interface SyncPrefs {
  /** Minutes between automatic checks of Lectio. */
  interval: number;
  /** Also check Lectio whenever the user opens or reloads the app. */
  checkOnOpen: boolean;
  /** Show system (OS) notifications for new items. */
  system: boolean;
  /** Per notice type on/off; a missing key means the type's default (NOTICE_TYPES). */
  types: Partial<Record<NoticeType, boolean>>;
  /** "Din dag" is sent at the first check after this time (HH:MM), when the digest type is on. */
  digestTime: string;
  /** Stilletimer: no system notifications between quietFrom and quietTo (HH:MM, may wrap midnight). */
  quiet: boolean;
  quietFrom: string;
  quietTo: string;
  /** Google Calendar */
  connected: boolean;
  email: string;
  calendarId: string;
  weeks: number;
  cancelled: boolean;
  /** Also put assignment deadlines (not handed in) in the Google calendar. */
  deadlines: boolean;
  /** OAuth client id entered in Indstillinger (overrides the build-time one). */
  googleClientId: string;
}
export const SYNC_DEFAULTS: SyncPrefs = { interval: 60, checkOnOpen: true, system: true, types: {}, digestTime: '07:00', quiet: false, quietFrom: '22:00', quietTo: '07:00', connected: false, email: '', calendarId: '', weeks: 4, cancelled: true, deadlines: false, googleClientId: '' };
export const SYNC_KEY = 'sync';

// Lectiomizer's own OAuth client (public, not a secret). WXT_GOOGLE_CLIENT_ID in
// .env overrides it at build time; a client id saved in Indstillinger wins over both.
const DEFAULT_CLIENT_ID = '937670631254-humqamqlj6vg91boaab1bluhanuq2q29.apps.googleusercontent.com';
export const BUILT_IN_CLIENT_ID: string = (import.meta.env.WXT_GOOGLE_CLIENT_ID || '').trim() || DEFAULT_CLIENT_ID;

export interface CheckStatus {
  state?: 'idle' | 'syncing' | 'ok' | 'error' | 'paused';
  message?: string;
  startedAt?: number;
  checkedAt?: number;
  /** True when the last check failed because the Lectio session is gone. */
  login?: boolean;
}
export interface CalendarStatus extends CheckStatus {
  syncedAt?: number;
  lessons?: number;
  weeks?: number;
  reconnect?: boolean;
}

export interface Lesson {
  id: string;
  start: string;
  end: string;
  title?: string;
  status?: string;
  holds?: string[];
  teachers?: string[];
  rooms?: string[];
  details?: string;
  href?: string | null;
}
export interface FeedItem {
  id: string;
  title: string;
  href: string;
  description?: string;
  /** Assignments: ISO deadline and whether it is handed in. */
  deadline?: string;
  delivered?: boolean;
  /** Grades: the grade itself ("10") and its kind ("1.standpunkt"). */
  value?: string;
  type?: string;
}
export interface Digest {
  date: string;
  lessons: number;
  first?: Lesson;
  deadlines: Array<{ title: string; deadline: string; href: string }>;
}
export interface Notice {
  id: string;
  kind: NoticeKind;
  lesson?: Lesson;
  before?: Lesson | null;
  item?: FeedItem;
  /** Deadline reminders: which one this is. */
  reminder?: '24h' | '2h';
  digest?: Digest;
  createdAt: number;
  read: boolean;
}
export interface AccountState {
  lessons?: Lesson[];
  coverage?: string[];
  feeds?: Record<string, unknown>;
  /** Deadline reminders already given ("24h|<assignment>|<deadline>"); undefined until the first baseline. */
  reminded?: string[];
  /** Date (YYYY-MM-DD) of the last "Din dag". */
  digestDay?: string;
  messages?: Notice[];
  status?: CheckStatus;
}
export interface History {
  accounts: Record<string, AccountState>;
  /** The scope (school:account) of the signed-in student, set by the last successful read. */
  current?: string;
}
export const HISTORY_KEY = 'scheduleHistory';
export const CALENDAR_STATUS_KEY = 'calendarStatus';

export const loadPrefs = async (): Promise<SyncPrefs> => ({ ...SYNC_DEFAULTS, ...(await getItem<Partial<SyncPrefs>>(SYNC_KEY, {})) });
export async function savePrefs(patch: Partial<SyncPrefs>) {
  const next = { ...(await loadPrefs()), ...patch };
  await setItem(SYNC_KEY, next);
  return next;
}
export const loadHistory = () => getItem<History>(HISTORY_KEY, { accounts: {} });
export const loadCalendarStatus = () => getItem<CalendarStatus>(CALENDAR_STATUS_KEY, {});
export async function saveCalendarStatus(patch: Partial<CalendarStatus>) {
  const next = { ...(await loadCalendarStatus()), ...patch };
  await setItem(CALENDAR_STATUS_KEY, next);
  return next;
}

export function intervalOf(prefs: SyncPrefs) {
  return INTERVALS.find((c) => c.minutes === prefs.interval) ?? INTERVALS[3];
}

export function isCheckDue(
  prefs: SyncPrefs,
  checkedAt?: number,
  { now = Date.now(), force = false, onOpen = false } = {},
): boolean {
  if (force || (onOpen && prefs.checkOnOpen)) return true;
  const due = (checkedAt ?? 0) + intervalOf(prefs).minutes * 60_000;
  return now >= due - 30_000;
}

/** Serialises read-modify-write updates of the history object. */
let pending: Promise<unknown> = Promise.resolve();
export function updateHistory<T>(fn: (history: History) => Promise<{ value?: History; result: T }> | { value?: History; result: T }): Promise<T> {
  const run = pending.then(async () => {
    const history = await loadHistory();
    const { value, result } = await fn(history);
    if (value) await setItem(HISTORY_KEY, value);
    return result;
  });
  pending = run.catch(() => {});
  return run;
}
