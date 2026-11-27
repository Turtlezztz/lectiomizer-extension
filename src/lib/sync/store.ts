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

export interface SyncPrefs {
  /** Minutes between automatic checks of Lectio. */
  interval: number;
  /** Also check Lectio whenever the user opens or reloads the app. */
  checkOnOpen: boolean;
  /** Show system (OS) notifications for new items. */
  system: boolean;
  /** Google Calendar */
  connected: boolean;
  email: string;
  calendarId: string;
  weeks: number;
  cancelled: boolean;
  /** OAuth client id entered in Indstillinger (overrides the build-time one). */
  googleClientId: string;
}
export const SYNC_DEFAULTS: SyncPrefs = { interval: 60, checkOnOpen: true, system: true, connected: false, email: '', calendarId: '', weeks: 4, cancelled: true, googleClientId: '' };
export const SYNC_KEY = 'sync';

// Lectiomizer's own OAuth client (public, not a secret). WXT_GOOGLE_CLIENT_ID in
// .env overrides it at build time; a client id saved in Indstillinger wins over both.
const DEFAULT_CLIENT_ID = '937670631254-humqamqlj6vg91boaab1bluhanuq2q29.apps.googleusercontent.com';
export const BUILT_IN_CLIENT_ID: string = (import.meta.env.WXT_GOOGLE_CLIENT_ID || '').trim() || DEFAULT_CLIENT_ID;

export interface CheckStatus {
  state?: 'idle' | 'syncing' | 'ok' | 'error';
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
}
export interface Notice {
  id: string;
  kind: 'changed' | 'cancelled' | 'removed' | 'restored' | 'message' | 'assignment';
  lesson?: Lesson;
  before?: Lesson | null;
  item?: FeedItem;
  createdAt: number;
  read: boolean;
}
export interface AccountState {
  lessons?: Lesson[];
  coverage?: string[];
  feeds?: Record<string, unknown>;
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
