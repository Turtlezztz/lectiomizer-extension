import { describe, expect, it } from 'vitest';
import { customSubjectName, linkLabel, makeSubjectLink, normalizeLinkUrl, subjectLabel, subjectLinks, withSubjectValue } from '@/lib/subjects';

describe('own subject names', () => {
  const names = { ma: 'Matematik', 'da a': '  ' };
  it('labels a hold by its subject key', () => {
    expect(subjectLabel('L3d MA', names)).toBe('Matematik');
    expect(subjectLabel('2x Ma', names)).toBe('Matematik');
    expect(subjectLabel('L3d FY', names)).toBe('L3d FY');
    expect(subjectLabel('L3d FY', names, 'Fysik')).toBe('Fysik');
    expect(customSubjectName('3a Da A', names)).toBeNull();
    expect(subjectLabel('L3d MA')).toBe('L3d MA');
  });
  it('sets and clears per-subject values', () => {
    expect(withSubjectValue({ ma: 'x' }, 'fy', ' Fysik ')).toEqual({ ma: 'x', fy: 'Fysik' });
    expect(withSubjectValue({ ma: 'x' }, 'ma', '')).toEqual({});
    expect(withSubjectValue({ ma: [1] }, 'ma', [])).toEqual({});
    expect(withSubjectValue(undefined, 'ma', null)).toEqual({});
  });
});

describe('own subject links', () => {
  it('normalises typed addresses', () => {
    expect(normalizeLinkUrl('systime.dk/bog')).toBe('https://systime.dk/bog');
    expect(normalizeLinkUrl('http://x.dk')).toBe('http://x.dk/');
    expect(normalizeLinkUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeLinkUrl('noget tekst')).toBeNull();
    expect(normalizeLinkUrl('hej')).toBeNull();
  });
  it('names known services', () => {
    expect(linkLabel('https://matematik.systime.dk/x')).toBe('Systime');
    expect(linkLabel('https://teams.microsoft.com/l/channel')).toBe('Teams');
    expect(linkLabel('https://www.example.org/a')).toBe('example.org');
    expect(makeSubjectLink('onenote.com/x', '')).toEqual({ url: 'https://onenote.com/x', label: 'OneNote' });
    expect(makeSubjectLink('x.dk', ' Min bog ')).toEqual({ url: 'https://x.dk/', label: 'Min bog' });
  });
  it('finds a hold’s links', () => {
    const links = { ma: [{ label: 'Systime', url: 'https://systime.dk/' }] };
    expect(subjectLinks('L3d MA', links)).toHaveLength(1);
    expect(subjectLinks('L3d FY', links)).toEqual([]);
  });
});
