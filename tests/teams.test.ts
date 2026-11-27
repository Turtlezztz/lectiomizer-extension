// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseDocument } from '@/lib/lectio/client';
import { appRoute } from '@/lib/lectio/paths';
import { readTeamList, readTeamMembers, readTeamSubjects, teamId } from '@/lib/lectio/readers/teams.js';
import { groupTeams, searchTeams, type Team } from '@/features/teams/teams';

const L = 'https://www.lectio.dk/lectio/123/';

describe('hold links', () => {
  it('routes a hold schedule in-app', () => {
    expect(appRoute(`${L}SkemaNy.aspx?type=holdelement&holdelementid=42`)).toBe('/teams/42');
    expect(teamId(`${L}SkemaNy.aspx?type=holdelement&holdelementid=42`)).toBe('42');
    expect(teamId(`${L}SkemaNy.aspx?elevid=42`)).toBeNull();
  });
});

describe('readTeamSubjects / readTeamList', () => {
  it('reads the subjects on the overview', () => {
    const doc = parseDocument(
      `<html><body><div id="m_Content_listecontainer">
        <a href="/lectio/123/FindSkema.aspx?type=hold&amp;fag=524&amp;prevurl=FindSkema.aspx%3ftype%3dhold"><span class="findskema-symbol">MA</span>Matematik</a>
        <a href="/lectio/123/FindSkema.aspx?type=hold&amp;fag=562&amp;prevurl=x"><span class="findskema-symbol">ØH</span>Øvrige hold</a>
      </div></body></html>`,
      `${L}FindSkema.aspx?type=hold`,
    );
    expect(readTeamSubjects(doc).map((s: any) => [s.id, s.code, s.name])).toEqual([
      ['524', 'MA', 'Matematik'],
      ['562', 'ØH', 'Øvrige hold'],
    ]);
  });
  it('reads a subject page once per hold, with the heading above it', () => {
    const doc = parseDocument(
      `<html><body><div id="m_Content_listecontainer"><h4>MA - Matematik</h4><ul>
        <li><a href="/lectio/123/SkemaNy.aspx?type=holdelement&amp;holdelementid=1">L1a1 MA</a></li>
        <li><a href="/lectio/123/SkemaNy.aspx?type=holdelement&amp;holdelementid=2">L1a2 MA</a></li>
        <li><a href="/lectio/123/SkemaNy.aspx?type=holdelement&amp;holdelementid=1">L1a1 MA</a></li>
      </ul></div></body></html>`,
      `${L}FindSkema.aspx?type=hold&fag=524`,
    );
    expect(readTeamList(doc).map((t: any) => [t.id, t.name, t.heading])).toEqual([
      ['1', 'L1a1 MA', 'MA - Matematik'],
      ['2', 'L1a2 MA', 'MA - Matematik'],
    ]);
  });
});

describe('readTeamMembers', () => {
  // Shaped like subnav/members.aspx?holdelementid=…&showteachers=1&showstudents=1
  const row = (card: string, type: string, code: string, href: string, first: string, last: string, line = '') => `<tr>
    <td data-lectiocontextcard="${card}"><img src="/lectio/123/GetImage.aspx?pictureid=9"></td><td>${type}</td>
    <td class="smallCol" data-lectiocontextcard="${card}"><span class="noWrap">${code}</span></td>
    <td data-lectiocontextcard="${card}"><span class="noWrap"><a href="/lectio/123/${href}">${first}</a></span></td>
    <td data-lectiocontextcard="${card}"><span class="noWrap">${last}</span></td><td class="nowrap">${line}</td></tr>`;
  const doc = parseDocument(
    `<html><head><title>Holdet L1a1 MA - Lærere og elever - Lectio - TEC</title></head><body>
    <table id="s_m_Content_Content_laerereleverpanel_alm_gv" class="ls-table-layout2 lf-grid"><tr>
      <th>Foto</th><th>Type</th><th>ID</th><th>Fornavn</th><th>Efternavn</th><th>Studieretning</th></tr>
      ${row('T7', 'Lærer', 'vbs', 'SkemaNy.aspx?laererid=7', 'Victor', 'Bech')}
      ${row('S8', 'Elev', 'LGF1 01', 'SkemaNy.aspx?elevid=8', 'Anna Marie', 'Holm', '<span>2026/27 (L1a1) Matematik A</span>')}
    </table></body></html>`,
    `${L}subnav/members.aspx?holdelementid=1&showteachers=1&showstudents=1`,
  );
  it('splits teachers and students with names, codes and photos', () => {
    const { title, teachers, students } = readTeamMembers(doc);
    expect(title).toBe('L1a1 MA');
    expect(teachers).toEqual([expect.objectContaining({ kind: 'laerer', id: '7', card: 'T7', name: 'Victor Bech', code: 'vbs', line: '' })]);
    expect(students).toEqual([expect.objectContaining({ kind: 'elev', id: '8', name: 'Anna Marie Holm', code: 'LGF1 01', line: '2026/27 (L1a1) Matematik A' })]);
    expect(students[0].photo).toBe(`${L}GetImage.aspx?pictureid=9`);
  });
});

describe('team list helpers', () => {
  const t = (id: string, name: string, subject: string): Team => ({ id, name, subjectCode: '', subject, href: '', search: `${name} ${subject}`.toLowerCase() });
  const teams = [t('1', 'L1a10 MA', 'Matematik'), t('2', 'L1a2 MA', 'Matematik'), t('3', 'Kor', 'Øvrige hold'), t('4', '2b Da', 'Dansk')];
  it('groups by subject, naturally sorted, Øvrige hold last', () => {
    expect(groupTeams(teams).map((g) => [g.subject, g.teams.map((x) => x.name)])).toEqual([
      ['Dansk', ['2b Da']],
      ['Matematik', ['L1a2 MA', 'L1a10 MA']],
      ['Øvrige hold', ['Kor']],
    ]);
  });
  it('searches every word', () => {
    expect(searchTeams(teams, 'l1a2 matematik').map((x) => x.id)).toEqual(['2']);
  });
});
