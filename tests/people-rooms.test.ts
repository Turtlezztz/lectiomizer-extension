// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseDocument } from '@/lib/lectio/client';
import { appRoute, assignmentPath, assignmentRoute } from '@/lib/lectio/paths';
import { readElevId } from '@/lib/lectio/query';
import { readDirectory, scheduleTarget } from '@/lib/lectio/readers/directory.js';
import { parseEntry, pool, schedulePath, searchEntries, sortEntries } from '@/features/people/directory';
import { occupancyAt } from '@/features/schedule/occupancy';
import { toLessons, type RawLesson } from '@/features/schedule/lessons';
import { weekPath } from '@/features/schedule/week';

const L = 'https://www.lectio.dk/lectio/123/';

describe('assignment links', () => {
  it('keeps the elevid Lectio needs to open an assignment', () => {
    expect(appRoute(`${L}ElevAflevering.aspx?elevid=9&exerciseid=1001&prevurl=OpgaverElev.aspx`)).toBe('/assignments/1001?elevid=9');
    expect(appRoute(`${L}ElevAflevering.aspx?exerciseid=1001`)).toBe('/assignments/1001');
    expect(assignmentRoute('1001', null)).toBe('/assignments/1001');
    expect(assignmentPath('1001', '9')).toBe('ElevAflevering.aspx?elevid=9&exerciseid=1001&prevurl=OpgaverElev.aspx');
  });
  it('reads the signed-in elevid from the page', () => {
    const meta = parseDocument('<html><head><meta name="msapplication-starturl" content="/lectio/123/SkemaNy.aspx?type=elev&amp;elevid=42"></head><body></body></html>', `${L}forside.aspx`);
    expect(readElevId(meta)).toBe('42');
    const nav = parseDocument('<html><body><div id="s_m_mastermenu"><a href="/lectio/123/SkemaNy.aspx?type=elev&amp;elevid=77">Skema</a></div></body></html>', `${L}forside.aspx`);
    expect(readElevId(nav)).toBe('77');
    expect(readElevId(parseDocument('<html><body></body></html>', `${L}forside.aspx`))).toBeNull();
  });
});

describe('schedule routes', () => {
  it('routes student, teacher and room schedules in-app', () => {
    expect(appRoute(`${L}SkemaNy.aspx?type=elev&elevid=5`)).toBe('/students/5');
    expect(appRoute(`${L}SkemaNy.aspx?type=laerer&laererid=6`)).toBe('/teachers/6');
    expect(appRoute(`${L}SkemaNy.aspx?type=lokale&nosubnav=1&id=7`)).toBe('/rooms/7');
    expect(appRoute(`${L}SkemaNy.aspx`)).toBe('/schedule');
  });
  it('adds the week to a schedule path that already has a query', () => {
    expect(weekPath(schedulePath('lokale', '7'), { week: 4, year: 2026 })).toBe('SkemaNy.aspx?type=lokale&nosubnav=1&id=7&week=042026');
    expect(weekPath('SkemaNy.aspx', { week: 48, year: 2026 })).toBe('SkemaNy.aspx?week=482026');
  });
});

describe('readDirectory', () => {
  const html = `<html><body><div id="s_m_mastermenu"><a href="/lectio/123/SkemaNy.aspx?type=elev&amp;elevid=9">Skema</a></div>
    <div id="contenttable"><a href="FindSkema.aspx?type=elev&amp;forbogstav=A">A</a><a href="FindSkema.aspx?type=elev&amp;forbogstav=B">B</a>
    <div id="m_Content_listecontainer"><ul>
      <li><a href="/lectio/123/SkemaNy.aspx?type=elev&amp;elevid=1">Anna Andersen (3a 01)</a></li>
      <li><a href="/lectio/123/SkemaNy.aspx?type=elev&amp;elevid=1">Anna Andersen (3a 01)</a></li>
      <li><a href="/lectio/123/SkemaNy.aspx?type=elev&amp;elevid=2">Bo Christensen (2b 14)</a></li>
    </ul></div></div></body></html>`;
  it('reads entries from the list only, once each, plus the letter links', () => {
    const { items, letters } = readDirectory(parseDocument(html, `${L}FindSkema.aspx?type=elev&forbogstav=A`));
    expect(items.map((i: any) => [i.kind, i.id, i.label])).toEqual([
      ['elev', '1', 'Anna Andersen (3a 01)'],
      ['elev', '2', 'Bo Christensen (2b 14)'],
    ]);
    expect(letters.map((l: any) => l.label)).toEqual(['A', 'B']);
  });
  it('recognises schedule links', () => {
    expect(scheduleTarget(`${L}SkemaNy.aspx?type=laerer&laererid=3`)).toEqual({ kind: 'laerer', id: '3' });
    expect(scheduleTarget(`${L}SkemaNy.aspx?type=lokale&id=8`)).toEqual({ kind: 'lokale', id: '8' });
    expect(scheduleTarget(`${L}SkemaNy.aspx`)).toBeNull();
  });
});

describe('directory entries', () => {
  const raw = (kind: string, id: string, label: string) => ({ kind, id, label, href: '' });
  it('splits names, classes and initials', () => {
    expect(parseEntry(raw('elev', '1', 'Anna Andersen (3a 01)'))).toMatchObject({ name: 'Anna Andersen', code: '3a', number: '01' });
    expect(parseEntry(raw('laerer', '2', 'Lene Madsen (lm)'))).toMatchObject({ name: 'Lene Madsen', code: 'lm' });
    expect(parseEntry(raw('lokale', '3', 'B02 Fysik (lab)'))).toMatchObject({ name: 'B02 Fysik (lab)', code: '' });
  });
  const people = [raw('elev', '1', 'Åse Bech (2b 03)'), raw('elev', '2', 'Bo Andersen (3a 02)'), raw('elev', '3', 'Anna Østergaard (2b 01)')].map(parseEntry);
  it('sorts by first name, last name and class (Danish order)', () => {
    expect(sortEntries(people, 'first').map((p) => p.id)).toEqual(['3', '2', '1']);
    expect(sortEntries(people, 'last').map((p) => p.id)).toEqual(['2', '1', '3']);
    expect(sortEntries(people, 'code').map((p) => p.id)).toEqual(['3', '1', '2']);
  });
  it('searches every word, ignoring case and accents', () => {
    expect(searchEntries(people, 'anna').map((p) => p.id)).toEqual(['3']);
    expect(searchEntries(people, '2b oster').map((p) => p.id)).toEqual(['3']);
    expect(searchEntries(people, '').length).toBe(3);
  });
  it('pool runs everything with limited concurrency and keeps order', async () => {
    let active = 0;
    let peak = 0;
    const out = await pool([1, 2, 3, 4, 5], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      if (n === 3) throw new Error('x');
      return n * 2;
    });
    expect(peak).toBe(2);
    expect(out.map((r) => (r.status === 'fulfilled' ? r.value : 'err'))).toEqual([2, 4, 'err', 8, 10]);
  });
});

describe('occupancyAt', () => {
  const lesson = (id: string, start: string, end: string, status: RawLesson['status'] = 'normal'): RawLesson => ({
    id, start: `2026-11-26T${start}`, end: `2026-11-26T${end}`, status, title: '', holds: [`3a ${id}`], teachers: [], rooms: ['A12'], details: '', href: null,
  });
  const lessons = toLessons([lesson('Da', '08:15', '09:45'), lesson('Ma', '10:00', '11:30'), lesson('En', '12:15', '13:45'), lesson('Fy', '14:00', '15:30', 'cancelled')]);
  const at = (t: string) => new Date(`2026-11-26T${t}`);
  it('is busy during a lesson and chains lessons a short break apart', () => {
    const o = occupancyAt(lessons, at('08:30'));
    expect(o.state).toBe('busy');
    if (o.state === 'busy') {
      expect(o.lesson.hold).toBe('3a Da');
      expect(o.freeAt.toTimeString().slice(0, 5)).toBe('11:30');
      expect(o.next?.hold).toBe('3a En');
    }
  });
  it('is free between lessons until the next one', () => {
    const o = occupancyAt(lessons, at('11:40'));
    expect(o).toMatchObject({ state: 'free', freeFor: 35 });
  });
  it('ignores cancelled lessons and other days', () => {
    expect(occupancyAt(lessons, at('14:30'))).toMatchObject({ state: 'free', next: null, freeFor: null });
    expect(occupancyAt(lessons, new Date('2026-11-27T09:00'))).toMatchObject({ state: 'free', next: null });
  });
});
