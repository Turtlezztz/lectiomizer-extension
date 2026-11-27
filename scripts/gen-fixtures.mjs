// Writes synthetic Lectio pages (invented data, real markup shape) into
// fixtures/ for `npm run dev:app`. Real captured pages can be added on top.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fixture } from '../legacy/demo/fixtures.mjs';
import { schedulePage } from '../legacy/demo/schedule-fixture.mjs';
import { feedbackPage } from './feedback-fixture.mjs';
import { homeworkPage } from './homework-fixture.mjs';
import { booksPage, descriptionsPage, phasePage, planHolds, spsPage, studentCardPage, studyPlanPage, uvbSubjects } from './study-fixture.mjs';
import { questionnaireAnswerPage, questionnaireListPage, questionnaires } from './questionnaire-fixture.mjs';

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
for (const p of ['forside.aspx', 'OpgaverElev.aspx', 'ElevAflevering.aspx?exerciseid=1001', 'beskeder2.aspx', 'beskeder2.aspx?demo=traad', 'subnav/fravaerelev_fravaersaarsager.aspx', 'grades/grade_report.aspx', 'aktivitet/aktivitetforside2.aspx?absid=5001', 'DokumentOversigt.aspx']) {
  put(base + p, fixture(base + p, false));
}
// The schedule fixture is a full page body; wrap in the same master page.
const sched = schedulePage();
put(base + 'SkemaNy.aspx', `<!doctype html><html><head><title>Eleven Demo Elev, 3a - Skema - Lectio</title></head><body><form id="aspnetForm" action="SkemaNy.aspx"><a href="${base}logout.aspx">Log ud</a><div id="contenttable">${sched}</div></form></body></html>`);
// Elevfeedback: open on the demo lesson, closed on absid=5002.
put(base + 'aktivitet/aktivitetforside2.aspx?absid=5001&lectab=elevindhold', feedbackPage(base, { absid: 5001 }));
put(base + 'aktivitet/aktivitetforside2.aspx?absid=5002&lectab=elevindhold', feedbackPage(base, { absid: 5002, open: false }));
put(base + 'material_lektieoversigt.aspx', homeworkPage(base));
// Studieplan with a page per forløb, Undervisningsbeskrivelser per subject, Bøger, SPS and Studiekort.
put(base + 'studieplan.aspx?displaytype=ugeteksttabel', studyPlanPage(base));
for (const p of planHolds.flatMap((h) => h.phases)) put(base + `studieplan/forloeb_vis.aspx?phaseid=${p.id}`, phasePage(base, { id: p.id }));
put(base + 'studieplan/undervisningsbeskrivelse.aspx', descriptionsPage(base));
for (const [id] of uvbSubjects) put(base + `studieplan/undervisningsbeskrivelse.aspx?sel_fag_id=${id}`, descriptionsPage(base, { subject: id, empty: id !== '507' }));
put(base + 'BD/UserReservations.aspx', booksPage(base));
put(base + 'Elev_SPS.aspx', spsPage(base));
put(base + 'digitaltStudiekort.aspx', studentCardPage(base));
// Spørgeskemaer: the overview and one answer page per open questionnaire (4002 has a saved draft).
put(base + 'spoergeskema/spoergeskema_rapport.aspx', questionnaireListPage(base));
for (const q of questionnaires) put(base + `spoergeskema/spoergeskema_besvar.aspx?id=${q.id}&prevurl=spoergeskema%2fspoergeskema_rapport.aspx`, questionnaireAnswerPage(base, { id: q.id, answers: q.id === 4002 ? { ctl02: 3, ctl03: [0, 3], ctl04: 'Flere vegetarretter' } : {} }));
// FindSkema.aspx: students (split by first letter), teachers and rooms – shaped
// like real Lectio: students/teachers link SkemaNy.aspx?elevid=… / ?laererid=…
// without type=, rooms put their number in a .findskema-symbol span.
const findPage = (title, links, letters = '') => `<!doctype html><html><head><title>${title} - Lectio</title></head><body><form id="aspnetForm"><a href="${base}help/helptip2.aspx?articleid=1097&amp;prevurl=FindSkema.aspx%3ftype%3delev%26forbogstav%3dA">Hjælp</a><div id="s_m_mastermenu"><a href="${base}SkemaNy.aspx?type=elev&amp;elevid=9">Skema</a><a href="${base}logout.aspx">Log ud</a></div><div id="contenttable">${letters}<div id="m_Content_listecontainer"><ul>${links.map(([href, label]) => `<li><a href="${base}${href}">${label}</a></li>`).join('')}</ul></div></div></form></body></html>`;
const students = [['Anna Andersen', '3a', '01'], ['Bo Christensen', '3a', '02'], ['Demo Elev', '3a', '07'], ['Mikkel Holm', '3a', '12'], ['Sofie Bjørn', '3a', '15'], ['Emma Larsen', '2b', '04'], ['Jonas Østergaard', '2b', '09'], ['Ida Kjær', '1c', '03'], ['Ahmed Hassan', '1c', '11'], ['Clara Winther', '2b', '13']];
const byLetter = {};
students.forEach(([name, cls, nr], i) => (byLetter[name[0].toUpperCase()] ||= []).push([`SkemaNy.aspx?elevid=${300001 + i}`, `${name} (${cls} ${nr})`]));
const letterLinks = Object.keys(byLetter).sort().map((l) => `<a href="${base}FindSkema.aspx?type=elev&amp;forbogstav=${l}">${l}</a>`).join(' ');
put(base + 'FindSkema.aspx?type=elev', findPage('Find skema for elev', [], letterLinks));
for (const [l, links] of Object.entries(byLetter)) put(base + `FindSkema.aspx?type=elev&forbogstav=${l}`, findPage('Find skema for elev', links, letterLinks));
put(base + 'FindSkema.aspx?type=laerer', findPage('Find skema for lærer', [['Lene Madsen', 'lm'], ['Thomas Nielsen', 'tn'], ['Mette Sørensen', 'ms'], ['Karsten Ibsen', 'ki'], ['Pernille Vang', 'pv']].map(([n, c], i) => [`SkemaNy.aspx?laererid=${200001 + i}`, `${n} (${c})`])));
put(base + 'FindSkema.aspx?type=lokale', findPage('Find skema for lokale', [['A12', 'Klasselokale'], ['A14', 'Klasselokale'], ['B02', 'Fysik'], ['B03', 'Kemi'], ['C11', 'Musik'], ['', 'Hal 1'], ['', 'Bibliotek']].map(([nr, n], i) => [`SkemaNy.aspx?type=lokale&amp;nosubnav=1&amp;id=${700001 + i}`, `<span class="findskema-symbol">${nr}</span>${n}`])));
// Hold: an overview of subjects, one page per subject, and the members page of each hold.
const holdSubjects = [['524', 'MA', 'Matematik', ['3a Ma', '2b Ma', '1c Ma']], ['507', 'DA', 'Dansk', ['3a Da', '2b Da']], ['562', 'ØH', 'Øvrige hold', ['Kor']]];
put(base + 'FindSkema.aspx?type=hold', findPage('Vis Hold', holdSubjects.map(([id, code, name]) => [`FindSkema.aspx?type=hold&amp;fag=${id}&amp;prevurl=FindSkema.aspx%3ftype%3dhold`, `<span class="findskema-symbol">${code}</span>${name}`])));
let holdId = 800001;
for (const [fag, code, name, holds] of holdSubjects) {
  const items = holds.map((h) => [`SkemaNy.aspx?type=holdelement&amp;holdelementid=${holdId++}`, h]);
  put(base + `FindSkema.aspx?type=hold&fag=${fag}&prevurl=FindSkema.aspx%3ftype%3dhold`, findPage('Vis Hold', items).replace('<ul>', `<h4>${code} - ${name}</h4><ul>`));
}
const memberRow = (card, type, code, href, first, last) => `<tr><td data-lectiocontextcard="${card}"></td><td>${type}</td><td data-lectiocontextcard="${card}"><span>${code}</span></td><td data-lectiocontextcard="${card}"><a href="${base}${href}">${first}</a></td><td>${last}</td><td></td></tr>`;
for (let id = 800001; id < holdId; id++) {
  const rows = [memberRow('T200001', 'Lærer', 'lm', 'SkemaNy.aspx?laererid=200001', 'Lene', 'Madsen'), ...students.map(([n, cls, nr], i) => memberRow(`S${300001 + i}`, 'Elev', `${cls} ${nr}`, `SkemaNy.aspx?elevid=${300001 + i}`, n.split(' ')[0], n.split(' ').slice(1).join(' ')))];
  put(base + `subnav/members.aspx?holdelementid=${id}&showteachers=1&showstudents=1`, `<!doctype html><html><head><title>Holdet Demo - Lærere og elever - Lectio</title></head><body><form id="aspnetForm"><table id="s_m_Content_Content_laerereleverpanel_alm_gv"><tr><th>Foto</th><th>Type</th><th>ID</th><th>Fornavn</th><th>Efternavn</th><th>Studieretning</th></tr>${rows.join('')}</table></form></body></html>`);
  put(base + `SkemaNy.aspx?type=holdelement&holdelementid=${id}`, `<!doctype html><html><head><title>Holdet Demo - Skema - Lectio</title></head><body><form id="aspnetForm" action="SkemaNy.aspx"><div id="contenttable">${sched}</div></form></body></html>`);
}
writeFileSync(indexFile, JSON.stringify(index, null, 1));
console.log(Object.keys(index).length, 'fixtures');
