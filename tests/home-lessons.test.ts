// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseDocument } from '@/lib/lectio/client';
import { readHomeLesson } from '@/lib/lectio/readers/home.js';
import { readLesson } from '@/lib/lectio/readers/util.js';
import { homeworkText } from '@/features/home/model';

const brick = (inner: string, tooltip: string, cls = 's2skemabrik s2bgbox') => {
  const doc = parseDocument(
    `<a class="${cls}" href="/lectio/1/aktivitet/aktivitetforside2.aspx?absid=1" data-tooltip="${tooltip.replace(/\n/g, '&#10;')}"><div class="s2skemabrikcontent">${inner}</div></a>`,
    'https://www.lectio.dk/lectio/1/forside.aspx',
  );
  return doc.querySelector('a.s2skemabrik')!;
};

describe('readHomeLesson', () => {
  it('fills a shortened brick from its tooltip', () => {
    const lesson = readHomeLesson(
      brick(
        '1. modul - ... • ... • ...',
        'Ændret!\nJuleklip\n27/11-2026 08:15 til 10:20\nHold: Alle 1. HTX-elever (Lyn), Alle 3. HTX-elever (Lyn)\nLærere: kjl, rl\nLokale: Kantinen\n\nLektier:\n- Tag saks med',
      ),
    );
    expect(lesson.title).toBe('Juleklip');
    expect(lesson.holds).toEqual(['Alle 1. HTX-elever (Lyn)', 'Alle 3. HTX-elever (Lyn)']);
    expect(lesson.teachers).toEqual(['kjl', 'rl']);
    expect(lesson.room).toBe('Kantinen');
    expect(lesson.module).toBe('1. modul');
    expect(lesson.status).toBe('changed');
    expect(lesson.time?.start).toEqual(new Date(2026, 10, 27, 8, 15));
  });

  it('leaves a normal brick alone', () => {
    const lesson = readHomeLesson(
      brick(
        '2. modul - <span data-lectiocontextcard="HE1">L3d Pro</span> • <span data-lectiocontextcard="T1">cbr</span> • 2.31',
        '27/11-2026 10:30 til 11:30\nHold: L3d Pro\nLærer: Carsten B (cbr)\nLokale: 2.31',
      ),
    );
    expect(lesson.holds).toEqual(['L3d Pro']);
    expect(lesson.teachers).toEqual(['cbr']);
    expect(lesson.room).toBe('2.31');
    expect(lesson.status).toBe('normal');
  });
});

describe('readLesson', () => {
  it('drops the shortened parts of a lesson header without a tooltip', () => {
    const lesson = readLesson(brick('fr 27/11 08:15 - 10:20 - ... • ...', ''));
    expect(lesson.date).toBe('fr 27/11');
    expect(lesson.module).toBe('08:15 - 10:20');
    expect(lesson.room).toBe('');
  });
});

describe('homeworkText', () => {
  it('reads plain homework rows', () => {
    expect(homeworkText('3a Da: - læs side 12-20')).toEqual({ title: 'læs side 12-20', context: '3a Da' });
  });

  it('reads rows that carry a whole lesson tooltip', () => {
    expect(
      homeworkText('Ændret! Juleklip 27/11-2026 08:15 til 10:20 Hold: Alle 1. HTX-elever (Lyn), Alle 2. HTX-elever (Lyn) Lærere: kjl, rl Lektier: - Tag saks med'),
    ).toEqual({ title: 'Tag saks med', context: 'Juleklip' });
  });
});
