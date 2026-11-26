// Writes synthetic Lectio pages (invented data, real markup shape) into
// fixtures/ for `npm run dev:app`. Real captured pages can be added on top.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fixture } from '../legacy/demo/fixtures.mjs';
import { schedulePage } from '../legacy/demo/schedule-fixture.mjs';
import { feedbackPage } from './feedback-fixture.mjs';

const norm = (raw) => {
  const u = new URL(raw, 'https://www.lectio.dk');
  const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  return u.pathname.toLowerCase() + (params.length ? '?' + new URLSearchParams(params).toString().toLowerCase() : '');
};
mkdirSync('fixtures', { recursive: true });
const indexFile = 'fixtures/index.json';
const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : {};
const put = (path, html) => {
  const file = createHash('sha1').update(norm(path)).digest('hex').slice(0, 16) + '.html';
  writeFileSync('fixtures/' + file, html);
  index[norm(path)] = file;
};
const base = '/lectio/123/';
for (const p of ['forside.aspx', 'OpgaverElev.aspx', 'ElevAflevering.aspx?exerciseid=1001', 'beskeder2.aspx', 'beskeder2.aspx?demo=traad', 'subnav/fravaerelev_fravaersaarsager.aspx', 'grades/grade_report.aspx', 'aktivitet/aktivitetforside2.aspx?absid=5001', 'DokumentOversigt.aspx', 'BD/UserReservations.aspx', 'material_lektieoversigt.aspx']) {
  put(base + p, fixture(base + p, false));
}
// The schedule fixture is a full page body; wrap in the same master page.
const sched = schedulePage();
put(base + 'SkemaNy.aspx', `<!doctype html><html><head><title>Eleven Demo Elev, 3a - Skema - Lectio</title></head><body><form id="aspnetForm" action="SkemaNy.aspx"><a href="${base}logout.aspx">Log ud</a><div id="contenttable">${sched}</div></form></body></html>`);
// Elevfeedback: open on the demo lesson, closed on absid=5002.
put(base + 'aktivitet/aktivitetforside2.aspx?absid=5001&lectab=elevindhold', feedbackPage(base, { absid: 5001 }));
put(base + 'aktivitet/aktivitetforside2.aspx?absid=5002&lectab=elevindhold', feedbackPage(base, { absid: 5002, open: false }));
// FindSkema.aspx: students (split by first letter), teachers and rooms.
const findPage = (title, links, letters = '') => `<!doctype html><html><head><title>${title} - Lectio</title></head><body><form id="aspnetForm"><div id="s_m_mastermenu"><a href="${base}SkemaNy.aspx?type=elev&amp;elevid=9">Skema</a><a href="${base}logout.aspx">Log ud</a></div><div id="contenttable">${letters}<div id="m_Content_listecontainer"><ul>${links.map(([href, label]) => `<li><a href="${base}${href}">${label}</a></li>`).join('')}</ul></div></div></form></body></html>`;
const students = [['Anna Andersen', '3a', '01'], ['Bo Christensen', '3a', '02'], ['Demo Elev', '3a', '07'], ['Mikkel Holm', '3a', '12'], ['Sofie Bjørn', '3a', '15'], ['Emma Larsen', '2b', '04'], ['Jonas Østergaard', '2b', '09'], ['Ida Kjær', '1c', '03'], ['Ahmed Hassan', '1c', '11'], ['Clara Winther', '2b', '13']];
const byLetter = {};
students.forEach(([name, cls, nr], i) => (byLetter[name[0].toUpperCase()] ||= []).push([`SkemaNy.aspx?type=elev&amp;elevid=${300001 + i}`, `${name} (${cls} ${nr})`]));
const letterLinks = Object.keys(byLetter).sort().map((l) => `<a href="${base}FindSkema.aspx?type=elev&amp;forbogstav=${l}">${l}</a>`).join(' ');
put(base + 'FindSkema.aspx?type=elev', findPage('Find skema for elev', [], letterLinks));
for (const [l, links] of Object.entries(byLetter)) put(base + `FindSkema.aspx?type=elev&forbogstav=${l}`, findPage('Find skema for elev', links, letterLinks));
put(base + 'FindSkema.aspx?type=laerer', findPage('Find skema for lærer', [['Lene Madsen', 'lm'], ['Thomas Nielsen', 'tn'], ['Mette Sørensen', 'ms'], ['Karsten Ibsen', 'ki'], ['Pernille Vang', 'pv']].map(([n, c], i) => [`SkemaNy.aspx?type=laerer&amp;laererid=${200001 + i}`, `${n} (${c})`])));
put(base + 'FindSkema.aspx?type=lokale', findPage('Find skema for lokale', ['A12 Klasselokale', 'A14 Klasselokale', 'B02 Fysik', 'B03 Kemi', 'C11 Musik', 'Hal 1', 'Bibliotek'].map((n, i) => [`SkemaNy.aspx?type=lokale&amp;nosubnav=1&amp;id=${700001 + i}`, n])));
writeFileSync(indexFile, JSON.stringify(index, null, 1));
console.log(Object.keys(index).length, 'fixtures');
