// Content-script side of the calendar sync: while the student uses Lectio,
// fetch the coming weeks of SkemaNy.aspx with their own session and hand the
// lessons to the background script, which talks to Google.
import { api } from '../settings.js';
import { loadCalendar, loadCalendarStatus, nextSyncAt, saveCalendarStatus } from './store.js';
import { readSchedule, weekUrl, weeksFrom } from '../readers/schedule.js';

// Another tab may be syncing; after this long its attempt is presumed dead.
const LOCK = 3 * 60 * 1000;
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

async function readWeek(week, scheduleHref, load) {
  try {
    const lessons = readSchedule(await load(weekUrl(scheduleHref, week)));
    const inWeek = lessons.filter(lesson => week.dates.includes(lesson.start.slice(0, 10)));
    // Lectio falls back to another week on a bad ?week=; don't sync that as this one.
    if (lessons.length && !inWeek.length) throw new Error('Lectio viste en anden uge');
    return { dates: week.dates, lessons: inWeek };
  } catch (error) {
    return { dates: week.dates, error: error.message };
  }
}

export async function syncSchedule({ scheduleHref, force = false, now = Date.now(), load = fetchPage, send = message => api.runtime.sendMessage(message) }) {
  const settings = await loadCalendar();
  if (!settings.connected || !scheduleHref) return { started: false };
  const status = await loadCalendarStatus();
  if (status.state === 'syncing' && now - status.startedAt < LOCK) return { started: false, busy: true };
  if (!force && now < nextSyncAt(settings, status)) return { started: false };
  await saveCalendarStatus({ state: 'syncing', startedAt: now, message: '' });
  const weeks = await Promise.all(weeksFrom(new Date(now), settings.weeks).map(week => readWeek(week, scheduleHref, load)));
  const read = weeks.filter(week => !week.error);
  if (!read.length) {
    const message = 'Skemaet kunne ikke læses fra Lectio.';
    await saveCalendarStatus({ state: 'error', checkedAt: now, message });
    return { started: true, ok: false, message };
  }
  try {
    return { started: true, ...await send({ type: 'calendar:sync', weeks: read, unread: weeks.length - read.length }) };
  } catch {
    const message = 'Lectiomizer kunne ikke nå Google-synkroniseringen. Genindlæs siden og prøv igen.';
    await saveCalendarStatus({ state: 'error', checkedAt: now, message });
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
export function watchSchedule(scheduleHref) {
  if (!api?.runtime?.onMessage) return;
  api.runtime.onMessage.addListener(message => {
    if (message?.type === 'calendar:sync-now') return syncSchedule({ scheduleHref: scheduleHref(), force: true });
  });
  let timer;
  const run = () => syncSchedule({ scheduleHref: scheduleHref() })
    .catch(error => console.warn('Lectiomizer: kalendersynkronisering fejlede:', error))
    .finally(plan);
  async function plan() {
    const [settings, status] = await Promise.all([loadCalendar(), loadCalendarStatus()]);
    clearTimeout(timer);
    if (settings.connected) timer = setTimeout(run, nextAttempt(settings, status) - Date.now());
  }
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.calendar || changes.calendarStatus)) plan();
  });
  plan();
}
