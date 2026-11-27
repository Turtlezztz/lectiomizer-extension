// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { embedFor, embedsIn } from '@/components/embeds';

const L = 'https://www.lectio.dk/lectio/123/';

describe('links shown as embeds', () => {
  it('previews Lectio files by the name in the link text', () => {
    expect(embedFor(`${L}dokumenthent.aspx?documentid=1`, 'Program.pdf')).toEqual({ kind: 'file', href: `${L}dokumenthent.aspx?documentid=1`, name: 'Program.pdf' });
    expect(embedFor(`${L}ExerciseFileGet.aspx?type=opgavedef&exercisefileid=7`, 'Opgave.docx')?.kind).toBe('file');
  });

  it('takes the file type from the address when the text has none', () => {
    expect(embedFor(`${L}lc/1/res/2/Analysemodel.pdf`, 'Analysemodel')).toMatchObject({ kind: 'file', name: 'Analysemodel.pdf' });
  });

  it('leaves Lectio pages and files it cannot show as links', () => {
    expect(embedFor(`${L}SkemaNy.aspx?type=elev&elevid=1`, 'Skema')).toBeNull();
    expect(embedFor(`${L}dokumenthent.aspx?documentid=2`, 'Regneark.xlsx')).toBeNull();
    expect(embedFor('https://www.experimentarium.dk/', 'Experimentarium')).toBeNull();
    expect(embedFor('javascript:alert(1)', 'x')).toBeNull();
  });

  it('recognises YouTube addresses', () => {
    for (const href of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
      'https://youtu.be/dQw4w9WgXcQ?si=abc',
      'https://m.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ]) {
      expect(embedFor(href, href)).toMatchObject({ kind: 'youtube', id: 'dQw4w9WgXcQ', label: '' });
    }
    expect(embedFor('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Se filmen')).toMatchObject({ label: 'Se filmen' });
    expect(embedFor('https://www.youtube.com/@kanal', 'Kanal')).toBeNull();
  });

  it('shows direct links to pictures, video and sound', () => {
    expect(embedFor('https://example.org/billeder/kort.PNG?w=2', 'Kortet')).toMatchObject({ kind: 'image', name: 'Kortet' });
    expect(embedFor('https://example.org/a/film.mp4', 'https://example.org/a/film.mp4')).toMatchObject({ kind: 'video', name: 'film.mp4' });
    expect(embedFor('https://example.org/lyd.mp3', '')).toMatchObject({ kind: 'audio' });
    expect(embedFor('https://example.org/tekst.pdf', 'Tekst')).toBeNull();
  });

  it('collects each link once, skipping attachments and linked pictures', () => {
    const el = document.createElement('div');
    el.innerHTML = `
      <p><a href="https://youtu.be/dQw4w9WgXcQ">video</a> og igen <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">her</a></p>
      <a href="${L}dokumenthent.aspx?documentid=1">Program.pdf</a>
      <a href="https://example.org/stor.jpg"><img src="https://example.org/lille.jpg"></a>
      <a href="https://example.org/kort.png">kort</a>`;
    const found = embedsIn(el, { skip: [`${L}dokumenthent.aspx?documentid=1`] });
    expect(found.map((e) => e.kind)).toEqual(['youtube', 'image']);
    expect(embedsIn(el, { max: 1 })).toHaveLength(1);
    expect(embedsIn(null)).toEqual([]);
  });
});
