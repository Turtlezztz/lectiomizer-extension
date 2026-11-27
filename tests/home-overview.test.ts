import { describe, expect, it } from 'vitest';
import {
  addCountdown, columnSections, countdownText, DEFAULT_LAYOUT, moveSection, normalizeLayout, pruneCountdowns, toggleSection, tonightItems, tonightTarget, targetLabel,
  type Countdown,
} from '@/features/home/overview';
import type { Need } from '@/features/home/model';
import type { Todo } from '@/features/homework/todo-model';

const LESSON = (id: number) => `https://www.lectio.dk/lectio/123/aktivitet/aktivitetforside2.aspx?absid=${id}`;
const thuEvening = new Date(2026, 10, 26, 19, 0);
const friEvening = new Date(2026, 10, 27, 19, 0);

describe('I aften', () => {
  it('targets tomorrow, skipping the weekend, and today before 5', () => {
    expect(tonightTarget(thuEvening)).toEqual(new Date(2026, 10, 27));
    expect(tonightTarget(friEvening)).toEqual(new Date(2026, 10, 30));
    expect(tonightTarget(new Date(2026, 10, 26, 2, 0))).toEqual(new Date(2026, 10, 26));
    expect(targetLabel(tonightTarget(thuEvening), thuEvening)).toBe('i morgen');
    expect(targetLabel(tonightTarget(friEvening), friEvening)).toBe('mandag');
  });

  it('collects the next day’s homework, due to-dos and assignments within 48 hours', () => {
    const needs: Need[] = [
      { kind: 'homework', title: 'Læs novellen', context: '3a Da', href: LESSON(1), due: new Date(2026, 10, 30, 8, 15), urgent: false },
      { kind: 'homework', title: 'Opgave 4', context: '3a Ma', href: LESSON(2), due: new Date(2026, 10, 30, 10, 0), urgent: false },
      { kind: 'homework', title: 'Senere', context: '3a En', href: LESSON(3), due: new Date(2026, 11, 1, 8, 15), urgent: false },
      { kind: 'assignment', title: 'Rapport', context: '3a Fy', href: null, due: new Date(2026, 10, 29, 23, 59), urgent: true },
      { kind: 'assignment', title: 'SOP', context: '', href: null, due: new Date(2026, 11, 20, 12, 0), urgent: false },
      { kind: 'absence', title: 'Fravær', context: 'Fravær', href: null, due: null, urgent: true },
    ];
    const todos: Todo[] = [
      { id: 'a', text: 'Pak taske', date: '2026-11-30', done: false, createdAt: 0 },
      { id: 'b', text: 'Glemt', date: '2026-11-25', done: false, createdAt: 0 },
      { id: 'c', text: 'Gammel færdig', date: '2026-11-25', done: true, createdAt: 0 },
      { id: 'd', text: 'Uden dato', date: null, done: false, createdAt: 0 },
      { id: 'e', text: 'Senere', date: '2026-12-02', done: false, createdAt: 0 },
    ];
    const items = tonightItems(needs, todos, (key) => key === 'l:2', friEvening);
    expect(items.map((i) => [i.kind, i.title, i.done])).toEqual([
      ['homework', 'Læs novellen', false],
      ['assignment', 'Rapport', false],
      ['todo', 'Pak taske', false],
      ['todo', 'Glemt', false],
      ['homework', 'Opgave 4', true],
    ]);
    expect(items[0].key).toBe('l:1');
    expect(tonightItems([], [], () => false, friEvening)).toEqual([]);
  });
});

describe('nedtællinger', () => {
  const now = new Date(2026, 10, 27, 12, 0);
  it('says how many days are left', () => {
    expect(countdownText(new Date(2026, 10, 27, 23, 59), now)).toBe('i dag');
    expect(countdownText(new Date(2026, 10, 28), now)).toBe('i morgen');
    expect(countdownText(new Date(2026, 11, 18), now)).toBe('21 dage');
  });
  it('adds in date order, replaces a pinned source and drops passed days', () => {
    let list: Countdown[] = [];
    list = addCountdown(list, { title: ' Terminsprøve ', at: new Date(2027, 0, 15).getTime() }, now);
    list = addCountdown(list, { title: 'SOP', at: new Date(2026, 11, 18).getTime(), source: 'opg-1' }, now);
    list = addCountdown(list, { title: 'SOP (ny frist)', at: new Date(2026, 11, 19).getTime(), source: 'opg-1' }, now);
    expect(list.map((c) => c.title)).toEqual(['SOP (ny frist)', 'Terminsprøve']);
    const withPast = [{ id: 'x', title: 'Gammel', at: new Date(2026, 10, 20).getTime() }, ...list];
    expect(pruneCountdowns(withPast, now).map((c) => c.title)).toEqual(['SOP (ny frist)', 'Terminsprøve']);
    expect(pruneCountdowns(list, now)).toBe(list);
  });
});

describe('tilpas overblikket', () => {
  it('normalizes stored layouts', () => {
    expect(normalizeLayout(undefined)).toEqual(DEFAULT_LAYOUT);
    const l = normalizeLayout({ order: ['messages', 'bogus' as never, 'needs'], hidden: ['notices', 'nope' as never] });
    expect(l.hidden).toEqual(['notices']);
    expect(l.order).toHaveLength(DEFAULT_LAYOUT.order.length);
    expect(l.order.indexOf('messages')).toBeLessThan(l.order.indexOf('needs'));
  });
  it('moves within a column and hides cards', () => {
    let l = normalizeLayout({});
    expect(columnSections(l, 'main')).toEqual(['countdowns', 'tonight', 'needs', 'messages', 'notices']);
    l = moveSection(l, 'needs', -1);
    expect(columnSections(l, 'main')).toEqual(['countdowns', 'needs', 'tonight', 'messages', 'notices']);
    expect(moveSection(l, 'countdowns', -1)).toBe(l);
    expect(moveSection(l, 'notices', 1)).toBe(l);
    l = moveSection(l, 'timeline', 1);
    expect(columnSections(l, 'side')).toEqual(['other', 'timeline']);
    l = toggleSection(l, 'messages');
    expect(columnSections(l, 'main')).not.toContain('messages');
    expect(columnSections(toggleSection(l, 'messages'), 'main')).toContain('messages');
  });
});
