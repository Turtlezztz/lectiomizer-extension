// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getPage, postbackTarget, setTransport } from '@/lib/lectio/client';
import { PastTermError, currentYear, getTerm, isPastTerm, readTerm, resetTerm, sameDayIn, schoolYearOf, subscribeTerm, switchTerm, termLabel } from '@/lib/lectio/term';
import { readLectio } from '@/lib/sync/read';

// Lectio's year menu as it is on SkemaNy/Opgaver (usable) and Forside/Beskeder (greyed out).
const menu = (selected: number, years: number[], disabled = false) =>
  `<select name="s$m$ChooseTerm$term" onchange="javascript:setTimeout('__doPostBack(\\'s$m$ChooseTerm$term\\',\\'\\')', 0)" id="s_m_ChooseTerm_term"${disabled ? ' disabled="disabled" class="aspNetDisabled yearselect"' : ' class="yearselect"'}>` +
  years.map((y) => `<option${y === selected ? ' selected="selected"' : ''} value="${y}">${termLabel(y)}</option>`).join('') +
  '</select>';
const page = (body: string) => new DOMParser().parseFromString(`<html><body><form id="aspnetForm" action="./SkemaNy.aspx">${body}</form></body></html>`, 'text/html');

afterEach(() => resetTerm());

describe('school year', () => {
  it('reads the usable and the greyed-out menu', () => {
    expect(readTerm(page(menu(2026, [2026, 2025, 2024])))).toEqual({
      year: 2026,
      switchable: true,
      options: [
        { year: 2026, label: '2026/27' },
        { year: 2025, label: '2025/26' },
        { year: 2024, label: '2024/25' },
      ],
    });
    // Greyed out, Lectio lists only the chosen year.
    expect(readTerm(page(menu(2025, [2025], true)))).toEqual({ year: 2025, switchable: false, options: [] });
    expect(readTerm(page('<p>Ingen menu</p>'))).toBeNull();
  });

  it('finds the postback target in the menu', () => {
    expect(postbackTarget(page(menu(2026, [2026, 2025])).querySelector('select'))?.target).toBe('s$m$ChooseTerm$term');
  });

  it('starts the school year in August', () => {
    expect(schoolYearOf(new Date(2026, 10, 27))).toBe(2026);
    expect(schoolYearOf(new Date(2027, 6, 31))).toBe(2026);
    expect(schoolYearOf(new Date(2027, 7, 1))).toBe(2027);
    expect(termLabel(2099)).toBe('2099/00');
  });

  it('knows when an earlier year is shown', () => {
    const now = new Date(2026, 10, 27);
    const options = [2026, 2025, 2024].map((year) => ({ year, label: termLabel(year) }));
    expect(isPastTerm({ year: 2025, options }, now)).toBe(true);
    expect(isPastTerm({ year: 2026, options }, now)).toBe(false);
    // Without the menu's options (only Forside seen) we can't tell.
    expect(isPastTerm({ year: 2025, options: [] }, now)).toBe(false);
    // Early August, before Lectio offers the new year: the newest one is current.
    const august = new Date(2027, 7, 3);
    expect(currentYear({ year: 2026, options }, august)).toBe(2026);
    expect(isPastTerm({ year: 2026, options }, august)).toBe(false);
  });

  it('moves a date into another school year', () => {
    expect(sameDayIn(2025, new Date(2026, 10, 27))).toEqual(new Date(2025, 10, 27));
    expect(sameDayIn(2025, new Date(2027, 1, 10))).toEqual(new Date(2026, 1, 10));
    // 29 February 2028 in 2026/27 has no 29th.
    expect(sameDayIn(2026, new Date(2028, 1, 29))).toEqual(new Date(2027, 1, 28));
  });
});

describe('session year', () => {
  const serve = (pages: Record<string, string>) =>
    setTransport({
      async request(url, init) {
        const path = new URL(url).pathname.split('/').pop()!.toLowerCase();
        const html = init?.method === 'POST' ? pages.post : pages[path];
        return html ? { url, status: 200, html: `<html><body><a href="logout.aspx">Log ud</a>${html}</body></html>` } : { url, status: 404, html: '' };
      },
    });

  it('follows the year on loaded pages and keeps the options from the usable menu', async () => {
    const seen: number[] = [];
    const off = subscribeTerm((t, previous) => previous && seen.push(t.year));
    serve({ 'skemany.aspx': menu(2026, [2026, 2025]), 'forside.aspx': menu(2025, [2025], true) });
    await getPage('https://www.lectio.dk/lectio/1/SkemaNy.aspx');
    expect(getTerm()?.options.map((o) => o.year)).toEqual([2026, 2025]);
    // Changed on lectio.dk in another tab: Forside now shows 2025.
    await getPage('https://www.lectio.dk/lectio/1/forside.aspx');
    expect(getTerm()).toMatchObject({ year: 2025, options: [{ year: 2026 }, { year: 2025 }] });
    await getPage('https://www.lectio.dk/lectio/1/forside.aspx');
    expect(seen).toEqual([2025]);
    off();
  });

  it('switches with a postback and checks that Lectio did', async () => {
    let posted: URLSearchParams | null = null;
    setTransport({
      async request(url, init) {
        if (init?.method === 'POST') posted = init.body as URLSearchParams;
        const html = `<form id="aspnetForm" action="./SkemaNy.aspx"><a href="logout.aspx">Log ud</a>${menu(init?.method === 'POST' ? 2025 : 2026, [2026, 2025])}</form>`;
        return { url, status: 200, html };
      },
    });
    const term = await switchTerm('1', 2025);
    expect(term.year).toBe(2025);
    expect(posted!.get('__EVENTTARGET')).toBe('s$m$ChooseTerm$term');
    expect(posted!.get('s$m$ChooseTerm$term')).toBe('2025');
    await expect(switchTerm('1', 2019)).rejects.toThrow(/2019\/20/);
  });
});

describe('background check in an earlier year', () => {
  const index: Record<string, string> = JSON.parse(readFileSync('fixtures/index.json', 'utf8'));
  const fixture = (url: string) => {
    const path = new URL(url).pathname.toLowerCase();
    const key = Object.keys(index).find((k) => k.split('?')[0] === path);
    return key ? readFileSync('fixtures/' + index[key], 'utf8') : null;
  };
  const withYear = (year: number) =>
    setTransport({
      async request(url) {
        const html = fixture(url);
        if (!html) return { url, status: 404, html: '' };
        const usable = /skemany/i.test(url);
        const own = menu(year, usable ? [2026, 2025] : [year], !usable);
        const MENU = /<select[^>]*ChooseTerm_term[\s\S]*?<\/select>/;
        return { url, status: 200, html: MENU.test(html) ? html.replace(MENU, own) : html.replace(/<body[^>]*>/i, (b) => b + own) };
      },
    });
  const now = new Date('2026-10-05T07:00:00').getTime();

  it('pauses instead of reading last year as this one', async () => {
    withYear(2025);
    await expect(readLectio({ schoolId: '123', weekCount: 2, now })).rejects.toBeInstanceOf(PastTermError);
  });

  it('reads as usual in the current year', async () => {
    withYear(2026);
    const result = await readLectio({ schoolId: '123', weekCount: 2, now });
    expect(result.weeks[0].lessons?.length).toBeGreaterThan(0);
  });
});
