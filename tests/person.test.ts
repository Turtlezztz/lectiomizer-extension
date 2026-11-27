import { describe, expect, it } from 'vitest';
import { parseEntry } from '@/features/people/directory';
import { findEntry, holdsOf, nowStatus, parseRef } from '@/features/people/person';
import { toLessons, type RawLesson } from '@/features/schedule/lessons';

const L = 'https://www.lectio.dk/lectio/123/';
const teachers = [
  parseEntry({ kind: 'laerer', id: '11', label: 'Lene Madsen (lm)', href: `${L}SkemaNy.aspx?laererid=11` }),
  parseEntry({ kind: 'laerer', id: '12', label: 'Thomas Nielsen (tn)', href: `${L}SkemaNy.aspx?laererid=12` }),
];
const students = [
  parseEntry({ kind: 'elev', id: '21', label: 'Anna Andersen (3a 01)', href: `${L}SkemaNy.aspx?elevid=21` }),
  parseEntry({ kind: 'elev', id: '22', label: 'Anna Andersen (1x 04)', href: `${L}SkemaNy.aspx?elevid=22` }),
  parseEntry({ kind: 'elev', id: '23', label: 'Bjørn Holm (2b 12)', href: `${L}SkemaNy.aspx?elevid=23` }),
];

describe('person references', () => {
  it('reads name, class or initials and guesses student vs teacher', () => {
    expect(parseRef({ full: 'Lene Madsen (lm)' })).toEqual({ name: 'Lene Madsen', code: 'lm', kind: 'laerer', card: '' });
    expect(parseRef({ full: 'Jonathan Hansen(k) (1x 17)' })).toEqual({ name: 'Jonathan Hansen', code: '1x 17', kind: 'elev', card: '' });
    expect(parseRef({ full: 'lm' })).toEqual({ name: '', code: 'lm', kind: 'laerer', card: '' });
    expect(parseRef({ name: 'Anna', id: 'S21' })).toMatchObject({ name: 'Anna', kind: 'elev', card: 'S21' });
    expect(parseRef({ name: 'Lene', id: 'T11' }).kind).toBe('laerer');
    expect(parseRef({ name: 'Ukendt', id: 'U5' })).toMatchObject({ kind: null, card: 'U5' });
    expect(parseRef({ name: 'Ingen', id: 'HE99' }).card).toBe('');
  });

  it('finds teachers by initials and students by name and class', () => {
    expect(findEntry(teachers, parseRef({ full: 'lm' }))?.id).toBe('11');
    expect(findEntry(teachers, parseRef({ full: 'Thomas Nielsen (tn)' }))?.id).toBe('12');
    expect(findEntry(students, parseRef({ full: 'Anna Andersen (1x 04)' }))?.id).toBe('22');
    expect(findEntry(students, { name: 'Anna Andersen', code: '3a', kind: 'elev' })?.id).toBe('21');
    expect(findEntry(students, { name: 'bjorn holm', code: '', kind: 'elev' })?.id).toBe('23');
    expect(findEntry(students, { name: 'Ingen Her', code: '', kind: 'elev' })).toBeUndefined();
  });
});

const raw = (id: string, start: string, end: string, holds: string[], extra: Partial<RawLesson> = {}): RawLesson => ({
  id, start, end, status: 'normal', title: '', holds, teachers: ['lm'], rooms: ['1.07'], details: '', href: `${L}aktivitet/aktivitetforside2.aspx?absid=${id}`, ...extra,
});

describe('person now and holds', () => {
  const lessons = toLessons([
    raw('1', '2026-11-27T08:15:00', '2026-11-27T09:45:00', ['3a Ma']),
    raw('2', '2026-11-27T10:00:00', '2026-11-27T11:30:00', ['3a Da']),
    raw('3', '2026-11-26T10:00:00', '2026-11-26T11:30:00', ['3a Fy'], { status: 'cancelled' }),
  ]);

  it('says what they are doing now', () => {
    const busy = nowStatus(lessons, new Date('2026-11-27T09:00:00'), 'elev');
    expect(busy).toMatchObject({ busy: true, title: 'I undervisning til 11:30', sub: '3a Ma · 1.07' });
    expect(busy.lesson?.id).toBe('1');
    expect(nowStatus(lessons, new Date('2026-11-27T07:00:00'), 'elev').title).toBe('Fri nu · næste kl. 08:15');
    expect(nowStatus(lessons, new Date('2026-11-27T13:00:00'), 'elev').title).toBe('Færdig for i dag');
  });

  it('merges the card hold line with the holds on their schedule', () => {
    const profile = { name: '', role: '', photo: null, links: [], details: [{ label: 'Hold', value: '3a Da, 3a En' }] };
    expect(holdsOf(profile, lessons)).toEqual(['3a Da', '3a En', '3a Ma']);
  });
});
