// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseDocument } from '@/lib/lectio/client';
import { filterStudy, groupByMonth, hasContent, schoolYearWeeks, studyLessons, toStudyContent, zipPlan, type StudyEntry } from '@/features/teams/study';
import { crc32, createZip, uniqueFileName } from '@/features/teams/zip';
import type { RawLesson } from '@/features/schedule/lessons';

const L = 'https://www.lectio.dk/lectio/123/';

const raw = (absid: string, start: string, details = '', extra: Partial<RawLesson> = {}): RawLesson => ({
  id: `absid:${absid}`,
  start,
  end: start.replace(/T(\d\d)/, (_, h) => `T${String(+h + 1).padStart(2, '0')}`),
  status: 'normal',
  title: '',
  holds: ['L3d MA'],
  teachers: [],
  rooms: [],
  details,
  href: `${L}aktivitet/aktivitetforside2.aspx?absid=${absid}`,
  ...extra,
});

describe('schoolYearWeeks', () => {
  it('covers August to June', () => {
    const weeks = schoolYearWeeks(2026);
    expect(weeks[0]).toEqual({ week: 31, year: 2026 }); // 1 Aug 2026 is a Saturday in week 31
    expect(weeks.at(-1)).toEqual({ week: 26, year: 2027 }); // 30 Jun 2027
    expect(weeks.length).toBe(49); // 2026 has 53 ISO weeks
    expect(new Set(weeks.map((w) => `${w.week}-${w.year}`)).size).toBe(weeks.length);
  });
});

describe('studyLessons', () => {
  it('keeps lessons with content once, oldest first', () => {
    const weeks = [
      [raw('2', '2026-09-08T10:00:00', 'Lektier:\n- Læs s. 10'), raw('3', '2026-09-08T12:00:00', '')],
      undefined,
      [raw('1', '2026-09-01T08:00:00', 'Note:\nHusk lommeregner'), raw('2', '2026-09-08T10:00:00', 'Lektier:\n- Læs s. 10')],
      [raw('4', '2026-09-15T08:00:00', 'Øvrigt indhold:\n- Slides'), raw('5', '2026-09-15T10:00:00', 'Lektier: x', { href: null })],
    ];
    expect(studyLessons(weeks).map((l) => l.absid)).toEqual(['1', '2', '4']);
  });
  it('counts flags as content', () => {
    expect(hasContent({ details: '', homework: true, note: false })).toBe(true);
    expect(hasContent({ details: '   ', homework: false, note: false })).toBe(false);
  });
});

describe('toStudyContent', () => {
  const doc = parseDocument(
    `<html><body>
      <div id="a"><article><h1>Lektier</h1><p>Læs <a href="/lectio/123/dokumenthent.aspx?documentid=9">kapitel 3</a> om vektorer</p></article></div>
      <div id="b"><article><a href="/lectio/123/dokumenthent.aspx?documentid=10">Opgaver.pdf</a></article></div>
      <div id="c"><article><a href="https://example.com/noter.docx">Noter</a></article></div>
    </body></html>`,
    `${L}aktivitet/aktivitetforside2.aspx?absid=1`,
  );
  const items = ['a', 'b', 'c'].map((id) => ({ id, title: '', node: doc.querySelector(`#${id} article`)! }));
  const render = (n: Element) => n.innerHTML;

  it('splits text and files and builds search text', () => {
    const c = toStudyContent({ lesson: null, note: 'Husk lommeregner', sections: [{ title: 'Lektier', items }] }, render)!;
    expect(c.sections).toHaveLength(1);
    expect(c.sections[0].blocks).toHaveLength(1);
    expect(c.files.map((f) => [f.label, f.lectio])).toEqual([
      ['kapitel 3', true],
      ['Opgaver.pdf', true],
      ['Noter', false],
    ]);
    expect(c.search).toContain('vektorer');
    expect(c.search).toContain('lommeregner');
    expect(c.search).toContain('opgaver.pdf');
  });
  it('is null for an empty lesson page', () => {
    expect(toStudyContent({ lesson: null, note: '', sections: [] }, render)).toBeNull();
  });
});

describe('filter, months and zip plan', () => {
  const entry = (absid: string, start: string, search: string, files: StudyEntry['content']['files'] = []): StudyEntry => ({
    lesson: { ...studyLessons([[raw(absid, start, 'Note: x')]])[0] },
    content: { title: '', note: '', sections: [], files, search },
  });
  const pdf = { label: 'Opgave.pdf', href: `${L}dokumenthent.aspx?documentid=1`, ext: '', lectio: true };
  const doc = { label: 'Noter', href: `${L}dokumenthent.aspx?documentid=2`, ext: 'docx', lectio: true };
  const ext = { label: 'Video', href: 'https://youtube.com/x', ext: '', lectio: false };
  const entries = [entry('1', '2026-09-01T08:00:00', 'vektorer intro', [pdf, ext]), entry('2', '2026-10-02T08:00:00', 'integraler', [doc, pdf]), entry('3', '2026-10-05T08:00:00', 'vektorer prove')];

  it('filters on every word and on files', () => {
    expect(filterStudy(entries, 'Vektorer', false).map((e) => e.lesson.absid)).toEqual(['1', '3']);
    expect(filterStudy(entries, 'vektorer intro', false).map((e) => e.lesson.absid)).toEqual(['1']);
    expect(filterStudy(entries, '', true).map((e) => e.lesson.absid)).toEqual(['1', '2']);
  });
  it('groups by month in order', () => {
    expect(groupByMonth(entries).map((g) => g.entries.length)).toEqual([1, 2]);
  });
  it('zips Lectio files once, dated, with an extension', () => {
    expect(zipPlan(entries).map((f) => f.name)).toEqual(['2026-09-01 Opgave.pdf', '2026-10-02 Noter.docx']);
  });
});

describe('zip writer', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('writes a readable store-only archive', () => {
    const a = new TextEncoder().encode('hej');
    const b = new TextEncoder().encode('verden!');
    const zip = createZip([
      { name: 'a.txt', data: a, date: new Date(2026, 8, 14, 10, 30) },
      { name: 'æøå.txt', data: b },
    ]);
    const v = new DataView(zip.buffer);
    // End of central directory
    const end = zip.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(2);
    const cdOffset = v.getUint32(end + 16, true);
    expect(v.getUint32(cdOffset, true)).toBe(0x02014b50);
    // First local header and its data
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(14, true)).toBe(crc32(a));
    expect(v.getUint32(18, true)).toBe(3);
    const nameLen = v.getUint16(26, true);
    expect(new TextDecoder().decode(zip.slice(30, 30 + nameLen))).toBe('a.txt');
    expect(new TextDecoder().decode(zip.slice(30 + nameLen, 33 + nameLen))).toBe('hej');
    // Second entry's offset from the central directory points at a local header with the UTF-8 name
    const second = cdOffset + 46 + v.getUint16(cdOffset + 28, true);
    const off = v.getUint32(second + 42, true);
    expect(v.getUint32(off, true)).toBe(0x04034b50);
    expect(v.getUint16(off + 6, true) & 0x0800).toBe(0x0800);
    expect(new TextDecoder().decode(zip.slice(off + 30, off + 30 + v.getUint16(off + 26, true)))).toBe('æøå.txt');
  });
  it('makes safe, unique file names', () => {
    const taken = new Set<string>();
    expect(uniqueFileName('a/b:c?.pdf', taken)).toBe('a_b_c_.pdf');
    expect(uniqueFileName('Noter.pdf', taken)).toBe('Noter.pdf');
    expect(uniqueFileName('noter.pdf', taken)).toBe('noter (2).pdf');
    expect(uniqueFileName('  ', taken)).toBe('fil');
  });
});
