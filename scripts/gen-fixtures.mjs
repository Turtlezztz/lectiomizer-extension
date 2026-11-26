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
writeFileSync(indexFile, JSON.stringify(index, null, 1));
console.log(Object.keys(index).length, 'fixtures');
