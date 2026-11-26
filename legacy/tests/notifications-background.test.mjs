import test from 'node:test';
import assert from 'node:assert/strict';
import { isoWeek } from '../src/readers/schedule.js';

const store = {};
const session = {};
let googleCalls = 0;
globalThis.fetch = async () => { googleCalls++; return new Response('{"error":{"message":"Forbidden"}}', { status: 403, headers: { 'Content-Type': 'application/json' } }); };
let handler;
const noopEvent = { addListener() {}, removeListener() {} };
const area = values => ({ get: async key => ({ [key]: structuredClone(values[key]) }), set: async patch => Object.assign(values, structuredClone(patch)), remove: async key => { delete values[key]; } });
globalThis.browser = {
  storage: { local: area(store), session: area(session), onChanged: noopEvent },
  runtime: { id: 'test', onMessage: { addListener(fn) { handler = fn; } }, onConnect: noopEvent },
  tabs: { onUpdated: noopEvent, onRemoved: noopEvent },
  webRequest: { onBeforeRequest: noopEvent },
  permissions: { contains: async () => true },
};
await import('../src/background.js');
const { claimSchedule, observeSchedule, markScheduleRead, loadScheduleState } = await import('../src/notifications/store.js');
const context = { scheduleHref: 'https://www.lectio.dk/lectio/123/SkemaNy.aspx?type=elev&elevid=9', accountId: 'S9' };
const sender = { tab: { id: 1 }, url: 'https://www.lectio.dk/lectio/123/forside.aspx' };
const feeds = { lectioMessages: [], assignments: [] };
const currentWeek = isoWeek(new Date());
const lesson = { id: 'absid:1', title: '', holds: ['3a Da'], rooms: ['A12'], teachers: [], details: '', start: `${currentWeek.dates[6]}T21:00`, end: `${currentWeek.dates[6]}T22:30`, status: 'normal' };
const weeks = value => [{ dates: currentWeek.dates, lessons: [value] }];
const snapshot = async () => (await loadScheduleState()).accounts['123:S9'];

test('two tabs share one read claim; stale replies cannot overwrite the next snapshot', async () => {
  const now = Date.now();
  const claims = await Promise.all([claimSchedule(context, { now }), claimSchedule(context, { now })]);
  assert.equal(claims.filter(claim => claim.started).length, 1);
  assert.equal(claims[1].busy, true);
  const next = await claimSchedule(context, { now: now + 180001 });
  assert.equal(next.started, true);
  assert.deepEqual(await observeSchedule(context, weeks(lesson), claims[0].token, 0, now, feeds), { ok: false, stale: true });
  await observeSchedule(context, weeks(lesson), next.token, 0, now + 180002, feeds);
  assert.equal((await snapshot()).lessons.length, 1);
});

test('marking a displayed set read preserves a notification arriving in another tab', async () => {
  const now = Date.now() + 200000;
  const claim = await claimSchedule(context, { now, force: true });
  await observeSchedule(context, weeks({ ...lesson, rooms: ['A14'] }), claim.token, 0, now, feeds);
  const ids = (await snapshot()).messages.map(message => message.id);
  const next = await claimSchedule(context, { now: now + 1, force: true });
  await observeSchedule(context, weeks({ ...lesson, rooms: ['A14'], status: 'cancelled' }), next.token, 0, now + 1, feeds);
  await markScheduleRead(context, ids);
  const messages = (await snapshot()).messages;
  assert.equal(messages.filter(message => !message.read).length, 1);
  assert.equal(messages.find(message => !message.read).kind, 'cancelled');
  const other = { ...context, accountId: 'S10' };
  const otherClaim = await claimSchedule(other, { now });
  await observeSchedule(other, weeks(lesson), otherClaim.token, 0, now, feeds);
  assert.equal((await loadScheduleState()).accounts['123:S10'].messages.length, 0);
});

test('runtime commits local notifications without Google, and keeps them when Google fails', async () => {
  delete store.scheduleHistory;
  store.calendar = { connected: false, weeks: 1 };
  googleCalls = 0;
  let claim = await handler({ type: 'schedule:claim', context, force: true }, sender);
  await handler({ type: 'schedule:sync', context, token: claim.token, weeks: weeks(lesson), feeds, unread: 0 }, sender);
  assert.equal((await snapshot()).messages.length, 0);
  claim = await handler({ type: 'schedule:claim', context, force: true }, sender);
  const local = await handler({ type: 'schedule:sync', context, token: claim.token, weeks: weeks({ ...lesson, rooms: ['A14'] }), feeds, unread: 0 }, sender);
  assert.equal(local.ok, true);
  assert.equal(googleCalls, 0);
  assert.equal((await snapshot()).messages.length, 1);
  store.calendar = { connected: true, weeks: 1, calendarId: 'existing' };
  session.googleToken = { token: 'fake', expires: Date.now() + 3600000, obtained: Date.now() };
  claim = await handler({ type: 'schedule:claim', context, force: true }, sender);
  const result = await handler({ type: 'schedule:sync', context, token: claim.token, weeks: weeks({ ...lesson, rooms: ['A14'], status: 'cancelled' }), feeds, unread: 0 }, sender);
  assert.equal(result.ok, true);
  assert.equal(result.calendar.ok, false);
  assert.ok(googleCalls > 0);
  assert.equal((await snapshot()).messages.length, 2);
  assert.equal((await snapshot()).status.state, 'ok');
  assert.equal(store.calendarStatus.state, 'error');
});

test('runtime rejects other origins, schools and malformed collections', async () => {
  const before = structuredClone(store);
  assert.equal(handler({ type: 'schedule:claim', context }, { ...sender, url: 'https://evil.example/' }), undefined);
  assert.equal(handler({ type: 'schedule:claim', context: { ...context, scheduleHref: context.scheduleHref.replace('/123/', '/456/') } }, sender), undefined);
  assert.equal(handler({ type: 'schedule:sync', context, weeks: weeks({ ...lesson, start: 'invalid' }), feeds }, sender), undefined);
  assert.equal(handler({ type: 'schedule:sync', context, weeks: [], feeds: { lectioMessages: [{}], assignments: null } }, sender), undefined);
  assert.deepEqual(store, before);
});
