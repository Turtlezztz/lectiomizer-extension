import { describe, expect, it } from 'vitest';
import { parseEntry } from '@/features/people/directory';
import { dateFromShort, dayPlan, findRoom } from '@/features/rooms/room';
import { toLessons, type RawLesson } from '@/features/schedule/lessons';

const L = 'https://www.lectio.dk/lectio/123/';
const room = (id: string, label: string) => parseEntry({ kind: 'lokale', id, label, href: `${L}SkemaNy.aspx?type=lokale&id=${id}` });
const rooms = [room('1', 'A12 Klasselokale'), room('2', 'A120 Fysik'), room('3', 'Hal 1'), room('4', '1.07 Kemi (lab)')];

describe('rooms', () => {
  it('finds a room from the symbol lessons use', () => {
    expect(findRoom(rooms, 'A12')?.id).toBe('1');
    expect(findRoom(rooms, 'a120')?.id).toBe('2');
    expect(findRoom(rooms, 'Hal 1')?.id).toBe('3');
    expect(findRoom(rooms, '1.07')?.id).toBe('4');
    expect(findRoom(rooms, 'Z99')).toBeUndefined();
    expect(findRoom(rooms, '')).toBeUndefined();
  });

  it('lays out a day with the free time between bookings', () => {
    const raw = (id: string, start: string, end: string): RawLesson => ({ id, start: `2026-11-27T${start}:00`, end: `2026-11-27T${end}:00`, status: 'normal', title: '', holds: ['3a Ma'], teachers: [], rooms: ['A12'], details: '', href: null });
    const plan = dayPlan(toLessons([raw('1', '08:15', '09:45'), raw('2', '09:55', '11:25'), raw('3', '12:30', '14:00')]));
    expect(plan.map((p) => p.type)).toEqual(['busy', 'busy', 'free', 'busy']);
    const free = plan[2] as Extract<(typeof plan)[number], { type: 'free' }>;
    expect([free.from.getHours(), free.from.getMinutes(), free.to.getHours(), free.to.getMinutes()]).toEqual([11, 25, 12, 30]);
  });

  it('reads short lesson dates in the nearest year', () => {
    const now = new Date(2026, 0, 10);
    expect(dateFromShort('ma 28/12', now)?.getFullYear()).toBe(2025);
    expect(dateFromShort('ti 13/1', now)?.getMonth()).toBe(0);
    expect(dateFromShort('3/2-2027', now)?.getFullYear()).toBe(2027);
    expect(dateFromShort('', now)).toBeNull();
  });
});
