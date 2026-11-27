import { describe, expect, it } from 'vitest';
import { checkedText, lessonName, nextLesson, popupView, usesPopup, whenText } from '@/entrypoints/popup/model';
import type { History, Lesson, Notice } from '@/lib/sync/store';

const lesson = (patch: Partial<Lesson> = {}): Lesson => ({
  id: 'absid:1',
  start: '2030-01-07T08:15',
  end: '2030-01-07T09:45',
  title: '',
  status: 'normal',
  holds: ['3a Da'],
  rooms: ['A12'],
  href: 'https://www.lectio.dk/lectio/1/aktivitet/aktivitetforside2.aspx?absid=1',
  ...patch,
});
const notice = (kind: Notice['kind'], read = false): Notice => ({ id: `${kind}:${Math.random()}`, kind, createdAt: 0, read });
const history = (account: History['accounts'][string]): History => ({ current: '1:S1', accounts: { '1:S1': account } });

describe('toolbar popup', () => {
  it('only attaches the popup once a school is chosen and while turned on', () => {
    expect(usesPopup(null)).toBe(false);
    expect(usesPopup({ school: null })).toBe(false);
    expect(usesPopup({ school: { id: '1' } })).toBe(true);
    expect(usesPopup({ school: { id: '1' }, toolbarPopup: true })).toBe(true);
    expect(usesPopup({ school: { id: '1' }, toolbarPopup: false })).toBe(false);
  });

  it('picks the running lesson, else the next one, skipping cancelled and finished ones', () => {
    const lessons = [
      lesson({ id: 'a', start: '2030-01-07T08:15', end: '2030-01-07T09:45' }),
      lesson({ id: 'b', start: '2030-01-07T10:00', end: '2030-01-07T11:30', status: 'cancelled' }),
      lesson({ id: 'c', start: '2030-01-07T12:00', end: '2030-01-07T13:30', href: null }),
    ];
    const running = nextLesson(lessons, new Date('2030-01-07T09:00'));
    expect(running?.lesson.id).toBe('a');
    expect(running?.live).toBe(true);
    expect(running?.route).toBe('/lesson/1');
    const next = nextLesson(lessons, new Date('2030-01-07T09:50'));
    expect(next?.lesson.id).toBe('c');
    expect(next?.live).toBe(false);
    expect(next?.route).toBeNull();
    expect(nextLesson(lessons, new Date('2030-01-07T14:00'))).toBeNull();
    expect(nextLesson(undefined)).toBeNull();
  });

  it('says when the lesson is', () => {
    const [a] = [lesson()];
    expect(whenText(nextLesson([a], new Date('2030-01-07T08:03'))!, new Date('2030-01-07T08:03'))).toBe('om 12 min');
    expect(whenText(nextLesson([a], new Date('2030-01-07T09:25'))!, new Date('2030-01-07T09:25'))).toBe('slutter om 20 min');
    expect(whenText(nextLesson([a], new Date('2030-01-06T20:00'))!, new Date('2030-01-06T20:00'))).toBe('i morgen kl. 08:15');
  });

  it('counts unread notices by kind and works out the state', () => {
    const view = popupView(
      history({
        lessons: [lesson()],
        messages: [notice('message'), notice('message'), notice('message', true), notice('assignment'), notice('changed'), notice('cancelled'), notice('grade' as Notice['kind'])],
        status: { state: 'ok', checkedAt: 5 },
      }),
      new Date('2030-01-07T08:00'),
    );
    expect(view.state).toBe('ready');
    expect(view.counts).toEqual({ messages: 2, assignments: 1, changes: 2 });
    expect(view.next?.lesson.id).toBe('absid:1');
    expect(view.checkedAt).toBe(5);

    expect(popupView({ accounts: {} }).state).toBe('empty');
    expect(popupView(null).state).toBe('empty');
    expect(popupView(history({ lessons: [], status: { state: 'error', login: true } })).state).toBe('login');
  });

  it('formats the last check and the lesson name', () => {
    const now = new Date('2030-01-07T12:00');
    expect(checkedText(undefined, now)).toBe('');
    expect(checkedText(now.getTime() - 20_000, now)).toBe('Tjekket lige nu');
    expect(checkedText(now.getTime() - 12 * 60_000, now)).toBe('Tjekket for 12 min siden');
    expect(checkedText(new Date('2030-01-07T09:05').getTime(), now)).toBe('Tjekket kl. 09:05');
    expect(checkedText(new Date('2030-01-06T14:05').getTime(), now)).toBe('Tjekket i går kl. 14:05');
    expect(lessonName(lesson())).toBe('3a Da');
    expect(lessonName(lesson({ title: 'Prøve' }))).toBe('3a Da · Prøve');
    expect(lessonName(lesson({ holds: [], title: '' }))).toBe('Modul');
  });
});
