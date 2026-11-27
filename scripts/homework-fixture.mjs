// Synthetic Lektier page (material_lektieoversigt.aspx): invented data in the
// markup Lectio really sends — a desktop set of cells plus a mobile duplicate
// per row, and "…"-shortened bricks for lessons with many holds.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export const homeworkRows = [
  {
    absid: 5001, date: 'ma 30/11', module: '2. modul', title: 'Novelleanalyse', hold: ['HE900001', '3a Da'], teacher: ['T200001', 'lm'], room: 'A12',
    tooltip: 'Novelleanalyse\n30/11-2026 09:20 til 10:20\nHold: 3a Da\nLærer: Lene Madsen (lm)\nLokale: A12\n\nLektier:\n- Læs novellen [...]\n- Find tre citater [...]\n\nNote:\nHusk computer',
    items: ['Læs novellen', 'Find tre citater'],
  },
  {
    absid: 5002, date: 'ma 30/11', module: '4. modul', title: '', hold: ['HE900002', '3a Ma'], teacher: ['T200002', 'tn'], room: 'B02',
    tooltip: '30/11-2026 12:10 til 13:10\nHold: 3a Ma\nLærer: Thomas Nielsen (tn)\nLokale: B02\n\nLektier:\n- Opgave 412 og 415',
    items: ['Opgave 412 og 415'],
  },
  {
    // Fællesarrangement: shortened brick, everything else is in the tooltip.
    absid: 5003, date: 'to 3/12', module: '6. modul', title: 'Lektiecafé', changed: true, room: 'Forhal',
    tooltip: 'Ændret!\nLektiecafé\n3/12-2026 14:30 til 15:30\nHold: Alle 1.g-elever, Alle 2.g-elever, Alle 3.g-elever\nLærere: lm, tn, ms\nLokale: Forhal\n\nLektier:\n- Mulighed for at få hjælp med: [...]',
    items: ['Mulighed for at få hjælp med:'],
  },
];

export function homeworkPage(base, { empty = false } = {}) {
  const row = (r) => {
    const href = `${base}aktivitet/aktivitetforside2.aspx?absid=${r.absid}&amp;prevurl=material_lektieoversigt.aspx&amp;elevid=9`;
    const title = r.title ? ` - <span style="white-space:nowrap;">${esc(r.title)}</span>` : '';
    const inner = r.hold
      ? `${r.module} - <span data-lectiocontextcard="${r.hold[0]}">${esc(r.hold[1])}</span> • <span data-lectiocontextcard="${r.teacher[0]}">${r.teacher[1]}</span> • ${r.room}${title}`
      : `${r.module} - ... • ... • ${r.room}${title}`;
    const brick = (content) => `<a href="${href}" class="s2skemabrik s2bgbox ${r.changed ? 's2changed ' : ''}s2brik lec-context-menu-instance" data-brikid="ABS${r.absid}" data-tooltip="${esc(r.tooltip)}"><div class="s2skemabrikInnerContainer"><span class="s2skemabrikIcons"><span class="ls-fonticon ls-lektier">bookmark</span></span><div class="s2skemabrikcontent">${content}</div></div></a>`;
    const items = r.items.map((t, i) => `<a href="${base}aktivitet/aktivitetforside2.aspx?id=${r.absid + 1}&amp;prevurl=material_lektieoversigt.aspx&amp;elevid=9#hw${r.absid}${i}"><img alt="" src="/lectio/img/doc-homework.auto" style="margin-right:0.4em">${esc(t)}</a>`);
    return `<tr><td class="OnlyDesktop" valign="top">${r.date}</td><td class="textTop OnlyDesktop">${brick(inner)}</td><td class="OnlyDesktop" align="left">${items.join('<br>')}</td><td class="OnlyMobile" align="left">${brick(`${r.date} ${r.module}<br>${title}`)}${items.map((a) => `<div style="word-break:break-word;">${a}</div>`).join('')}<br></td></tr>`;
  };
  const table = empty ? '' : `<table class="ls-table-layout5 textTop lf-grid" id="s_m_Content_Content_MaterialLektieOverblikGV"><tbody><tr><th class="OnlyDesktop" scope="col">Dato</th><th class="OnlyDesktop" scope="col">Aktivitet</th><th class="OnlyDesktop" scope="col">Note &amp; Lektier</th><th class="ls-hidden-smallscreen OnlyMobile" scope="col">&nbsp;</th></tr>${homeworkRows.map(row).join('')}</tbody></table>`;
  return `<!doctype html><html><head><title>Eleven Demo Elev, 3a - Lektier - Lectio</title></head><body><form id="aspnetForm" action="material_lektieoversigt.aspx"><div id="s_m_mastermenu"><a href="${base}SkemaNy.aspx?type=elev&amp;elevid=9">Skema</a><a href="${base}logout.aspx">Log ud</a></div><div id="contenttable"><div id="s_m_Content_Content_ctl00_pa" class="islandContent"><div class="ls-table-wrapper">${table}</div><br></div></div></form></body></html>`;
}
