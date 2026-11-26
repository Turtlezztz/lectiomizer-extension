import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { compareSchedule, compareFeeds, scheduleScope, HISTORY_LIMIT } from '../src/notifications/changes.js';
import { scheduleContext } from '../src/notifications/context.js';
import { readSchedule, isoWeek } from '../src/readers/schedule.js';
import { schedulePage } from '../demo/schedule-fixture.mjs';
import { fixture } from '../demo/fixtures.mjs';
import { readFeeds } from '../src/notifications/feeds.js';

const now = Date.parse('2026-10-05T05:00:00Z');
const context = { scheduleHref: 'https://www.lectio.dk/lectio/123/SkemaNy.aspx?type=elev&elevid=9', accountId: 'S9' };
const dates = isoWeek(new Date(2026, 9, 5)).dates;
const dom = new JSDOM(schedulePage(), { url: context.scheduleHref });
const lessons = readSchedule(dom.window.document);
dom.window.close();
const weeks = items => [{ dates, lessons: items }];
const baseline = () => compareSchedule({}, weeks(lessons), now);

test('initial schedule is a silent baseline; status, room, teacher and homework changes are detected once', () => {
  const before = baseline();
  assert.equal(before.messages.length, 0);
  const changed = [
    { ...lessons[0], rooms: ['A14'], teachers: ['Ny lærer'], details: 'Ny lektie' },
    { ...lessons[1], status: 'cancelled' }, ...lessons.slice(2),
  ];
  const after = compareSchedule(before, weeks(changed), now + 1000);
  assert.deepEqual(after.messages.map(message => message.kind).sort(), ['cancelled', 'changed']);
  assert.deepEqual(after.messages.find(message => message.kind === 'changed').before.rooms, ['A12']);
  assert.equal(compareSchedule(after, weeks(changed), now + 2000).messages.length, 2);
  // Merely clearing Lectio's changed flag is not a new notification.
  const reset = compareSchedule(before, weeks(lessons.map(lesson => ({ ...lesson, status: lesson.status === 'changed' ? 'normal' : lesson.status }))), now + 1000);
  assert.equal(reset.messages.length, 0);
});

test('cancelled modules can be restored; disappearing modules are described as removed', () => {
  const restored = compareSchedule(baseline(), weeks(lessons.map(lesson => ({ ...lesson, status: 'normal' }))), now + 1000);
  assert.deepEqual(restored.messages.map(message => message.kind), ['restored']);
  const removed = compareSchedule(baseline(), weeks(lessons.slice(1)), now + 1000);
  assert.deepEqual(removed.messages.map(message => message.kind), ['removed']);
  assert.equal(compareSchedule(removed, weeks(lessons.slice(1)), now + 2000).messages.length, 1);
});

test('unread weeks are preserved and a move between read weeks creates only one change', () => {
  const nextDates = isoWeek(new Date(2026, 9, 12)).dates;
  const initial = compareSchedule({}, [...weeks(lessons), { dates: nextDates, lessons: [] }], now);
  const unchanged = compareSchedule(initial, [{ dates: nextDates, lessons: [] }], now + 1000);
  assert.equal(unchanged.lessons.length, lessons.length);
  assert.equal(unchanged.messages.length, 0);
  const moved = { ...lessons[0], start: '2026-10-12T08:15', end: '2026-10-12T09:45' };
  const result = compareSchedule(initial, [...weeks(lessons.slice(1)), { dates: nextDates, lessons: [moved] }], now + 1000);
  assert.deepEqual(result.messages.map(message => message.kind), ['changed']);
  assert.equal(result.lessons.filter(lesson => lesson.id === moved.id).length, 1);
});

test('newly covered weeks are silent and past lessons do not alert', () => {
  const nextDates = isoWeek(new Date(2026, 9, 12)).dates;
  const unseen = { ...lessons[0], id: 'absid:new', start: '2026-10-12T08:15', end: '2026-10-12T09:45', status: 'cancelled' };
  assert.equal(compareSchedule(baseline(), [{ dates: nextDates, lessons: [unseen] }], now + 1000).messages.length, 0);
  const past = compareSchedule(baseline(), weeks([{ ...lessons[0], status: 'cancelled' }, ...lessons.slice(1)]), Date.parse('2026-10-11T20:00:00Z'));
  assert.equal(past.messages.length, 0);
});

test('each feed has its own silent baseline and new messages, replies and assignments are deduplicated', () => {
  const message = { id: 'm1', title: 'Ekskursion', revision: '2026-10-05T10:00', href: 'https://www.lectio.dk/lectio/123/beskeder2.aspx?type=visbesked&id=1' };
  const assignment = { id: 'a1', title: 'Rapport', href: 'https://www.lectio.dk/lectio/123/ElevAflevering.aspx?exerciseid=1' };
  const initial = compareFeeds({ messages: [] }, { lectioMessages: [message], assignments: null }, now);
  assert.equal(initial.messages.length, 0);
  const seeded = compareFeeds(initial, { assignments: [assignment], lectioMessages: null }, now + 1000);
  assert.equal(seeded.messages.length, 0);
  const feeds = { lectioMessages: [{ ...message, revision: '2026-10-05T11:00' }, { ...message, id: 'm2' }], assignments: [assignment, { ...assignment, id: 'a2' }] };
  const changed = compareFeeds(seeded, feeds, now + 2000);
  assert.deepEqual(changed.messages.map(message => message.kind).sort(), ['assignment', 'message', 'message']);
  assert.equal(compareFeeds(changed, feeds, now + 3000).messages.length, 3);
  const failed = compareFeeds(changed, { lectioMessages: null, assignments: null }, now + 4000);
  assert.deepEqual(failed.feeds, changed.feeds);
  // A previously seen item disappearing and reappearing isn't new.
  const missing = compareFeeds(changed, { lectioMessages: [], assignments: [] }, now + 4000);
  assert.equal(compareFeeds(missing, feeds, now + 5000).messages.length, 3);
  assert.equal(compareFeeds(seeded, { assignments: [{ ...assignment, id: 'old-delivered', notify: false }] }, now + 2000).messages.length, 0);
});

test('notification history is bounded and retains read state', () => {
  const previous = { messages: Array.from({ length: 110 }, (_, index) => ({ id: String(index), createdAt: now - index, read: true })) };
  const next = compareSchedule(previous, [], now);
  assert.equal(next.messages.length, HISTORY_LIMIT);
  assert.equal(next.messages.every(message => message.read), true);
  assert.equal(compareSchedule(previous, [], now + 91 * 86400000).messages.length, 0);
});

test('the signed-in student owns the history, even when viewing another student', () => {
  const dom = new JSDOM(fixture('/lectio/123/SkemaNy.aspx', false), { url: context.scheduleHref });
  dom.window.document.querySelector('[id$="MainTitle"]').setAttribute('data-lectiocontextcard', 'S999');
  const resolved = scheduleContext({ authenticated: true, base: '/lectio/123/', url: context.scheduleHref }, dom.window.document);
  assert.equal(scheduleScope(resolved), '123:S9');
  assert.equal(new URL(resolved.scheduleHref).searchParams.get('elevid'), '9');
  assert.notEqual(scheduleScope(context), scheduleScope({ ...context, accountId: 'S10' }));
  assert.equal(scheduleScope({ ...context, scheduleHref: 'https://evil.example/lectio/123/SkemaNy.aspx' }), null);
  assert.equal(scheduleScope({ ...context, accountId: 'name:Demo' }), null);
  assert.equal(scheduleScope(null), null);
  assert.equal(scheduleScope(undefined), null);
  dom.window.close();
});

test('partly unreadable lessons fail the whole week, while decorative notes are ignored', () => {
  const dom = new JSDOM(schedulePage(), { url: context.scheduleHref });
  dom.window.document.querySelector('a.s2skemabrik').removeAttribute('data-tooltip');
  assert.throws(() => readSchedule(dom.window.document), /modul/);
  dom.window.close();
});

test('message and assignment readers yield serializable records with stable links', async () => {
  const feeds = await readFeeds(context, async href => new JSDOM(fixture(new URL(href).pathname, false), { url: href }).window.document);
  assert.equal(feeds.lectioMessages.length, 3);
  assert.equal(feeds.assignments.length, 4);
  assert.equal(feeds.lectioMessages[0].id, '1');
  assert.match(feeds.assignments[0].href, /exerciseid=1/);
  assert.doesNotThrow(() => structuredClone(feeds));
  const wrongAccount = await readFeeds({ ...context, accountId: 'S10' }, async href => new JSDOM(fixture(new URL(href).pathname, false), { url: href }).window.document);
  assert.deepEqual(wrongAccount, { lectioMessages: null, assignments: null });
});
