// Karakterer markup as observed on lectio.dk on 2026-10-02 (ids, classes,
// desktop/mobile duplicate cells, tooltips). Every value is invented.
const id = s => 's_m_Content_Content_' + s;
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const menu = '<div class="buttonicon ls-hidden-smallscreen lf-excel-exclude"><a id="_innerBtn" title="Klik her for at se flere muligheder" href="#"><span class="ls-fonticon">menu</span></a></div><div class="lec-context-menu" style="display:none"><ul><li><div class="buttonlink"><a href="#"><span class="ls-fonticon">download</span>Hent som Excel</a></div></li></ul></div>';
const island = (title, body, contentId, cls = 'xlargeBlock') => `<section class="lf-island ${cls} defaultBlockHeight ls-island-outlined"><div class="islandHeaderContainer" role="heading"><span class="islandHeader">${title}</span><span class="islandHeaderRight">${menu}</span></div><div id="${id(contentId)}" class="islandContent">${body}</div></section>`;
const noRecord = (span, text = 'Der er ingen data...') => `<tr><td colspan="${span}"><div class="noRecord">${text}</div></td></tr>`;

export const gradeTypes = ['1.standpunkt', '2.standpunkt', 'Afsluttende års-/<br> standpunktskarakter', 'Intern prøve', 'Årskarakter', 'Eksamens-/<br> årsprøvekarakter'];
// [hold, fag, xprs, weight, grades by type index: value | [value, final, extra]]
export const demoGrades = [
  ['3a Da', 'Dansk A, Skriftlig', '6688A Dansk', '1', ['7', '10', null, null, ['10', true], null]],
  ['3a Da', 'Dansk A, Mundtlig', '6688A Dansk', '1', ['10', '10', null, null, ['12', true], null]],
  ['3a En', 'Engelsk B, Skriftlig', '6689B Engelsk', '0,75', ['4', '7', '7', '7', null, ['7', true]]],
  ['3a Ma', 'Matematik A, Skriftlig', '22359A Matematik', '1', ['7', '7', null, null, ['10', true], null]],
  ['3a Ke', 'Kemi B, Mundtlig', '6729B Kemi', '0,75', ['10', '7', '10', null, null, ['7', true, 'vægt: 1,5']]],
  ['3a SO', 'Studieområdet og studieområdeprojektet, Mundtlig', '6699- Studieområdet', '1', [null, null, null, '12', null, null]],
];

function gradeCell(value, xprs, weight, cls) {
  if (!value) return '';
  const [grade, final, extra] = Array.isArray(value) ? value : [value, false];
  const title = `XPRSFag: ${xprs}\nKilde: ${final ? 'Protokol' : 'Karakter'}\nVægt: ${weight}`;
  const body = final ? `<b>${grade}</b>${extra ? `<br><b>${extra}</b>` : ''}` : grade;
  return `<div class="${cls}" title="${esc(title)}">${body}</div>`;
}
function gradeRow([hold, fag, xprs, weight, grades]) {
  const holdSpan = `<span data-lectiocontextcard="HE0">${hold}</span>`;
  const mobileHead = `<table class="ls-grades-mobile-table"><tbody><tr><th style="width: 30px">Hold: </th><td>${holdSpan}</td></tr><tr><th style="width: 30px">Fag: </th><td>${fag} </td></tr></tbody></table>`;
  const mobileGrades = `<table class="ls-grades-mobile-table"><tbody>${gradeTypes.map((t, i) => `<tr><th>${t.replace('<br>', '')}: </th><td>${gradeCell(grades[i], xprs, weight, 'textRight')}</td></tr>`).join('')}</tbody></table>`;
  return `<tr><td class="OnlyDesktop">${holdSpan}</td><td class="OnlyDesktop">${fag}</td><td class="OnlyMobile">${mobileHead}</td>${grades.map(g => `<td class="textCenter OnlyDesktop">${gradeCell(g, xprs, weight, 'textCenter')}</td>`).join('')}<td class="OnlyMobile">${mobileGrades}</td></tr>`;
}
export function gradeTable(rows = demoGrades) {
  const header = `<tr class=" "><th class="OnlyDesktop" scope="col"><img class=" ls-hidden-smallscreen" title="Vis større foto" src="" alt=""><br> Hold </th><th class="OnlyDesktop" scope="col">Fag</th><th class="OnlyMobile" scope="col">Hold/Fag</th>${gradeTypes.map(t => `<th class="OnlyDesktop" scope="col">${t}</th>`).join('')}<th class="OnlyMobile" scope="col">Karakter</th></tr>`;
  return `<table class="ls-table-layout2 lf-grid" id="${id('karakterView_KarakterGV')}"><tbody>${rows.length ? header + rows.map(gradeRow).join('') : noRecord(4)}</tbody></table>`;
}

export const demoDiploma = [
  ['Dansk A, skr.', ['2,00', '10', 'B'], ['2,00', '7', 'C']],
  ['Dansk A, mdt.', ['2,00', '12', 'A'], null],
  ['Engelsk B, skr.', ['0,75', '7', 'C'], ['0,75', '7', 'C']],
  ['Matematik A', ['2,00', '10', 'B'], null],
  ['Kemi B, mdt.', ['0,75', '10', 'B'], ['1,5', '7', 'C']],
];
export function diploma(lines = demoDiploma) {
  const tooltip = '<span class="tooltip" title="7-trins karakterskala. Omregnede karakterer fra 13-skalaen er markeret med *.">Karakter</span>';
  const head = `<tr><th rowspan="2">Fag</th><th colspan="3">Årskarakter</th><th colspan="3">Eksamenskarakter</th></tr><tr><th>Vægt</th><th>${tooltip}</th><th>ECTS</th><th>Vægt</th><th>${tooltip}</th><th>ECTS</th></tr>`;
  const group = g => (g || ['-', '-', '-']).map(v => `<td class="noWrap" align="center">${v}</td>`).join('');
  const body = lines.map(([fag, year, exam]) => `<tr><td class="noWrap" align="left">${fag}</td>${group(year)}${group(exam)}</tr>`).join('');
  const average = `<span id="${id('DiplomaTypeRepeater_ctl00_GradeAverageLabel')}" class="label-medium"><br>Eksamensresultat ekskl. bonus: &nbsp;&nbsp;&nbsp;&nbsp;8,4 <span class="resetText"><span class="infoText">(baseret på nuværende eksamenskarakterer</span>)</span><br>Eksamensresultat inkl. evt. bonus: 8,6 <span class="resetText"><span class="infoText">(baseret på nuværende eksamenskarakterer</span>)</span></span>`;
  const inner = `<section class="lf-island mediumBlockFixed defaultBlockHeight ls-island-filled"><div class="islandHeaderContainer" role="heading"><span class="islandHeader">Bevistype: HTX v4</span><span class="islandHeaderRight">${menu}</span></div><div id="${id('DiplomaTypeRepeater_ctl00_DiplomaGradesIsland_pa')}" class="islandContent"><div id="${id('DiplomaTypeRepeater_ctl00_printareaDiplomaLines')}" class="ls-mobile-overflow-scroll"><table class="ls-table-layout2"><tbody>${head}${body}</tbody></table></div>${average}</div></section>`;
  return `<section class="lf-island mediumBlock defaultBlockHeight ls-island-outlined"><div class="islandHeaderContainer" role="heading"><span class="islandHeader">Linjer på bevis</span></div><div id="${id('DiplomaIsland_pa')}" class="islandContent">${inner}</div></section>`;
}

const protocolLabels = ['Termin', 'Type', 'Medtæller', 'XPRS fag', 'Evaluerings­form', 'Hold', 'Vægt', 'Karakter', 'Skala'];
export const demoProtocol = [
  ['Sommer 2026', 'Eksamenskar.', 'Ja', '6688A Dansk', 'Skriftlig', '2026 3a Da', '2,00', '7', '7-trinsskala'],
  ['Sommer 2026', 'Afsl. Standpkt.', 'Ja', '22359A Matematik', 'Samlet vurdering', '2026 3a Ma', '2,00', '10', '7-trinsskala'],
  ['Vinter 2025/26', 'Intern prøve', 'Ja', '6699- Studieområdet', 'Mundtlig', '2025 3a SO', '1,00', '12', '7-trinsskala'],
];
export function protocol(rows = demoProtocol) {
  const head = `<tr>${protocolLabels.map(l => `<th class="OnlyDesktop">${l}</th>`).join('')}<th class="nodisplay MobileTagForNoDisplayHeader" style="display:none"></th></tr>`;
  const row = r => `<tr>${r.map((v, i) => `<td class="nowrap OnlyDesktop">${i === 3 || i === 5 ? `<span>${v}</span>` : v}</td>`).join('')}<td class="OnlyMobile"><table class="ls-grades-mobile-table"><tbody>${r.map((v, i) => `<tr><th>${protocolLabels[i].replace('­', '')}:</th><td>${v}</td></tr>`).join('')}</tbody></table></td></tr>`;
  const body = `<div class="textRight ls-hidden-smallscreen"><span id="${id('SendToButton4')}">${menu}</span></div><div id="printareaprotocolgrades"><div class="ls-table-wrapper"><table id="${id('ProtokolLinierGrid')}" class="ls-table-layout2 maxW lf-grid"><tbody>${head}${rows.map(row).join('')}</tbody></table></div></div>`;
  return island('Protokollinjer (datagrundlag for eksamensbevis)', body, 'protokolarea_pa');
}

export function gradesPage({grades = demoGrades, diplomaLines = demoDiploma, protocolRows = demoProtocol, notices = true} = {}) {
  const alerts = notices ? `<span id="${id('karakterView_WrittenProtokolBlockLit')}" class="alert">Der er midlertidigt lukket for visning af skr. protokollinjer/eksamensresultater for terminen "Vinter 2026/27"<br></span>` : '';
  const toolbar = `<div class="ls-std-rowblock"><div></div><div><span class="ls-label-normal ls-hidden-smallscreen">Udskriv(karakterer):</span><span id="${id('printsomebutton')}">${menu}</span><span><a id="${id('danishlink')}" class="aspNetDisabled">DA</a><a id="${id('englishlink')}" href="/lectio/123/grades/grade_report.aspx?culture=en">EN</a></span></div></div>`;
  const current = island('Karakterer', `${alerts}<div class="ls-table-wrapper">${gradeTable(grades)}</div>`, 'karakterView_LectioDetailIsland1_pa');
  const notes = island('Karakternoter', `<div class="ls-table-wrapper"><table id="${id('karakterView_KarakterNoterGrid')}" class="ls-table-layout2 maxW lf-grid"><tbody>${noRecord(6)}</tbody></table></div>`, 'karakterView_LectioDetailIsland2_pa');
  const remarks = island('Bemærkninger', `<div class="ls-mobile-overflow-scroll"><div class="ls-table-wrapper"><table id="${id('remarks_grid_remarks_grid')}" class="ls-table-layout2 maxW ls-mobile-fit-viewport lf-grid"><tbody><tr><th>Dato</th><th>Initialer</th><th>Type</th><th>Elevnote</th></tr>${noRecord(6, '<span class="norecord">Ingen bemærkninger</span>')}</tbody></table></div></div>`, 'LectioDetailIsland1_pa');
  return `<div id="printallarea" class="ls-card-filled ls-mobile-content-fullwidth">${toolbar}<div id="printsomearea"><div class="screenHideThumb_printShowThumb">${current}${notes}</div>${remarks}</div>${diploma(diplomaLines)}${protocol(protocolRows)}</div>`;
}
