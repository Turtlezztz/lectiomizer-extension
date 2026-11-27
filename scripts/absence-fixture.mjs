// Synthetic subnav/fravaerelev.aspx ("Fravær – Oversigt") in Lectio's markup, with
// invented numbers. `detailed: false` is the page before "Vis detaljer" is ticked.
const id = (name) => `s_m_Content_Content_ElevUpdatePanel_FravaerOversigt_${name}`;

// hold, [period absent/total], [settled absent/total], [written period], [written settled]
export const absenceHolds = [
  ['3a Da', [2, 14], [4, 32], [1, 3], [1, 40]],
  ['3a Ma', [0.5, 14], [2.5, 34], [0, 3], [0, 30]],
  ['3a En', [0, 12], [2, 30], [0, 2], [0, 14]],
  ['3a Fy', [0, 10], [0.5, 22], null, [0, 6]],
  ['3a Id', [0, 4], [0, 12], null, null],
];

const da = (n) => String(n).replace('.', ',');
const frac = (g) => (g ? `${da(g[0])}/${da(g[1])}` : '');
const pct = (g) => (g ? `${da((Math.round((g[0] / g[1]) * 1000) / 10).toFixed(1))}%` : '');
const sum = (i) => {
  const parts = absenceHolds.map((h) => h[i]).filter(Boolean);
  return [parts.reduce((s, g) => s + g[0], 0), parts.reduce((s, g) => s + g[1], 0)];
};

export function absenceOverviewPage(base, { detailed = true, remarks = true } = {}) {
  const cells = (groups) =>
    detailed
      ? groups.map((g) => `<td>${frac(g)}</td><td>${pct(g)}</td>`).join('')
      : `<td>${frac(groups[0])}</td><td>${pct(groups[1])}</td><td>${frac(groups[3])}</td>`;
  const head = detailed
    ? `<tr><th rowspan="3">Hold</th><th colspan="4">Almindeligt fravær</th><th colspan="4">Skriftligt fravær</th></tr>
       <tr><th colspan="2">Periode</th><th colspan="2">Opgjort</th><th colspan="2">Periode</th><th colspan="2">Opgjort</th></tr>
       <tr><th>Moduler</th><th>Procent</th><th>Moduler</th><th>Procent</th><th>Elevtid</th><th>Procent</th><th>Elevtid</th><th>Procent</th></tr>`
    : `<tr><th rowspan="3">Hold</th><th colspan="2">Almindeligt fravær</th><th>Skriftligt fravær</th></tr>
       <tr><th>Periode</th><th>Opgjort</th><th>Opgjort</th></tr>
       <tr><th>Moduler</th><th>Procent</th><th>Elevtid</th></tr>`;
  const rows = absenceHolds
    .map(([hold, ...groups], i) => `<tr><td><a href="${base}fravaer_elevhold.aspx?holdelementid=${800000 + i}&amp;elevid=1">${hold}</a></td>${cells(groups)}</tr>`)
    .join('');
  const totals = [1, 2, 3, 4].map(sum);
  // Lectio shows the period total as a percent only when details are off.
  const total = detailed ? cells(totals) : `<td>${pct(totals[0])}</td><td>${pct(totals[1])}</td><td>${frac(totals[3])}</td>`;
  const name = id('UdvidCB').replaceAll('_', '$');
  const warnings = remarks
    ? `<tr><td>05-10-2026</td><td>lm</td><td>Samtale</td><td>For højt fravær i dansk</td><td></td></tr>`
    : `<tr><td colspan="5" class="noRecord">Der er ingen bemærkninger...</td></tr>`;
  return `<!doctype html><html><head><title>Eleven Demo Elev, 3a - Fravær oversigt - Lectio</title></head><body><form id="aspnetForm" action="fravaerelev.aspx"><a href="${base}logout.aspx">Log ud</a><div id="contenttable">
    <div>Periode: <input type="text" name="from" value="05/09-2026"> <input type="text" name="to" value="05/10-2026">
      <input type="checkbox" id="${id('UdvidCB')}" name="${name}"${detailed ? ' checked="checked"' : ''} onclick="javascript:setTimeout('__doPostBack(\\'${name}\\',\\'\\')', 0)"><label>Vis detajler</label></div>
    <table id="${id('SFTabStudentAbsenceDataTable')}" class="ls-table-layout2">${head}${rows}<tr><td>Ej hold</td>${'<td></td>'.repeat(detailed ? 8 : 3)}</tr><tr><td>Samlet</td>${total}</tr></table>
    <table id="${id('SFTabWarningGV')}" class="ls-table-layout2 lf-grid"><tr><th>Dato</th><th>Initialer</th><th>Type</th><th>Elevnote</th><th></th></tr>${warnings}</table>
  </div></form></body></html>`;
}
