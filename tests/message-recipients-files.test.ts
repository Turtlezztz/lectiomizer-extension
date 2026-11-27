// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readGroups } from '@/lib/lectio/readers/thread.js';
import { fileType, sizeBytes } from '@/features/messages/files';

const recipients = (html: string) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};

describe('thread recipients that are teams and groups', () => {
  it('reads groups written as text after the people', () => {
    const node = recipients(
      '<span data-lectiocontextcard="U1">Mille Isaki (miis)</span><br>Gruppen Alle 1. HTX-elever (Lyn), Gruppen Alle Lærere (Lyn)\n',
    );
    expect(readGroups(node)).toEqual([
      { full: 'Gruppen Alle 1. HTX-elever (Lyn)', name: 'Alle 1. HTX-elever', kind: 'Gruppe' },
      { full: 'Gruppen Alle Lærere (Lyn)', name: 'Alle Lærere', kind: 'Gruppe' },
    ]);
  });

  it('reads teams and ignores people separated by commas', () => {
    const node = recipients('<span data-lectiocontextcard="U1">A (cbr)</span>, <span data-lectiocontextcard="U2">B (msa)</span><br>Holdet LDDU 1 TK');
    expect(readGroups(node)).toEqual([{ full: 'Holdet LDDU 1 TK', name: 'LDDU 1 TK', kind: 'Hold' }]);
  });

  it('is empty when only people are listed', () => {
    expect(readGroups(recipients('<span data-lectiocontextcard="U1">A</span>, <span data-lectiocontextcard="U2">B</span><br>'))).toEqual([]);
    expect(readGroups(null)).toEqual([]);
  });
});

describe('attachment types', () => {
  it('knows previewable files by name', () => {
    expect(fileType('42.JPG')).toMatchObject({ kind: 'image', mime: 'image/jpeg' });
    expect(fileType('Fællessamling 24-11-2026.pdf')).toMatchObject({ kind: 'pdf', mime: 'application/pdf' });
    expect(fileType('Opgave.docx').kind).toBe('docx');
    expect(fileType('noter.txt').kind).toBe('text');
    expect(fileType('film.mp4').kind).toBe('video');
    expect(fileType('præsentation.pptx').kind).toBe('other');
    expect(fileType('uden-endelse').kind).toBe('other');
  });

  it('reads Lectio sizes', () => {
    expect(sizeBytes('3 MB')).toBe(3 * 1024 ** 2);
    expect(sizeBytes('1,5 KB')).toBe(1536);
    expect(sizeBytes('')).toBe(0);
  });
});
