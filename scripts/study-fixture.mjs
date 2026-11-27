// Synthetic Studieplan, forløb, Undervisningsbeskrivelse, Bøger, SPS and
// Studiekort pages: invented data in the markup Lectio really sends.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const page = (base, title, action, body, script = '') =>
  `<!doctype html><html><head><title>Eleven Demo Elev, 3a - ${title} - Lectio</title></head><body><form id="aspnetForm" action="${action}"><div id="s_m_mastermenu"><a href="${base}SkemaNy.aspx?type=elev&amp;elevid=9">Skema</a><a href="${base}logout.aspx">Log ud</a></div><div id="contenttable">${body}</div>${script ? `<script type="text/javascript">//<![CDATA[\n${script}//]]>\n</script>` : ''}</form></body></html>`;

export const planHolds = [
  {
    id: 800001, name: '3a Da',
    phases: [
      { id: 9101, title: 'Romantikken', estimate: '12,00 moduler', period: 'ma 10/8-26 - fr 25/9-26' },
      { id: 9102, title: 'Novelleanalyse', estimate: '8,00 moduler', period: 'ma 23/11-26 - fr 18/12-26' },
      { id: 9103, title: 'Eksamensforberedelse & repetition', estimate: 'Ikke angivet', period: 'ma 12/4-27 - fr 30/4-27' },
    ],
    exercises: [{ id: 1001, title: 'Analyse af "Skærmen"', hours: '3', deadline: 'U49 fr 04-12-2026 23:30' }],
    hours: 'Total: 27 t.Norm: 24 t.',
  },
  {
    id: 800002, name: '3a Ma',
    phases: [
      { id: 9201, title: 'Vektorfunktioner', estimate: '14,00 moduler', period: 'fr 7/8-26 - fr 25/9-26' },
      // Overlaps the next phase: the timeline needs a second lane.
      { id: 9202, title: 'Differentialligninger', estimate: '10,00 moduler', period: 'ma 2/11-26 - fr 11/12-26' },
      { id: 9203, title: 'Projekt: modellering', estimate: '4,00 moduler', period: 'ma 30/11-26 - fr 4/12-26' },
    ],
    exercises: [],
    hours: 'Total: 40 t.Norm: 45 t.',
  },
];

export function studyPlanPage(base, { empty = false } = {}) {
  const prev = 'prevurl=studieplan.aspx%3fdisplaytype%3dugeteksttabel';
  const holds = empty ? [] : planHolds;
  const head = `<tr><th class="colHeader monthCell">Måned</th><th class="colHeader weekCell">Uge</th>${holds.map((h) => `<th colspan="2"><div class="columnContainer" data-tooltip="${h.name}"> <a href="${base}studieplan.aspx?displaytype=ugeteksttabel&amp;holdelementid=${h.id}" data-lectiocontextcard="HE${h.id}">${h.name}</a> </div></th>`).join('')}<th class="colHeader elevtidColumn">Elevtid</th><th class="colHeader lastWeekColumn">Uge</th></tr>`;
  const phaseCell = (h) => `<td class="col phaseCol phaseColFirst"><div class="thisWeek" style="top:342px;height:21px;"> &nbsp; </div>${h.phases.map((p, i) => `<div class="phase" style="height:78px;top:${i * 100}px;"> <a href="${base}studieplan/forloeb_vis.aspx?phaseid=${p.id}&amp;${prev}" data-tooltip="${esc(`Titel: ${p.title}\nEstimat: ${p.estimate}\nPeriode: ${p.period}`)}" data-lectiocontextcard="PH${p.id}">${esc(p.title)}</a> </div>`).join('')}</td>`;
  const exerciseCell = (h) => `<td class="col exerciseCol">${h.exercises.map((e) => `<div class="exercise" data-tooltip="${esc(`${h.name}\n${e.title}\nElevtid: ${e.hours} timer.\nAfleveringsfrist: ${e.deadline}\n`)}" style="top:282px;"> <a href="${base}ElevAflevering.aspx?elevid=9&amp;exerciseid=${e.id}&amp;${prev}" style="white-space:nowrap;"><img class="exerciseicon" src="/lectio/img/transparent.png" alt="Opgave" style="display:inline;">${e.hours}</a> </div>`).join('')}</td>`;
  const body = `<tr><td class="monthCol monthCell"><div class="monthCol"><div class="month">aug. 2026</div></div></td><td class="weekCol weekCell"><div class="week" data-tooltip="lø 1/8-26 - sø 2/8-26">31</div></td>${holds.map((h) => phaseCell(h) + exerciseCell(h)).join('')}<td class="col elevtidcol elevtidColumn"></td><td class="weekCol lastWeekColumn"></td></tr>`;
  const foot = `<tr><td colspan="2">Elevtid</td>${holds.map((h) => `<td colspan="2">${h.hours.replace('t.N', 't.<br>N')}</td>`).join('')}<td></td><td></td></tr>`;
  const table = holds.length ? `<table id="s_m_Content_Content_spUge_theTable" class="yeartable timevertical"><thead>${head}${body}${foot}</thead></table>` : '';
  return page(base, 'Studieplan Kalender', 'studieplan.aspx?displaytype=ugeteksttabel', `<div id="s_m_Content_Content_TextTablePnl"><section class="lf-island"><div class="islandContent"><div class="ls-studyplan-scroll">${table}</div></div></section></div>`);
}

export function phasePage(base, { id = 9102 } = {}) {
  const ov = `<div class="ls-phase-activity" id="overview"><div data-to-toc-id="overview" class="ls-paper-section-heading ls-section-title-heading" role="heading" aria-level="2"> Forløb - Novelleanalyse </div>
<table class="ls-table-layout1 textTop textLeft ls-table-minwidth"><tbody>
<tr id="m_Content_Visning_forloebOversigtControl2_tocAndToolbar_HoldRow"><th>Hold:</th><td> <span data-lectiocontextcard="HE800000">2025/26: 2a Da</span> <br> <span data-lectiocontextcard="HE800001">2026/27: 3a Da</span> <br> </td></tr>
<tr><th> Periode: </th><td> 23-11-2026 — 18-12-2026 <br> </td></tr>
<tr><th> Fag: </th><td> Dansk </td></tr>
<tr><th> Lærer: </th><td> <span data-lectiocontextcard="T200001">Lene Madsen</span> </td></tr>
<tr><th> Estimat: </th><td> 8,00 moduler </td></tr>
<tr><th>Forløbsbeskrivelse:</th><td>Vi læser tre noveller og arbejder med <b>fortæller</b> og komposition.<br>Afsluttes med en skriftlig analyse.</td></tr>
<tr><th> Særlige fokuspunkter: </th><td> </td></tr>
<tr><th> Arbejdsformer: </th><td> <ul class="standardlist"> </ul> </td></tr>
<tr id="m_Content_Visning_forloebOversigtControl2_tocAndToolbar_WrittenWorkRow"><th> Skriftligt arbejde: </th><td class="textTop"><div class="ls-table-wrapper"><table class="ls-table-layout4 lf-grid" id="m_Content_Visning_forloebOversigtControl2_tocAndToolbar_ExercisesGrid"><tbody><tr><th scope="col">Titel</th><th scope="col">Afleveringsfrist</th></tr><tr><td><a href="${base}ElevAflevering.aspx?elevid=9&amp;exerciseid=1001">Analyse af "Skærmen"</a></td><td>04-12-2026</td></tr></tbody></table></div></td></tr>
</tbody></table></div>`;
  const brick = (absid, actid, when, title, tip, cls = 's2normal') => `<a href="${base}aktivitet/aktivitetforside2.aspx?id=${actid}&amp;prevurl=studieplan%2fforloeb_vis.aspx%3fphaseid%3d${id}%23ACC${actid}" class="s2skemabrik ${cls} s2brik lec-context-menu-instance" data-brikid="ABS${absid}" data-tooltip="${esc(tip)}"><div><div class="s2skemabrikcontent OnlyDesktop">${when} - <span data-lectiocontextcard="HE800001">3a Da</span> • <span data-lectiocontextcard="T200001">lm</span> • A12${title ? ` - <span class="s2skemabrik-std-title">${title}</span>` : ''}</div><div class="s2skemabrikcontent lf-excel-exclude OnlyMobile">${when}</div></div></a>`;
  const act = (actid, brickHtml, note, content) => `<div class="ls-phase-activity" id="ACC${actid}" style="margin-top: 2em;"><div class="ls-phase-activity-title"><div class="ls-paper-section-heading"><div class="ls-std-rowblock-top-ltr"><div><span class="ls-paper-section-heading-checkbox"> </span></div><div> </div><div><div data-to-toc-id="ACC${actid}" role="heading" aria-level="2" class="ls-section-title-heading"> ${brickHtml} </div><div> ${note} </div></div></div></div></div><div class="ls-phase-activity-content">${content}</div></div>`;
  const acts = [
    act(6001, brick(5001, 6001, 'ma 30/11 2. modul', 'Novelleanalyse', 'Novelleanalyse\n30/11-2026 09:20 til 10:20\nHold: 3a Da\nLærer: Lene Madsen (lm)\nLokale: A12\nNote: Husk computer'), 'Husk computer',
      `<div id="x_homeworkTypeSeparator"><hr></div><div id="x_InlineHomework"><div role="heading" class="ls-paper-section-heading ls-section-subgroup-heading">Lektier</div><a id="ACH1"></a><article id="art1" class="lc-display-fragment ls-acr-display"><h1>Læs novellen</h1><p>Side 12–20 i antologien.</p></article></div><div id="x_InlineOther"><div role="heading" class="ls-paper-section-heading ls-section-subgroup-heading">Øvrigt indhold</div><article id="art2" class="lc-display-fragment"><h1><a href="https://example.org/noveller" class="lc-display-nakedlink">Om novellen som genre</a></h1></article></div>`),
    act(6002, brick(5004, 6002, 'fr 18/12 3. modul', '', 'Ændret!\n18/12-2026 10:30 til 11:30\nHold: 3a Da\nLærer: Lene Madsen (lm)\nLokale: A12', 's2changed'), '',
      `<div id="y_emptyList"><div class="noRecordItalic">Der er intet indhold</div></div>`),
  ];
  return page(base, 'Forløb', `studieplan/forloeb_vis.aspx?phaseid=${id}`, `<div class="ls-card-elevated"><div class="lectioTabContent"><div id="phaseContent">${ov}<div id="m_Content_Visning_forloebOversigtControl2_tocAndToolbar_actContainer">${acts.join('')}</div></div></div></div>`);
}

export const uvbSubjects = [['507', 'Dansk'], ['524', 'Matematik']];

export function descriptionsPage(base, { subject = '507', empty = false } = {}) {
  const select = `<div id="s_m_Content_Content_UvbChooseHoldTbl" class="ls-std-rowblock"><div><select name="s$m$Content$Content$fagDD" id="s_m_Content_Content_fagDD">${uvbSubjects.map(([id, name]) => `<option${id === subject ? ' selected="selected"' : ''} value="${id}" url="${base}studieplan/undervisningsbeskrivelse.aspx?sel_fag_id=${id}">${name}</option>`).join('')}</select></div></div>`;
  const row = (label, value) => `<tr><td class="uvbtitle"><b>${label}</b></td><td class="uvbcontent">${value}</td></tr>`;
  const phase = (n, id, title, text) => `<div id="ph${id}"><table class="ls-table-layout2 minWidth100"><tbody>${row(`Titel ${n} `, `<a data-lectiocontextcard="PH${id}" href="${base}studieplan/forloeb_vis.aspx?phaseid=${id}&amp;prevurl=studieplan%2fundervisningsbeskrivelse.aspx"><span style="font-size: 1.2em; font-weight: bold">${title}</span></a><br><br>${text}`)}${row('Indhold', `<em>Kernestof:</em><ul class="linklist-img"><li><a class="wrap" href="${base}studieplan/forloeb_vis.aspx?phaseid=${id}#ACH1">Antologi, s. 12–80</a></li></ul>`)}${row('Omfang', 'Estimeret: 8,00 moduler<br>Dækker over: 6 <span class="tooltip">moduler</span>')}${row('Særlige fokuspunkter', ' ')}${row('Væsentligste arbejdsformer', ' ')}</tbody></table></div><br>`;
  const box = empty
    ? `<div id="s_m_Content_Content_undervisningsBeskrivelseElevFagCtrl_uvbcontainer" class="ls-card-elevated"><span class="noRecordItalic">Der er ingen undervisningsbeskrivelse</span></div>`
    : `<div id="s_m_Content_Content_undervisningsBeskrivelseElevFagCtrl_uvbcontainer" class="ls-card-elevated"><div class="ls-std-rowblock"><div></div></div><span class="noRecordItalic"></span><h2 class="textCenter">Undervisningsbeskrivelse</h2><strong>Stamoplysninger til brug ved prøver til gymnasiale uddannelser</strong><table class="ls-table-layout2 minWidth100"><tbody>${row('Termin(er)', '2024/25 - 2026/27')}${row('Institution', 'Demo Gymnasium')}${row('Fag og niveau', 'Dansk A')}${row('Lærer(e)', 'Lene Madsen')}${row('Hold', '2024 3a Da (<span data-lectiocontextcard="HE800001">3a Da</span>)')}</tbody></table><br><strong>Oversigt over gennemførte undervisningsforløb</strong><br><table class="ls-table-layout2 minWidth100"><tbody>${row('<strong>Titel 1</strong>', '<a href="#ph9101">Romantikken</a>')}${row('<strong>Titel 2</strong>', '<a href="#ph9102">Novelleanalyse</a>')}</tbody></table><br><strong>Beskrivelse af de enkelte undervisningsforløb (1 skema for hvert forløb)</strong><br>${phase(1, 9101, 'Romantikken', 'Universalromantik og nationalromantik.')}${phase(2, 9102, 'Novelleanalyse', 'Tre noveller, fokus på <b>fortæller</b>.')}</div>`;
  return page(base, 'Undervisningsbeskrivelse', 'studieplan/undervisningsbeskrivelse.aspx', `${select}<div id="printUVBarea">${box}</div>`);
}

export const loans = [
  { title: 'Antologi for 3.g (papirbog)', hold: '3a Da', lent: '10-08-2026', returned: '', due: '30-06-2027', price: '349,00' },
  { title: 'Matematik A, bind 2', hold: '3a Ma', lent: '12-08-2025', returned: '20-06-2026', due: '30-06-2026', price: '1.250,50' },
];

export function booksPage(base, { activeOnly = false, empty = false } = {}) {
  const rows = (empty ? [] : loans.filter((l) => !activeOnly || !l.returned)).map((l) => `<tr><td class="OnlyDesktop">${esc(l.title)}</td><td class="noWrap OnlyDesktop"><span data-lectiocontextcard="H800001">${l.hold}</span></td><td class="OnlyDesktop" align="center">${l.lent}</td><td class="OnlyDesktop" align="center">${l.returned || ' '}</td><td class="OnlyDesktop" align="center">${l.due}</td><td class="OnlyDesktop" align="right">${l.price}</td><td class="ls-column-2xlarge-max textTop OnlyMobile"><div><b>${esc(l.title)}</b></div><div><b>Pris:</b> ${l.price} kr.</div></td><td class="textTop OnlyMobile"><div><b>Afl.frist:</b> ${l.due}</div></td></tr>`);
  const sort = (k, label) => `<a href="javascript:__doPostBack('s$m$Content$Content$BdBookLoanGV','Sort$${k}')">${label}</a>`;
  const head = `<tr class=" "><th class="OnlyDesktop" scope="col">${sort('BookTitel', 'Bogtitel')}</th><th class="OnlyDesktop" scope="col">${sort('HoldID', 'Hold')}</th><th class="OnlyDesktop" scope="col">${sort('StartDate', 'Udlån reg. ­dato')}</th><th class="OnlyDesktop" scope="col">${sort('ReturnedDate', 'Aflevering reg. ­dato')}</th><th class="OnlyDesktop" scope="col">${sort('ReturnDateEffective', 'Afleveringsfrist')}</th><th class="OnlyDesktop" scope="col">${sort('Book.Pris', 'Vejl.<br>Pris/kr.')}</th><th class="OnlyMobile" scope="col">Bogtitel</th><th class="OnlyMobile" scope="col">Datoer</th></tr>`;
  const body = rows.length ? rows.join('') : '<tr><td colspan="6"><div class="noRecord">Der er ingen data...</div></td></tr>';
  return page(base, 'Bøger', 'BD/UserReservations.aspx', `<section class="lf-island"><div id="s_m_Content_Content_LectioDetailIsland1_pa" class="islandContent"><div class="ls-std-rowblock"><div><input id="s_m_Content_Content_ShowActiveOnlyCB" type="checkbox" name="s$m$Content$Content$ShowActiveOnlyCB"${activeOnly ? ' checked="checked"' : ''} onclick="javascript:setTimeout('__doPostBack(\\'s$m$Content$Content$ShowActiveOnlyCB\\',\\'\\')', 0)"><label for="s_m_Content_Content_ShowActiveOnlyCB">Vis kun aktive</label></div></div><div id="loansPrintArea"><div class="ls-table-wrapper"><table class="ls-table-layout2 lf-grid" id="s_m_Content_Content_BdBookLoanGV"><tbody>${head}${body}</tbody></table></div></div></div></section>`);
}

export function spsPage(base, { withData = false } = {}) {
  const none = '<p class="noRecord">Eleven har ingen indstillinger...</p>';
  const current = withData ? '<p>Indstillet til <b>ordblindestøtte</b> i 2026/27.</p>' : none;
  const settings = withData
    ? '<tr><th scope="col">Type</th><th scope="col">Periode</th></tr><tr><td>Ordblindestøtte</td><td>2026/27</td></tr>'
    : '<tr class="noRecord"><td><div class="noRecord">Eleven har ingen indstillinger...</div></td></tr>';
  const regs = withData
    ? '<tr><th scope="col">Dato</th><th scope="col">Type</th><th scope="col">Timer</th></tr><tr><td>02-11-2026</td><td>Studiestøtte</td><td>1</td></tr><tr><td>16-11-2026</td><td>Studiestøtte</td><td>1,5</td></tr>'
    : '<tr><td colspan="6"><div class="noRecord">Der er ingen data...</div></td></tr>';
  return page(base, 'SPS', 'Elev_SPS.aspx', `<div id="s_m_Content_Content_UpdatePanel"><div id="s_m_Content_Content_UpdatePanel_Content"><section class="lf-island"><div role="heading" class="islandHeaderContainer"><span class="islandHeader">SPS Indstilling</span></div><div id="s_m_Content_Content_UpdatePanel_IndstillingIsland_pa" class="islandContent"><div class="ls-island-content-menu"> </div>${current}</div></section><section class="lf-island"><div id="s_m_Content_Content_UpdatePanel_StudentSpsIndstillingPick_pa" class="islandContent"><table class="ls-table-layout2 maxW lf-grid" id="s_m_Content_Content_UpdatePanel_SpsIndstsGV"><tbody>${settings}</tbody></table></div></section><section class="lf-island"><div id="s_m_Content_Content_UpdatePanel_SPSRegistrations_pa" class="islandContent"><table class="ls-table-layout2 lf-grid" id="s_m_Content_Content_UpdatePanel_SpsRegistrationsGV"><tbody>${regs}</tbody></table></div></section></div></div>`);
}

export function studentCardPage(base) {
  const card = `<div class="ls-studiekort-outercontainer"><div class="ls-studiekort"><div id="s_m_Content_Content_StudiekortContianerID" class="ls-studiekort-container"><span class="StudieKortTitel">STUDIEKORT</span><div><div class="StudieKortText"><span id="s_m_Content_Content_StudentName" class="Studiekortnavn">Demo Elev</span><span id="s_m_Content_Content_SchoolName" class="Studiekortskole">Demo Gymnasium</span><span id="s_m_Content_Content_StudentBirthday" class="Studiekortalder">Fødselsdag: 1/1-2008 (18 år)</span></div><div id="s_m_Content_Content_StudiekortLogoContainer" class="ls-studiekort-logo-container"><img id="s_m_Content_Content_LogoID" class="ls-studiekort-logo" alt=""></div></div><div id="s_m_Content_Content_flipImgContainer" class="ls-studiekort-img"><img src="${base}GetImage.aspx?pictureid=4242&amp;fullsize=1" id="s_m_Content_Content_StudPic" alt="Could not get picture" class="StudPic"><img id="s_m_Content_Content_QRCode_theQrCode" class="StudieKortQR"></div><div id="s_m_Content_Content_LectioCR" class="LectioSKcr">© Lectio d. 27/11-2026 17:42</div></div></div></div>`;
  return page(base, 'Studiekort', 'digitaltStudiekort.aspx', card, `LectioQRCode.Initialize('s_m_Content_Content_QRCode_theQrCode', 'https://www.lectio.dk${base}GetImage.aspx?type=studiekortqr&studentid=9', '', 36000);`);
}
