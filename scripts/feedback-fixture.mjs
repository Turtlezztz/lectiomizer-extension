// Synthetic "Elevfeedback" tab of aktivitetforside2.aspx (lectab=elevindhold),
// with the markup shape of the real page and invented content.
// open: false renders the tab as Lectio does when elevfeedback isn't open.
// canWrite: false renders the student's own paper read-only (no Rediger button).
// editing: false renders Lectio's read mode: own paper as an article plus the
// "Rediger" button that switches to the editor.
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function feedbackPage(base = '/lectio/123/', { absid = 5001, open = true, canWrite = true, editing = true, ownHtml } = {}) {
  const P = 's_m_Content_Content_Elevindhold_tocAndToolbar_';
  const N = 's$m$Content$Content$Elevindhold$tocAndToolbar$';
  const students = [
    ['S101', 'Alma Holm', '<h1 id="1001">Tre rammer</h1><p>Rammen på side 6 viser <strong>byen som en labyrint</strong>, og stemningen er trykket.</p><ul><li>Side 6: labyrinten</li><li>Side 14: døren</li></ul>'],
    ['S102', 'Bertram Juul', '<p>Jeg synes billederne er <em>dystre</em>. <a href="/lectio/123/lc/ext/DT1/noter.docx" data-lc-display-linktype="file">noter.docx</a></p>'],
    ['S103', 'Clara Winther', ''],
    ['S104', 'Demo Elev', null],
  ];
  const own = ownHtml ?? '<h1 id="2001">Mine rammer</h1><p style="text-align: center">Første udkast.</p>';
  const ctrl = i => `${P}elevindholdEditLV_ctrl${i + 1}_`;
  const paper = ([id, name, html], i) => {
    const isOwn = html === null;
    if (!isOwn && !html) return '';
    const body = isOwn && canWrite && editing
      ? `<div id="${ctrl(i)}HomeworkEditLV_ctrl0_editorContainer"><span id="${ctrl(i)}HomeworkEditLV_ctrl0_editor_0"><div id="${ctrl(i)}HomeworkEditLV_ctrl0_editor_0_c_0"><textarea name="${N}elevindholdEditLV$ctrl${i + 1}$HomeworkEditLV$ctrl0$editor$ed" id="${ctrl(i)}HomeworkEditLV_ctrl0_editor_0_ed_0" lectio-role="editor-textarea" style="visibility: hidden;">${esc(own)}</textarea></div><input type="hidden" name="${N}elevindholdEditLV$ctrl${i + 1}$HomeworkEditLV$ctrl0$editor$isDirty" /><input type="hidden" name="${N}elevindholdEditLV$ctrl${i + 1}$HomeworkEditLV$ctrl0$editor$editorBookmarkField" /></span></div>`
      : `<article id="${ctrl(i)}HomeworkEditLV_ctrl0_actContentRowCtrl_article" class="lc-display-fragment ls-acr-display">${isOwn ? own : html}</article>`;
    return `<div id="${ctrl(i)}contentHeaderStudentName" class="ls-paper"><div class="ls-section-subgroup-heading" role="heading"><span data-lectiocontextcard="${id}">${name}</span></div><div id="ACH${9000 + i}" data-role="homeworkitemdetails" class="homeworkContainer elevindholdContainer">${body}</div></div>`;
  };
  const toc = [['', 'Lærer', ''], ...students].map(([id, name, html], i) => {
    const head = `<div class="ls-std-rowblock-top"><div><h3>${id ? `<span data-lectiocontextcard="${id}">${name}</span>` : `<div>${name}</div>`}</h3></div></div>`;
    const has = open && (html === null || html);
    const entry = has ? `<div style="display: table-row;"><div class="homeworkContainer"><div class="ls-homework-toc"><span><a href="#ACH${9000 + i - 1}">${name === 'Demo Elev' ? 'Mine rammer' : 'Indlæg'}</a></span></div></div></div>` : '<div class="noRecordItalic">&nbsp;</div>';
    return head + `<div style="display: table;">${entry}</div>`;
  }).join('');
  const href = tab => `${base}aktivitet/aktivitetforside2.aspx?absid=${absid}&amp;lectab=${tab}`;
  return `<!doctype html><html><head><title>Eleven Demo Elev, 3a - Aktivitetsforside - Lectio</title></head><body>
<form method="post" action="./aktivitetforside2.aspx?absid=${absid}&amp;lectab=elevindhold" id="aspnetForm">
<input type="hidden" name="__EVENTTARGET" id="__EVENTTARGET" value="" /><input type="hidden" name="__EVENTARGUMENT" value="" /><input type="hidden" name="__VIEWSTATEX" value="demo" />
<a href="${base}logout.aspx">Log ud</a><div id="s_m_HeaderContent_MainTitle" class="maintitle" data-lectiocontextcard="S104">Eleven Demo Elev, 3a - Aktivitetsforside</div>
<div id="contenttable"><div class="ls-toccontent-container" id="PrintAktivititetArea"><div class="ls-tabs4">
<div class="lectioTabToolbar"><div class="buttonoutlined"><a href="${href('lektier')}" data-role="button">Indhold</a></div><div class="buttonoutlined"><a href="#" data-role="button" disabled="disabled" onclick="return false;">Elevfeedback</a></div></div>
<div class="lectioTabContent"><div class="hiddenButtons"><a href="#" onclick="LCDocumentEditor.ExecSaveCommandOnFirstInstance(); return false;" id="s_m_Content_Content_Elevindhold_UpdateHomeworkBtn">Gem</a></div>
<div class="ls-texteditor-container"><div class="ls-tocandcontentparent">
<div id="${P}tocContainer" class="ls-tocContainer-outer"><div id="${P}tocDiv" class="ls-tocContainer-inner">${toc}</div></div>
<div id="${P}outerContentContainer" class="ls-tocContent-outer"><div id="ElevContentContainer" class="ls-texteditor-paper-container">
<div class="ls-paper-header"><div class="ls-std-rowblock-top-ltr ls-section-title-heading" role="heading"><div><a class="s2skemabrik s2normal" data-brikid="ABS${absid}"><div><div class="s2skemabrikcontent OnlyDesktop">fr 9/10 2. modul - <span data-lectiocontextcard="HE1">3a Da</span> • <span data-lectiocontextcard="T1">lm</span> • A12</div></div></a></div></div></div>
${open && canWrite && !editing ? `<div class="buttontext"><a href="#" onclick="__doPostBack('${N}editModeBtn',''); return false;" id="${P}editModeBtn"><span class="ls-fonticon">edit</span>Rediger</a></div>` : ''}<div id="${P}inlineHomeworkDiv">${open ? students.map(paper).join('') : ''}</div>
<div class="nb_type_information ls-hidden-smallscreen">Her kan elever f.eks. skrive noter eller besvare arbejdsspørgsmål fra læreren.</div>
</div></div></div></div></div></div></div></div>
</form></body></html>`;
}
