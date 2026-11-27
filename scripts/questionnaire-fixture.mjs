// Synthetic Spørgeskema pages with the markup shape of the real ones
// (spoergeskema_rapport.aspx and spoergeskema_besvar.aspx) and invented content.
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PREV = 'prevurl=spoergeskema%2fspoergeskema_rapport.aspx';

const master = (base, title, body, action) => `<!doctype html><html><head><title>${esc(title)} - Lectio</title>
<meta name="msapplication-starturl" content="${base}forside.aspx?elevid=9"></head><body>
<form method="post" action="${action}" id="aspnetForm"><input type="hidden" name="__EVENTTARGET" id="__EVENTTARGET" value=""><input type="hidden" name="__EVENTARGUMENT" id="__EVENTARGUMENT" value=""><input type="hidden" name="__VIEWSTATEX" value="x">
<div id="s_m_mastermenu"><a href="${base}forside.aspx">Forside</a><a href="${base}logout.aspx">Log ud</a></div>
<div class="ls-content-container"><div id="MainTitle" class="maintitle">${esc(title)}</div><div id="contenttable">${body}</div></div>
<input type="hidden" name="masterfootervalue" value="X1!ÆØÅ"></form></body></html>`;

const header = (grid, labels, mobileCols = 1) => `<tr class=" ">${'<th class="ls-hidden-smallscreen OnlyMobile" scope="col">&nbsp;</th>'.repeat(mobileCols)}${labels.map(l => `<th class="OnlyDesktop" scope="col"><a href="javascript:__doPostBack('s$m$Content$Content$${grid}','Sort$${l}')">${l}</a></th>`).join('')}</tr>`;
const link = (href, label, title = '') => `<div class="buttonlink"><a href="${href}" data-role="button"${title ? ` title="${title}"` : ''} tabindex="0">${esc(label)}</a></div>`;
const island = (title, table) => `<section class="lf-island"><div role="heading" class="islandHeaderContainer"><span class="islandHeader">${title}</span></div><div class="islandContent"><div class="ls-table-wrapper">${table}</div></div></section>`;

export const questionnaires = [
  { id: 4001, title: 'Trivsel i 3a', owner: 'Lene Madsen (lm)', anonymous: true, deadline: '15/12-2026 23:59' },
  { id: 4002, title: 'Kantinens udvalg', owner: 'Emma Larsen (2b 04)', anonymous: false, deadline: '4/12-2026 12:00' },
];

export function questionnaireListPage(base = '/lectio/123/', { empty = false } = {}) {
  const S = 'SpørgeskemaerÅbneForSvarGV', R = 'SpørgeskemaerÅbneForRapporteringGV', E = 'EgneSpørgeskemaerGV';
  const open = empty ? '' : questionnaires.map(q => {
    const href = `${base}spoergeskema/spoergeskema_besvar.aspx?id=${q.id}&amp;${PREV}`;
    return `<tr><td class="OnlyMobile"><div class="title-small">${link(href, q.title, 'Besvar spørgeskema')}</div><label>Svarfrist: </label><span class="noWrap"> ${q.deadline}</span></td><td class="minWidth10em OnlyDesktop">${link(href, q.title, 'Besvar spørgeskema')}</td><td class="minWidth10em OnlyDesktop">${esc(q.owner)}</td><td class="mediumCol OnlyDesktop">${q.anonymous ? 'Ja' : 'Nej'}</td><td class="largeCol OnlyDesktop">${q.deadline}</td></tr>`;
  }).join('');
  const reportHref = id => `${base}spoergeskema/spoergeskemarapportering.aspx?id=${id}&amp;${PREV}`;
  const reports = empty ? '' : `<tr><td class="OnlyMobile">${link(reportHref(3901), 'Motion i hverdagen')}</td><td class="minWidth10em OnlyDesktop">${link(reportHref(3901), 'Motion i hverdagen', 'Vis resultat af spørgeskemaundersøgelsen')}</td><td class="minWidth10em OnlyDesktop">Ida Kjær (1c 03)</td><td class="largeCol OnlyDesktop">5/11-2026 12:00</td><td class="largeCol OnlyDesktop">26/10-2026 14:02</td><td class="largeCol OnlyDesktop">31/12-2026 23:59</td></tr>`;
  const own = empty ? '' : `<tr><td class="OnlyMobile">${link(`${base}spoergeskema/spoergeskema_rediger.aspx?id=3801&amp;${PREV}`, 'Studietur', 'Rediger spørgeskema')}</td><td class="OnlyMobile">${link(reportHref(3801), 'Vis')}</td><td class="minWidth10em OnlyDesktop">${link(reportHref(3801), 'Studietur', 'Vis resultat af spørgeskemaundersøgelsen')}</td><td class="largeCol OnlyDesktop"></td><td class="largeCol OnlyDesktop"></td><td class="largeCol OnlyDesktop"></td></tr>`;
  const body = `<div class="buttonlink"><a href="${base}spoergeskema/skabeloner.aspx?elevid=9&amp;${PREV}" data-role="button" id="s_m_Content_Content_opretBtn"><span class="ls-fonticon ls-fonticon-stroke">add</span>Opret spørgeskema</a></div>
${island('Åbne for besvarelse', `<table class="ls-table-layout2 maxW lf-grid" id="s_m_Content_Content_${S}"><tbody>${header(S, ['Titel', 'Ejer', 'Anonym', 'Svarfrist'])}${open}</tbody></table>`)}
${island('Åbne for rapportering', `<table class="ls-table-layout2 maxW lf-grid" id="s_m_Content_Content_${R}"><tbody>${header(R, ['Titel', 'Ejer', 'Svarfrist', 'Frigives', 'Udløber'])}${reports}</tbody></table>`)}
${island('Egne spørgeskemaer', `<table class="ls-table-layout2 maxW lf-grid" id="s_m_Content_Content_${E}"><tbody>${header(E, ['Titel', 'Svarfrist', 'Frigives', 'Udløber'], 2)}${own}</tbody></table>`)}`;
  return master(base, 'Eleven Demo Elev, 3a - Spørgeskemaer', body, './spoergeskema_rapport.aspx');
}

/**
 * answers: { [ctl]: value } – radio: option index, checkbox: array of indexes, text: string
 * (what Lectio renders for a saved draft). answerable: false leaves out the buttons.
 */
export function questionnaireAnswerPage(base = '/lectio/123/', { id = 4001, answers = {}, answerable = true } = {}) {
  const q = questionnaires.find(x => x.id === id) || questionnaires[0];
  const N = 'm$Content$questionnairegv$', P = 'm_Content_questionnairegv_';
  let ctl = 1;
  const row = (heading, level, textHtml, answer = '') => `<tr><td><${level}>${esc(heading)}</${level}> <div class="ls-questionnaire-question-section"><div class="ls-questionnaire-question-section-content"><div class="ls-questionnaire-question-text"> ${textHtml} </div>${answer}<div id="hs${200000 + ctl}"> </div></div></div><br><hr class="ls-hr-solid-thick"></td></tr>`;
  const radio = (options) => {
    const c = `ctl${String(++ctl).padStart(2, '0')}`;
    const chosen = answers[c];
    return `<div class="ls-questionnaire-answer-option"><table id="${P}${c}_choicerbl"><tbody>${options.map((o, i) => `<tr><td><input id="${P}${c}_choicerbl_${i}" type="radio" name="${N}${c}$choicerbl" value="${id}${ctl}${i}"${chosen === i ? ' checked="checked"' : ''}><label for="${P}${c}_choicerbl_${i}">${esc(o)}</label></td></tr>`).join('')}</tbody></table></div>`;
  };
  const multi = (options) => {
    const c = `ctl${String(++ctl).padStart(2, '0')}`;
    const chosen = answers[c] || [];
    return `<div>${options.map((o, i) => `<div class="ls-questionnaire-answer-option"><input id="${P}${c}_multichoiceslv_ctrl${i}_multichoice" type="checkbox" name="${N}${c}$multichoiceslv$ctrl${i}$multichoice"${chosen.includes(i) ? ' checked="checked"' : ''}><label for="${P}${c}_multichoiceslv_ctrl${i}_multichoice"> <span class="questionnaireanswer">${esc(o)}</span></label></div>`).join('')}</div>`;
  };
  const text = () => {
    const c = `ctl${String(++ctl).padStart(2, '0')}`;
    return `<div class="ls-questionnaire-answer-text"><span class="nowrap"><textarea name="${N}${c}$answertext$tb" rows="6" cols="20" id="${P}${c}_answertext_tb" class=" ls-control-textbox-multiline ls-control-textbox-xlarge">${esc(answers[c] || '')}</textarea></span></div>`;
  };
  const rows = [
    row('1 Om dig og klassen', 'h2', 'Svar ærligt – ingen kan se, hvem der har svaret hvad.<br>Det tager cirka tre minutter.'),
    row('1.1 Hvor godt trives du i klassen?', 'h3', '(1 - 5)<br>hvor 5 er rigtig godt', radio(['1', '2', '3', '4', '5'])),
    row('1.2 Hvilke fag glæder du dig mest til?', 'h3', '', multi(['Dansk', 'Matematik', 'Engelsk', 'Idræt'])),
    row('1.3 Hvad kunne gøre klassen bedre?', 'h3', '', text()),
    row('2 Skolen', 'h2', ''),
    row('2.1 Hvor ofte bruger du biblioteket?', 'h3', '', radio(['Aldrig', 'Hver måned', 'Hver uge', 'Hver dag'])),
  ];
  const buttons = answerable ? `<div class="fixedBlock"><div id="m_Content_navBtnPanel" class="ls-std-rowblock"><div></div><div>
<div class="buttontext"><a href="#" data-role="button" onclick="WebForm_DoPostBackWithOptions(new WebForm_PostBackOptions(&quot;m$Content$answercompletebt&quot;, &quot;&quot;, true, &quot;&quot;, &quot;&quot;, false, true)); return false;" id="m_Content_answercompletebt"><span class="shortcutletter">I</span>ndsend</a></div>
<div class="buttontext"><a href="#" data-role="button" onclick="WebForm_DoPostBackWithOptions(new WebForm_PostBackOptions(&quot;m$Content$answerbt&quot;, &quot;&quot;, true, &quot;&quot;, &quot;&quot;, false, true)); return false;" id="m_Content_answerbt">Gem</a></div>
<div class="buttontext"><a href="#" data-role="button" onclick="__doPostBack('m$Content$cancelbt',''); return false;" id="m_Content_cancelbt">Annuller</a></div></div></div></div>` : '';
  const body = `<div id="printQueryArea"><section class="lf-island"><div id="m_Content_baseinfoIsland_pa" class="islandContent"><div class="ls-questionnaire-question"><h2 id="m_Content_oplysingerHeader">Spørgeskema</h2><table id="m_Content_InfoTable" class="ls-table-layout1 maxW ls-std-table-inputlist textTop"><tbody>
<tr><th>Titel:</th><td> ${esc(q.title)}</td></tr><tr id="m_Content_ownerUsrRow"><th>Ejer:</th><td> <span data-lectiocontextcard="T1">${esc(q.owner)}</span></td></tr><tr id="m_Content_anonymousrow"><th>Anonym <br> undersøgelse:</th><td> <br> ${q.anonymous ? 'Ja' : 'Nej'} </td></tr></tbody></table></div></div></section>
<section class="lf-island"><div id="m_Content_questionIsland2_pa" class="islandContent"><div class="ls-questionnaire-question"><div class="ls-table-wrapper"><table class="ls-table-layout1 maxW lf-grid" id="m_Content_questionnairegv"><tbody><tr class=" "><th scope="col">&nbsp;</th></tr>${rows.join('')}</tbody></table></div></div></div></section></div>${buttons}`;
  return master(base, `Besvar spørgeskema - ${q.title}`, body, `./spoergeskema_besvar.aspx?id=${id}&amp;${PREV}`);
}
