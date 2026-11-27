// Local schedule history. Only successfully read dates replace the baseline.
// Every notice type follows the same pattern: the first read stores a silent
// baseline, later reads notify about what is new, and nothing already past is reported.
export const HISTORY_LIMIT = 100;
export const LOCK = 3 * 60 * 1000;
const DAY = 86400000;
const HOUR = 3600000;
const fields = ['start', 'end', 'title', 'holds', 'teachers', 'rooms', 'details'];
const stamp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const localStamp = now => stamp.format(new Date(now)).replace(' ', 'T');

export function scheduleScope(context = {}) {
  try {
    const { scheduleHref, accountId } = context || {};
    const url = new URL(scheduleHref);
    const school = url.pathname.match(/^\/lectio\/(\d+)\/SkemaNy\.aspx$/i)?.[1];
    // localhost supports the synthetic preview; the background additionally
    // restricts all runtime requests to authenticated HTTPS Lectio tabs.
    const allowed = /^https:\/\/(www\.)?lectio\.dk\//.test(url.href) || (url.protocol === 'http:' && url.hostname === '127.0.0.1');
    if (!school || !allowed || !/^[SU]\d+$/.test(accountId)) return null;
    return `${school}:${accountId}`;
  } catch { return null; }
}

/** The "Lektier:" part of a lesson's tooltip details (up to a blank line or "Note:"). */
export function homeworkText(details = '') {
  const lines = (details || '').split('\n');
  const at = lines.findIndex(line => /^lektier:?$/i.test(line.trim()));
  if (at < 0) return '';
  const out = [];
  for (const line of lines.slice(at + 1)) {
    if (!line.trim() || /^(note|øvrigt indhold):?$/i.test(line.trim())) break;
    out.push(line.trim().replace(/^[-•]\s*/, ''));
  }
  return out.join(' · ');
}

const keepHistory = (notices, previous, now) =>
  [...notices.reverse(), ...(previous || [])].filter(message => message.createdAt >= now - 90 * DAY).slice(0, HISTORY_LIMIT);

// Each feed establishes its own baseline. Failed reads (null) never clear it;
// a feed that wasn't asked for (undefined, its type is off) drops it, so
// turning the type on again starts from a fresh, silent baseline. A message's
// stable Lectio link plus timestamp catches replies in old threads; a grade's
// value catches a changed grade.
const FEEDS = [['lectioMessages', 'message', true], ['assignments', 'assignment', false], ['grades', 'grade', true], ['absence', 'absence', false]];
export function compareFeeds(previous, feeds, now = Date.now()) {
  const value = { ...previous, feeds: { ...previous.feeds } };
  const notifications = [];
  for (const [feed, kind, revised] of FEEDS) {
    const items = feeds?.[feed];
    if (items === undefined) { delete value.feeds[feed]; continue; }
    if (!Array.isArray(items)) continue;
    const saved = previous.feeds?.[feed];
    const seen = new Map((saved?.seen || []).map(item => [item.id, item]));
    for (const item of items) {
      const old = seen.get(item.id);
      if (saved && item.notify !== false && (!old || (revised && old.revision !== item.revision))) {
        notifications.push({ id: `${now}:${kind}:${item.id}`, kind, item, createdAt: now, read: false });
      }
      seen.set(item.id, { id: item.id, revision: item.revision, lastSeen: now });
    }
    value.feeds[feed] = { seen: [...seen.values()].filter(item => item.lastSeen >= now - 90 * DAY).slice(-2000) };
  }
  value.messages = keepHistory(notifications, previous.messages, now);
  return value;
}

/** Last date (YYYY-MM-DD) that counts as "the next school day": the first later date with lessons. */
export function nextSchoolDay(lessons, now = Date.now()) {
  const today = localStamp(now).slice(0, 10);
  const later = lessons.filter(lesson => lesson.status !== 'cancelled').map(lesson => lesson.start.slice(0, 10)).filter(date => date > today).sort();
  return later[0] || today;
}

export function compareSchedule(previous = {}, weeks, now = Date.now()) {
  const dates = new Set(weeks.flatMap(week => week.dates));
  const coverage = new Set(previous.coverage || []);
  const old = new Map((previous.lessons || []).map(lesson => [lesson.id, lesson]));
  const incoming = new Map(weeks.flatMap(week => week.lessons).map(lesson => [lesson.id, lesson]));
  const current = localStamp(now);
  const homeworkUntil = nextSchoolDay([...incoming.values()], now);
  const messages = [];
  const add = (kind, lesson, before) => messages.push({ id: `${now}:${lesson.id}:${kind}`, kind, lesson, before: before || null, createdAt: now, read: false });
  for (const lesson of incoming.values()) {
    const before = old.get(lesson.id);
    if (lesson.end < current) continue;
    // A new date is an initial baseline, even if Lectio already marks it changed.
    if (!before && !coverage.has(lesson.start.slice(0, 10))) continue;
    const changed = before ? fields.filter(field => JSON.stringify(before[field]) !== JSON.stringify(lesson[field])) : [];
    if (lesson.status === 'cancelled' && before?.status !== 'cancelled') add('cancelled', lesson, before);
    else if (before?.status === 'cancelled' && lesson.status !== 'cancelled') add('restored', lesson, before);
    else if (changed.length === 1 && changed[0] === 'rooms') add('room', lesson, before);
    // Lektier/noter only matter for the coming school day; further out they are just recorded.
    else if (changed.length === 1 && changed[0] === 'details') { if (lesson.start.slice(0, 10) <= homeworkUntil && lesson.details) add('homework', lesson, before); }
    else if (changed.length) add('changed', lesson, before);
    else if (lesson.status === 'changed' && before?.status !== 'changed') add('changed', lesson, before);
  }
  for (const lesson of old.values()) {
    if (!incoming.has(lesson.id) && dates.has(lesson.start.slice(0, 10)) && lesson.end >= current && lesson.status !== 'cancelled') add('removed', lesson, lesson);
  }
  // Keep unread weeks intact; prune old snapshots and history to bound storage.
  const cutoff = localStamp(now - 7 * DAY).slice(0, 10);
  const lessons = [...old.values()].filter(lesson => !dates.has(lesson.start.slice(0, 10)) && !incoming.has(lesson.id));
  return {
    ...previous,
    lessons: [...lessons, ...incoming.values()].filter(lesson => lesson.end.slice(0, 10) >= cutoff),
    coverage: [...new Set([...coverage, ...dates])].filter(date => date >= cutoff),
    messages: keepHistory(messages, previous.messages, now),
  };
}

// Reminders 24 and 2 hours before an assignment's deadline, each given once
// (at the first check inside its window). The key includes the deadline, so a
// moved deadline reminds again. The first run (reminded undefined) only
// records what is already inside a window.
export function remindDeadlines(previous, assignments, now = Date.now()) {
  if (!Array.isArray(assignments)) return previous;
  const baseline = !Array.isArray(previous.reminded);
  const done = new Set(previous.reminded || []);
  const notices = [];
  for (const item of assignments) {
    const due = Date.parse(item.deadline || '');
    if (item.delivered || !(due > now)) continue;
    const left = due - now;
    const window = left <= 2 * HOUR ? '2h' : left <= 24 * HOUR ? '24h' : null;
    if (!window) continue;
    const key = w => `${w}|${item.id}|${item.deadline}`;
    if (done.has(key(window))) continue;
    // Inside the 2-hour window the 24-hour reminder is moot.
    done.add(key(window)).add(key('24h'));
    if (!baseline) notices.push({ id: `${now}:deadline:${window}:${item.id}`, kind: 'deadline', reminder: window, item, createdAt: now, read: false });
  }
  const reminded = [...done].filter(key => Date.parse(key.split('|')[2]) >= now - 7 * DAY);
  return { ...previous, reminded, messages: keepHistory(notices, previous.messages, now) };
}

// "Din dag": once per day, at the first check after the chosen time, when
// today's schedule was read. Days with nothing left (weekends, evenings) are
// marked done without a notice.
export function makeDigest(previous, weeks, assignments, now = Date.now(), href = '') {
  const today = localStamp(now).slice(0, 10);
  if (previous.digestDay === today) return previous;
  const week = weeks.find(w => !w.error && w.dates.includes(today));
  if (!week) return previous;
  const current = localStamp(now);
  const lessons = (week.lessons || []).filter(lesson => lesson.start.slice(0, 10) === today && lesson.status !== 'cancelled').sort((a, b) => a.start.localeCompare(b.start));
  const deadlines = (Array.isArray(assignments) ? assignments : [])
    .filter(item => !item.delivered && Date.parse(item.deadline || '') > now && localStamp(Date.parse(item.deadline)).slice(0, 10) === today)
    .map(item => ({ title: item.title, deadline: item.deadline, href: item.href }));
  const value = { ...previous, digestDay: today };
  if (!lessons.some(lesson => lesson.end >= current) && !deadlines.length) return value;
  const digest = { date: today, lessons: lessons.length, first: lessons[0], deadlines };
  const notice = { id: `${now}:digest:${today}`, kind: 'digest', digest, item: { id: today, title: 'Din dag', href }, createdAt: now, read: false };
  return { ...value, messages: keepHistory([notice], previous.messages, now) };
}

/**
 * One whole check: schedule, feeds, reminders and digest, then drop new notices
 * of types that are switched off (their baselines still move on, so switching
 * a type on never reports old news).
 * @param {any} previous
 * @param {{ weeks: any[]; feeds: any }} read
 * @param {{ now?: number; isOn?: (kind: any) => boolean; digestDue?: boolean; home?: string }} [options]
 */
export function compareAll(previous, { weeks, feeds }, { now = Date.now(), isOn = () => true, digestDue = false, home = '' } = {}) {
  let value = compareFeeds(compareSchedule(previous, weeks, now), feeds, now);
  value = isOn('deadline') ? remindDeadlines(value, feeds?.assignments, now) : { ...value, reminded: undefined };
  if (isOn('digest') && digestDue) value = makeDigest(value, weeks, feeds?.assignments, now, home);
  const before = new Set((previous.messages || []).map(m => m.id));
  value.messages = (value.messages || []).filter(m => before.has(m.id) || isOn(m.kind));
  return value;
}
