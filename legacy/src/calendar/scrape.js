// Read Skema with the student's session for local notifications and, when
// connected, Google Calendar. The background owns the shared read lock.
import { api } from '../settings.js';
import { loadCalendar, nextSyncAt } from './store.js';
import { readSchedule, weekUrl, weeksFrom } from '../readers/schedule.js';
import { accountState, loadScheduleState, SCHEDULE_STATE } from '../notifications/store.js';
import { LOCK, scheduleScope } from '../notifications/changes.js';
import { readFeeds, assertAccount } from '../notifications/feeds.js';

// Let Lectio's own page settle before fetching more of it.
const SETTLE = 2000;

export async function fetchPage(url) {
  // Manifest V3 content scripts fetch in the page's context, with its cookies.
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Lectio svarede ${response.status}`);
  const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
  const base = doc.createElement('base');
  base.href = response.url || url;
  doc.head.prepend(base);
  return doc;
}

async function readWeek(week, context, load) {
  try {
    const doc = await load(weekUrl(context.scheduleHref, week));
    assertAccount(doc, context);
    const lessons = readSchedule(doc);
    const inWeek = lessons.filter(lesson => week.dates.includes(lesson.start.slice(0, 10)));
    // Lectio falls back to another week on a bad ?week=; don't sync that as this one.
    if (lessons.length && !inWeek.length) throw new Error('Lectio viste en anden uge');
    return { dates: week.dates, lessons: inWeek };
  } catch (error) {
    return { dates: week.dates, error: error.message };
  }
}

export async function syncSchedule({ scheduleHref, accountId, force = false, now = Date.now(), load = fetchPage, send = message => api.runtime.sendMessage(message) }) {
  const context = { scheduleHref, accountId };
  if (!scheduleScope(context)) return { started: false };
  const settings = await loadCalendar();
  let token;
  try {
    const claim = await send({ type: 'schedule:claim', context, force });
    if (!claim?.started) return claim || { started: false };
    token = claim.token;
    // Notifications always cover at least four weeks, even if Google only
    // receives one. Both consumers share these exact reads.
    const count = Math.max(4, Number(settings.weeks) || 4);
    const [weeks, feeds] = await Promise.all([
      Promise.all(weeksFrom(new Date(now), count).map(week => readWeek(week, context, load))),
      readFeeds(context, load),
    ]);
    const read = weeks.filter(week => !week.error);
    if (!read.length && !Array.isArray(feeds.lectioMessages) && !Array.isArray(feeds.assignments)) return { started: true, ...await send({ type: 'schedule:failed', context, token }) };
    return { started: true, ...await send({ type: 'schedule:sync', context, token, weeks: read, feeds, unread: weeks.length - read.length }) };
  } catch {
    const message = 'Lectiomizer kunne ikke tjekke skemaet. Genindlæs siden og prøv igen.';
    if (token) await send({ type: 'schedule:failed', context, token }).catch(() => {});
    return { started: true, ok: false, message };
  }
}

// When this tab should next try, given the stored settings and status.
export function nextAttempt(settings, status, now = Date.now()) {
  const due = status.state === 'syncing' ? status.startedAt + LOCK : nextSyncAt(settings, status);
  return Math.max(due, now + SETTLE);
}

// Called once per authenticated top-level page. Every open Lectio tab keeps a
// timer for the next fetch; whichever fires first syncs, and the new status
// moves every tab's timer on.
export function watchSchedule(getContext) {
  if (!api?.runtime?.onMessage) return;
  const onMessage = message => {
    if (message?.type === 'calendar:sync-now') return syncSchedule({ ...getContext(), force: true });
  };
  api.runtime.onMessage.addListener(onMessage);
  let timer;
  let stopped = false;
  const run = () => syncSchedule({ ...getContext() })
    .catch(error => console.warn('Lectiomizer: skematjek fejlede:', error))
    .finally(plan);
  async function plan() {
    const [settings, state] = await Promise.all([loadCalendar(), loadScheduleState()]);
    clearTimeout(timer);
    const context = getContext();
    const scope = scheduleScope(context);
    if (!stopped && scope) timer = setTimeout(run, nextAttempt(settings, accountState(state, scope).status || {}) - Date.now());
  }
  const onStorage = (changes, area) => {
    if (area === 'local' && (changes.calendar || changes[SCHEDULE_STATE])) plan();
  };
  api.storage.onChanged.addListener(onStorage);
  plan();
  return () => { stopped = true; clearTimeout(timer); api.storage.onChanged.removeListener(onStorage); api.runtime.onMessage.removeListener?.(onMessage); };
}
