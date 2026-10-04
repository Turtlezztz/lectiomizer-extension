// Content-script side of the calendar sync: while the student uses Lectio,
// fetch the coming weeks of SkemaNy.aspx with their own session and hand the
// lessons to the background script, which talks to Google.
import { api, loadCalendar, loadCalendarStatus, saveCalendarStatus } from '../settings.js';
import { readSchedule, weekUrl, weeksFrom } from '../readers/schedule.js';

export const SYNC_INTERVAL = 60 * 60 * 1000;
// Another tab may be syncing; after this long its attempt is presumed dead.
const LOCK = 3 * 60 * 1000;

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
  if (!force && status.checkedAt && now - status.checkedAt < SYNC_INTERVAL) return { started: false };
  await saveCalendarStatus({ state: 'syncing', startedAt: now, message: '' });
  const weeks = await Promise.all(weeksFrom(new Date(now), settings.weeks).map(week => readWeek(week, scheduleHref, load)));
  const read = weeks.filter(week => !week.error);
  if (!read.length) {
    const message = 'Skemaet kunne ikke læses fra Lectio. Prøver igen om en time.';
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

// Called once per authenticated top-level page.
export function watchSchedule(scheduleHref) {
  if (!api?.runtime?.onMessage) return;
  api.runtime.onMessage.addListener(message => {
    if (message?.type === 'calendar:sync-now') return syncSchedule({ scheduleHref: scheduleHref(), force: true });
  });
  // Let Lectio's own page settle before fetching more of it.
  setTimeout(() => syncSchedule({ scheduleHref: scheduleHref() }).catch(error => console.warn('Lectiomizer: kalendersynkronisering fejlede:', error)), 2000);
}
