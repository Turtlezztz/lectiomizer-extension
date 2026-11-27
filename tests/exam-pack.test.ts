// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { escapeHtml, packHtml, standalone } from '@/features/teams/exam-pack';
import type { StudyEntry } from '@/features/teams/study';

const entry = (over: Partial<StudyEntry['content']> = {}, date = new Date(2026, 8, 14, 8, 15)): StudyEntry =>
  ({
    lesson: { absid: '1', startDate: date, endDate: new Date(date.getTime() + 90 * 60_000), holds: ['3a Da'], teachers: ['lm'], rooms: ['A12'], title: 'Novelleanalyse' },
    content: { title: 'Novelleanalyse', note: 'Husk <computer>', sections: [{ title: 'Lektier', blocks: ['<p>Læs <b>side 12</b></p>'] }], files: [], search: '', ...over },
  }) as unknown as StudyEntry;

describe('eksamenspakke', () => {
  it('escapes text but keeps sanitised blocks', () => {
    expect(escapeHtml('a < b & "c"')).toBe('a &lt; b &amp; &quot;c&quot;');
    const html = packHtml({ title: 'Dansk A & co', term: '2026/27', entries: [entry()], files: new Map(), madeAt: new Date(2026, 10, 27) });
    expect(html).toContain('<h1>Dansk A &amp; co</h1>');
    expect(html).toContain('Husk &lt;computer&gt;');
    expect(html).toContain('<p>Læs <b>side 12</b></p>');
    expect(html).toContain('<h4>Lektier</h4>');
    expect(html).not.toContain('id="beskrivelse"');
  });

  it('drops links that only work inside the app', () => {
    expect(standalone('<a href="#/studyplan/9101">Antologi</a> <a href="https://x.dk/a" target="_blank">x</a>')).toBe('<a>Antologi</a> <a href="https://x.dk/a" target="_blank">x</a>');
  });

  it('puts the description and its forløb first', () => {
    const html = packHtml({
      title: 'Dansk A', term: '2026/27', files: new Map(), madeAt: new Date(2026, 10, 27), entries: [entry()],
      description: { subject: 'Dansk A', info: [{ label: 'Lærer(e)', text: 'Lene Madsen' }, { label: 'Tom', text: '' }], phases: [{ number: '1', title: 'Romantikken', html: '<p>Universalromantik</p>', fields: [{ label: 'Indhold', html: '<p>Kernestof</p>' }] }] },
    });
    expect(html.indexOf('id="beskrivelse"')).toBeLessThan(html.indexOf('id="lektioner"'));
    expect(html).toContain('<dt>Lærer(e)</dt><dd>Lene Madsen</dd>');
    expect(html).not.toContain('<dt>Tom</dt>');
    expect(html).toContain('<h3 id="forloeb-1">1. Romantikken</h3>');
    expect(html).toContain('<h4>Indhold</h4><div><p>Kernestof</p></div>');
    expect(html).toContain('<a href="#forloeb-1">Romantikken</a>');
  });

  it('links bundled files relatively and the rest to Lectio', () => {
    const files = [
      { label: 'Opgave #1.pdf', href: 'https://www.lectio.dk/lectio/1/dokumenthent.aspx?id=1', ext: 'pdf', lectio: true },
      { label: 'Video', href: 'https://example.org/v?a=1&b=2', ext: '', lectio: false },
    ];
    const html = packHtml({ title: 'x', term: '2026/27', entries: [entry({ files })], files: new Map([[files[0].href, 'filer/2026-09-14 Opgave #1.pdf']]), madeAt: new Date() });
    expect(html).toContain('<a href="filer/2026-09-14%20Opgave%20%231.pdf">Opgave #1.pdf</a>');
    expect(html).toContain('<a href="https://example.org/v?a=1&amp;b=2">Video</a> <span class="muted">(link)</span>');
  });
});

// --- lessons from the forløb pages -------------------------------------------------
import { parseDocument } from '@/lib/lectio/client';
import { readPhase } from '@/lib/lectio/readers/studyplan.js';
import { entryYears, mergeEntries, toPhaseStudy } from '@/features/teams/phase-study';
import type { PhaseData } from '@/features/studyplan/model';
import { phasePage } from '../scripts/study-fixture.mjs';

describe('forløb pages as a source of lessons', () => {
  const doc = parseDocument(phasePage('/lectio/123/', { id: 9101 }), 'https://www.lectio.dk/lectio/123/studieplan/forloeb_vis.aspx?phaseid=9101');
  const study = toPhaseStudy(readPhase(doc) as PhaseData, (node) => node.innerHTML);

  it('dates each lesson from its tooltip, whatever the school year', () => {
    expect(study.entries.length).toBeGreaterThan(0);
    const first = study.entries[0];
    expect(first.lesson.startDate.getFullYear()).toBe(2026);
    expect(first.lesson.startDate.getMonth()).toBe(10);
    expect(first.lesson.endDate.getTime()).toBeGreaterThan(first.lesson.startDate.getTime());
    expect(first.lesson.absid).toBe('5001');
    expect(entryYears(study.entries)).toEqual([2026]);
  });

  it('keeps the forløb fields the description lacks, not the header ones', () => {
    const labels = study.fields.map((f) => f.label);
    expect(labels).not.toContain('Hold');
    expect(labels.length).toBeGreaterThan(0);
  });

  it('merges sources once per lesson, oldest first', () => {
    const [a] = study.entries;
    const older = { ...a, lesson: { ...a.lesson, absid: 'x', startDate: new Date(2024, 10, 5, 8, 15) } };
    const merged = mergeEntries([a], [older, a]);
    expect(merged.map((e) => e.lesson.absid)).toEqual(['x', a.lesson.absid]);
    expect(entryYears(merged)).toEqual([2024, 2026]);
  });
});
