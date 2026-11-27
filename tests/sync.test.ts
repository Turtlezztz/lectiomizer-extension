// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { setTransport } from '@/lib/lectio/client';
import { readLectio } from '@/lib/sync/read';
import { compareFeeds, compareSchedule, scheduleScope } from '@/lib/sync/changes.js';
import { lessonToEvent, planSync } from '@/lib/sync/events.js';
import { authorize } from '@/lib/sync/google.js';
import { noticeChanges } from '@/lib/sync/notice';
import { SYNC_DEFAULTS, isCheckDue } from '@/lib/sync/store';

const lesson = (patch = {}) => ({ id: 'absid:1', start: '2030-01-07T08:15', end: '2030-01-07T09:45', title: '', status: 'normal', holds: ['3a Da'], teachers: ['lm'], rooms: ['A12'], details: '', href: 'https://www.lectio.dk/lectio/1/aktivitet/aktivitetforside2.aspx?absid=1', ...patch });
const week = (lessons: object[]) => [{ dates: ['2030-01-07', '2030-01-08', '2030-01-09', '2030-01-10', '2030-01-11', '2030-01-12', '2030-01-13'], lessons }];
const now = new Date('2030-01-06T12:00:00').getTime();

describe('change detection', () => {
  it('stays silent on the first read, then reports changes with before/after', () => {
    const first = compareSchedule({}, week([lesson()]), now);
    expect(first.messages).toHaveLength(0);
    const second = compareSchedule(first, week([lesson({ rooms: ['B21'] })]), now + 1000);
    expect(second.messages).toHaveLength(1);
    expect(second.messages[0].kind).toBe('changed');
    expect(noticeChanges(second.messages[0])).toEqual([{ label: 'Lokale', before: 'A12', after: 'B21' }]);
  });
  it('reports cancelled, removed and restored lessons', () => {
    const base = compareSchedule({}, week([lesson()]), now);
    expect(compareSchedule(base, week([lesson({ status: 'cancelled' })]), now + 1).messages[0].kind).toBe('cancelled');
    expect(compareSchedule(base, week([]), now + 1).messages[0].kind).toBe('removed');
  });
  it('baselines feeds, then reports new messages and replies', () => {
    const items = [{ id: '1', title: 'Hej', href: 'x', revision: 'a' }];
    const first = compareFeeds({}, { lectioMessages: items, assignments: null }, now);
    expect(first.messages).toHaveLength(0);
    const next = compareFeeds(first, { lectioMessages: [...items, { id: '2', title: 'Ny', href: 'y', revision: 'b' }], assignments: null }, now + 1);
    expect(next.messages.map((m: any) => m.item.id)).toEqual(['2']);
    const reply = compareFeeds(next, { lectioMessages: [{ ...items[0], revision: 'c' }], assignments: null }, now + 2);
    expect(reply.messages[0].item.id).toBe('1');
  });
});

describe('google calendar plan', () => {
  it('inserts, updates and removes only on read dates', () => {
    const a = lessonToEvent(lesson())!;
    const b = lessonToEvent(lesson({ id: 'absid:2' }))!;
    const existingA = { id: 'ga', start: { dateTime: '2030-01-07T08:15:00+01:00' }, extendedProperties: { private: { lxSource: 'lectiomizer', lxId: 'absid:1', lxHash: 'old' } } };
    const stale = { id: 'gs', start: { dateTime: '2030-01-08T08:15:00+01:00' }, extendedProperties: { private: { lxSource: 'lectiomizer', lxId: 'absid:9', lxHash: 'x' } } };
    const other = { id: 'go', start: { dateTime: '2030-02-01T08:15:00+01:00' }, extendedProperties: { private: { lxSource: 'lectiomizer', lxId: 'absid:8', lxHash: 'x' } } };
    const plan = planSync([a, b], [existingA, stale, other], new Set(week([])[0].dates));
    expect(plan.insert.map((e: any) => e.id)).toEqual(['absid:2']);
    expect(plan.update.map((e: any) => e.eventId)).toEqual(['ga']);
    expect(plan.remove).toEqual(['gs']);
  });
});

describe('readLectio over fixtures', () => {
  it('reads context, weeks and feeds', async () => {
    const index: Record<string, string> = JSON.parse(readFileSync('fixtures/index.json', 'utf8'));
    setTransport({
      async request(url) {
        const path = new URL(url).pathname.toLowerCase();
        const key = Object.keys(index).find((k) => k.split('?')[0] === path);
        return key ? { url, status: 200, html: readFileSync('fixtures/' + index[key], 'utf8') } : { url, status: 404, html: '' };
      },
    });
    const result = await readLectio({ schoolId: '123', weekCount: 2, now: new Date('2026-10-05T07:00:00').getTime() });
    expect(result.context.accountId).toBe('S9');
    expect(scheduleScope(result.context)).toBe('123:S9');
    expect(Array.isArray(result.feeds.lectioMessages)).toBe(true);
    expect(Array.isArray(result.feeds.assignments)).toBe(true);
    expect(result.weeks[0].lessons?.length).toBeGreaterThan(0);
  });
});

describe('check scheduling', () => {
  const checkedAt = new Date('2030-01-06T12:00:00').getTime();
  const fiveMinsLater = checkedAt + 5 * 60_000;
  const hourLater = checkedAt + 60 * 60_000;

  it('checks on open/reload regardless of interval when checkOnOpen is enabled', () => {
    expect(SYNC_DEFAULTS.checkOnOpen).toBe(true);
    expect(isCheckDue({ ...SYNC_DEFAULTS, interval: 60, checkOnOpen: true }, checkedAt, { now: fiveMinsLater, onOpen: true })).toBe(true);
    // Periodic alarms still wait for the interval.
    expect(isCheckDue({ ...SYNC_DEFAULTS, interval: 60, checkOnOpen: true }, checkedAt, { now: fiveMinsLater })).toBe(false);
    expect(isCheckDue({ ...SYNC_DEFAULTS, interval: 60, checkOnOpen: true }, checkedAt, { now: hourLater })).toBe(true);
  });

  it('skips open/reload checks before the interval when checkOnOpen is disabled', () => {
    expect(isCheckDue({ ...SYNC_DEFAULTS, interval: 60, checkOnOpen: false }, checkedAt, { now: fiveMinsLater, onOpen: true })).toBe(false);
    // Still checks if the interval has elapsed or when forced.
    expect(isCheckDue({ ...SYNC_DEFAULTS, interval: 60, checkOnOpen: false }, checkedAt, { now: hourLater, onOpen: true })).toBe(true);
    expect(isCheckDue({ ...SYNC_DEFAULTS, interval: 60, checkOnOpen: false }, checkedAt, { now: fiveMinsLater, force: true })).toBe(true);
  });
});

describe('google sign-in in a tab (Firefox)', () => {
  const REDIRECT = 'https://abc.extensions.allizom.org/';
  const fakeTabs = () => {
    const listeners = { updated: [] as Function[], removed: [] as Function[] };
    const ev = (list: Function[]) => ({ addListener: (f: Function) => list.push(f), removeListener: (f: Function) => list.splice(list.indexOf(f), 1) });
    const tabs = {
      opened: [] as string[], closed: [] as number[], listeners,
      onUpdated: ev(listeners.updated), onRemoved: ev(listeners.removed),
      create: async ({ url }: { url: string }) => { tabs.opened.push(url); return { id: 7 }; },
      remove: async (id: number) => { tabs.closed.push(id); },
    };
    return tabs;
  };
  const identity = { getRedirectURL: () => REDIRECT, launchWebAuthFlow: () => Promise.reject(new Error('not used')) };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('reads the token from the redirect and closes the tab', async () => {
    const tabs = fakeTabs();
    const pending = authorize(identity, 'id', { interactive: true, tabs });
    await tick();
    expect(tabs.opened[0]).toContain('accounts.google.com');
    tabs.listeners.updated.forEach((f) => f(3, { url: REDIRECT + '#access_token=other' }));
    tabs.listeners.updated.forEach((f) => f(7, { url: 'https://accounts.google.com/consent' }));
    tabs.listeners.updated.forEach((f) => f(7, { url: REDIRECT + '#access_token=tok&expires_in=60&scope=https://www.googleapis.com/auth/calendar.app.created' }));
    const auth = await pending;
    expect(auth.token).toBe('tok');
    expect(tabs.closed).toEqual([7]);
    expect(tabs.listeners.updated).toHaveLength(0);
  });

  it('fails when the user closes the tab', async () => {
    const tabs = fakeTabs();
    const pending = authorize(identity, 'id', { interactive: true, tabs });
    await tick();
    tabs.listeners.removed.forEach((f) => f(7));
    await expect(pending).rejects.toThrow(/afbrudt/);
  });
});
