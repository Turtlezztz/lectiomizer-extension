// Local schedule history. Only successfully read dates replace the baseline.
export const HISTORY_LIMIT = 100;
export const LOCK = 3 * 60 * 1000;
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

const nameOf = lesson => [lesson.holds?.join(', '), lesson.title].filter(Boolean).join(' · ') || 'Modul';
export function messageTitle(message) {
  if (message.kind === 'message') return `Ny besked: ${message.item.title}`;
  if (message.kind === 'assignment') return `Ny aflevering: ${message.item.title}`;
  return `${nameOf(message.lesson)} ${message.kind === 'cancelled' ? 'er aflyst' : message.kind === 'removed' ? 'er fjernet fra skemaet' : message.kind === 'restored' ? 'er tilbage i skemaet' : 'er ændret'}`;
}

// Each feed establishes its own baseline. Failed reads never clear it. A
// message's stable Lectio link plus timestamp catches replies in old threads.
export function compareFeeds(previous, feeds, now = Date.now()) {
  const value = { ...previous, feeds: { ...previous.feeds } };
  const notifications = [];
  for (const [feed, kind] of [['lectioMessages', 'message'], ['assignments', 'assignment']]) {
    const items = feeds?.[feed];
    if (!Array.isArray(items)) continue;
    const saved = previous.feeds?.[feed];
    const seen = new Map((saved?.seen || []).map(item => [item.id, item]));
    for (const item of items) {
      const old = seen.get(item.id);
      if (saved && item.notify !== false && (!old || (kind === 'message' && old.revision !== item.revision))) {
        notifications.push({ id: `${now}:${kind}:${item.id}`, kind, item, createdAt: now, read: false });
      }
      seen.set(item.id, { id: item.id, revision: item.revision, lastSeen: now });
    }
    value.feeds[feed] = { seen: [...seen.values()].filter(item => item.lastSeen >= now - 90 * 86400000).slice(-2000) };
  }
  value.messages = [...notifications.reverse(), ...(previous.messages || [])].filter(message => message.createdAt >= now - 90 * 86400000).slice(0, HISTORY_LIMIT);
  return value;
}

export function compareSchedule(previous = {}, weeks, now = Date.now()) {
  const dates = new Set(weeks.flatMap(week => week.dates));
  const coverage = new Set(previous.coverage || []);
  const old = new Map((previous.lessons || []).map(lesson => [lesson.id, lesson]));
  const incoming = new Map(weeks.flatMap(week => week.lessons).map(lesson => [lesson.id, lesson]));
  const current = localStamp(now);
  const messages = [];
  const add = (kind, lesson, before) => messages.push({ id: `${now}:${lesson.id}:${kind}`, kind, lesson, before: before || null, createdAt: now, read: false });
  for (const lesson of incoming.values()) {
    const before = old.get(lesson.id);
    if (lesson.end < current) continue;
    // A new date is an initial baseline, even if Lectio already marks it changed.
    if (!before && !coverage.has(lesson.start.slice(0, 10))) continue;
    if (lesson.status === 'cancelled' && before?.status !== 'cancelled') add('cancelled', lesson, before);
    else if (before?.status === 'cancelled' && lesson.status !== 'cancelled') add('restored', lesson, before);
    else if (before && fields.some(field => JSON.stringify(before[field]) !== JSON.stringify(lesson[field]))) add('changed', lesson, before);
    else if (lesson.status === 'changed' && before?.status !== 'changed') add('changed', lesson, before);
  }
  for (const lesson of old.values()) {
    if (!incoming.has(lesson.id) && dates.has(lesson.start.slice(0, 10)) && lesson.end >= current && lesson.status !== 'cancelled') add('removed', lesson, lesson);
  }
  // Keep unread weeks intact; prune old snapshots and history to bound storage.
  const cutoff = localStamp(now - 7 * 86400000).slice(0, 10);
  const lessons = [...old.values()].filter(lesson => !dates.has(lesson.start.slice(0, 10)) && !incoming.has(lesson.id));
  const historyCutoff = now - 90 * 86400000;
  return {
    ...previous,
    lessons: [...lessons, ...incoming.values()].filter(lesson => lesson.end.slice(0, 10) >= cutoff),
    coverage: [...new Set([...coverage, ...dates])].filter(date => date >= cutoff),
    messages: [...messages.reverse(), ...(previous.messages || [])].filter(message => message.createdAt >= historyCutoff).slice(0, HISTORY_LIMIT),
  };
}
