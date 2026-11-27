import { describe, expect, it } from 'vitest';
import { deadlineToEvent, planDeadlines, planSync, wantedDeadlines, lessonToEvent } from '@/lib/sync/events.js';
import { syncDeadlines } from '@/lib/sync/google.js';

const now = Date.UTC(2026, 9, 1, 12);
const item = (id: string, deadline: string, extra = {}) => ({ id, title: `Opgave ${id}`, href: `https://www.lectio.dk/lectio/1/ElevAflevering.aspx?exerciseid=${id}`, deadline, notify: true, description: '3a Da', ...extra });
const listed = (event: any, eventId: string) => ({ id: eventId, start: event.body.start, extendedProperties: event.body.extendedProperties });

describe('deadline events', () => {
  it('maps an assignment to a 30-minute event ending at the deadline', () => {
    const event = deadlineToEvent(item('7', '2026-10-07T21:30:00.000Z'))!;
    expect(event.body.summary).toBe('Aflevering: Opgave 7');
    expect(event.body.end.dateTime).toBe('2026-10-07T21:30:00.000Z');
    expect(event.body.start.dateTime).toBe('2026-10-07T21:00:00.000Z');
    expect(event.body.transparency).toBe('transparent');
    expect((event.body as any).extendedProperties.private).toMatchObject({ lxSource: 'lectiomizer', lxKind: 'deadline', lxId: '7' });
    expect(deadlineToEvent(item('8', ''))).toBeNull();
  });
  it('wants only future deadlines not handed in', () => {
    const wanted = wantedDeadlines([
      item('1', '2026-10-07T21:30:00.000Z'),
      item('2', '2026-09-01T21:30:00.000Z'),
      item('3', '2026-10-07T21:30:00.000Z', { notify: false }),
      item('4', '2026-10-07T21:30:00.000Z', { delivered: true }),
      item('1', '2026-10-07T21:30:00.000Z'),
    ], now);
    expect(wanted.map((e) => e.id)).toEqual(['1']);
  });
  it('inserts new, updates changed and removes handed-in or duplicate events', () => {
    const a = deadlineToEvent(item('1', '2026-10-07T21:30:00.000Z'))!;
    const b = deadlineToEvent(item('2', '2026-10-08T21:30:00.000Z'))!;
    const old = deadlineToEvent(item('2', '2026-10-09T21:30:00.000Z'))!;
    const gone = deadlineToEvent(item('3', '2026-10-09T21:30:00.000Z'))!;
    const plan = planDeadlines([a, b], [listed(old, 'g2'), listed(gone, 'g3'), listed(old, 'g2b')]);
    expect(plan.insert.map((e) => e.id)).toEqual(['1']);
    expect(plan.update.map((e) => e.eventId)).toEqual(['g2']);
    expect(plan.remove.sort()).toEqual(['g2b', 'g3']);
  });
  it('is left alone by the lesson sync', () => {
    const deadline = deadlineToEvent(item('1', '2026-10-05T21:30:00.000Z'))!;
    const plan = planSync([], [{ id: 'd1', start: { dateTime: '2026-10-05T23:00:00+02:00' }, extendedProperties: (deadline.body as any).extendedProperties }], new Set(['2026-10-05']));
    expect(plan.remove).toEqual([]);
    // …while a stale lesson on a read day still goes.
    const lesson = lessonToEvent({ id: 'absid:1', start: '2026-10-05T08:15', end: '2026-10-05T09:45', holds: ['x'] })!;
    expect(planSync([], [{ id: 'l1', start: { dateTime: '2026-10-05T08:15:00+02:00' }, extendedProperties: (lesson.body as any).extendedProperties }], new Set(['2026-10-05'])).remove).toEqual(['l1']);
  });
});

describe('syncDeadlines', () => {
  it('lists only deadline events and applies the plan', async () => {
    const stale = deadlineToEvent(item('9', '2026-10-09T21:30:00.000Z'))!;
    const calls: Array<[string, string, any]> = [];
    const client = {
      async request(method: string, path: string, opts: any = {}) {
        calls.push([method, path, opts]);
        if (method === 'GET') return { items: [listed(stale, 'g9')] };
        return {};
      },
    };
    const result = await syncDeadlines(client, { calendarId: 'cal', assignments: [item('1', '2026-10-07T21:30:00.000Z')], now });
    expect(result).toEqual({ deadlines: 1, added: 1, updated: 0, removed: 1 });
    expect(calls[0][2].query.privateExtendedProperty).toBe('lxKind=deadline');
    expect(calls.filter((c) => c[0] === 'POST')).toHaveLength(1);
    expect(calls.find((c) => c[0] === 'DELETE')![1]).toBe('/calendars/cal/events/g9');
  });
});
