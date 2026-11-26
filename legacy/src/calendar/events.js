// Turns scraped lessons into Google Calendar events and works out the smallest
// set of changes. Pure: no browser or network access, so it is easy to test.

export const SOURCE = 'lectiomizer';
export const TIME_ZONE = 'Europe/Copenhagen';
// Bump when the event format changes so existing events are rewritten once.
const FORMAT = 1;
// Google's Basil (green) and Tomato (red) match Lectio's changed/cancelled colours.
const COLORS = { changed: '10', cancelled: '11' };
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function hashOf(value) {
  let hash = 0x811c9dc5;
  for (const char of JSON.stringify(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
  return (hash >>> 0).toString(36);
}

const strings = value => Array.isArray(value) ? value.filter(v => typeof v === 'string' && v) : [];

// Lessons come from the page, so anything malformed is dropped rather than sent.
export function lessonToEvent(lesson) {
  if (!lesson || typeof lesson.id !== 'string' || !STAMP.test(lesson.start) || !STAMP.test(lesson.end) || lesson.end <= lesson.start) return null;
  const teachers = strings(lesson.teachers);
  const name = [strings(lesson.holds).join(', '), lesson.title].filter(Boolean).join(' · ') || 'Lektion';
  const href = /^https:\/\/(www\.)?lectio\.dk\//.test(lesson.href || '') ? lesson.href : null;
  const description = [
    lesson.status === 'changed' && 'Ændret i Lectio.',
    teachers.length && `${teachers.length > 1 ? 'Lærere' : 'Lærer'}: ${teachers.join(', ')}`,
    typeof lesson.details === 'string' && lesson.details,
    href && `Åbn i Lectio: ${href}`,
  ].filter(Boolean).join('\n\n').slice(0, 6000);
  const body = {
    summary: lesson.status === 'cancelled' ? `Aflyst: ${name}` : name,
    location: strings(lesson.rooms).join(', '),
    description,
    start: { dateTime: `${lesson.start}:00`, timeZone: TIME_ZONE },
    end: { dateTime: `${lesson.end}:00`, timeZone: TIME_ZONE },
    colorId: COLORS[lesson.status],
    transparency: lesson.status === 'cancelled' ? 'transparent' : 'opaque',
    reminders: { useDefault: true },
    source: href ? { title: 'Lectio', url: href } : undefined,
  };
  const hash = hashOf([FORMAT, body]);
  body.extendedProperties = { private: { lxSource: SOURCE, lxId: lesson.id, lxHash: hash } };
  return { id: lesson.id, date: lesson.start.slice(0, 10), body, hash };
}

// The date an event starts on, in the calendar's time zone (events are listed
// with timeZone=Europe/Copenhagen, so the offset in dateTime is local).
const startDate = event => (event.start?.dateTime || event.start?.date || '').slice(0, 10);

// desired: events from lessonToEvent. existing: our events listed from Google.
// dates: the days that were read from Lectio; events on other days are left
// alone, so a week that failed to load never loses its lessons.
export function planSync(desired, existing, dates) {
  const wanted = new Map(desired.map(event => [event.id, event]));
  const found = new Map();
  const remove = [];
  for (const event of existing) {
    const props = event.extendedProperties?.private || {};
    if (props.lxSource !== SOURCE || !props.lxId) continue;
    // A second event for the same lesson is left over from an interrupted sync.
    if (found.has(props.lxId)) remove.push(event.id);
    else found.set(props.lxId, event);
  }
  const insert = [];
  const update = [];
  for (const event of wanted.values()) {
    const current = found.get(event.id);
    if (!current) insert.push(event);
    else if (current.extendedProperties.private.lxHash !== event.hash) update.push({ ...event, eventId: current.id });
  }
  for (const [id, event] of found) if (!wanted.has(id) && dates.has(startDate(event))) remove.push(event.id);
  return { insert, update, remove };
}
