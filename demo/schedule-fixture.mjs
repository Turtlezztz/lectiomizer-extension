// A SkemaNy.aspx week (uge 41, 2026). Brick classes, links and tooltip lines
// follow the lesson markup used by the Forside fixture; the extra tooltip lines
// (title, status, Lærere/Lokaler, Lektier/Note) follow Lectio's tooltip format.
// Every value is invented.
const base = '/lectio/123/';
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;').replaceAll('\n', '&#10;');

// [day, absid, top, status, tooltip lines, hold, teacher, room, title]
export const weekLessons = [
  [0, 101, 0, 's2normal', ['5/10-2026 08:15 til 09:45', 'Hold: 3a Da', 'Lærer: Lene Madsen (lm)', 'Lokale: A12', '', 'Lektier:', '- Læs novellen side 12-30'], '3a Da', 'lm', 'A12', ''],
  [0, 102, 4, 's2changed', ['Ændret!', 'Prøve', '5/10-2026 10:00 til 11:30', 'Hold: 3a Ma', 'Lærer: Thomas Nielsen (tn)', 'Lokale: B21'], '3a Ma', 'tn', 'B21', 'Prøve'],
  [1, 103, 0, 's2cancelled', ['Aflyst!', '6/10-2026 08:15 til 09:45', 'Hold: 3a En', 'Lærere: Mette Skov (ms), Lars Holm (lh)', 'Lokaler: C03, C04', '', 'Note:', 'Brug tiden på projektet.'], '3a En', 'ms', 'C03', ''],
  [2, 104, 0, 's2normal', ['7/10-2026 12:10 til 13:40', 'Hold: 3a Fy', 'Lærer: Kim Jensen (kj)', 'Lokale: Lab 2'], '3a Fy', 'kj', 'Lab 2', ''],
];

function brick([, absid, top, cls, tooltip, hold, teacher, room, title]) {
  const t = title ? ` - <span class="s2skemabrik-std-title">${title}</span>` : '';
  return `<a class="s2skemabrik s2bgbox ${cls} s2brik lec-context-menu-instance" style="position:absolute;top:${top}em;left:.55em;height:3.82em;width:13.82em" href="${base}aktivitet/aktivitetforside2.aspx?absid=${absid}&amp;prevurl=SkemaNy.aspx" data-tooltip="${esc(tooltip.join('\n'))}"><div class="s2skemabrikInnerContainer"><div class="s2skemabrikcontent">${top ? 2 : 1}. modul - <span data-lectiocontextcard="HE${absid}">${hold}</span> • <span data-lectiocontextcard="T${absid}">${teacher}</span> • ${room}${t}</div></div></a>`;
}

export function schedulePage(lessons = weekLessons, { duplicate = true } = {}) {
  const days = ['Mandag (5/10)', 'Tirsdag (6/10)', 'Onsdag (7/10)', 'Torsdag (8/10)', 'Fredag (9/10)'];
  const cells = days.map((_, day) => {
    const own = lessons.filter(l => l[0] === day).map(brick).join('');
    // Lectio sometimes renders the same brick twice; a note without a tooltip is not a lesson.
    const extra = day === 0 && duplicate && own ? brick(lessons[0]) : day === 3 ? '<div class="s2skemabrik s2bgbox s2normal">Lektiecafé</div>' : '';
    return `<td><div class="s2skemabrikcontainer lec-context-menu-instance" style="position:relative;width:14.909em;height:30em">${own}${extra}</div></td>`;
  }).join('');
  return `<div class="grid-area-skema"><table class="s2skema"><tbody><tr><td colspan="6">Uge 41 - 2026</td></tr><tr><td>Tid</td>${days.map(d => `<td>${d}</td>`).join('')}</tr><tr><td class="s2infoHeader"></td>${days.map(() => '<td class="s2infoHeader"></td>').join('')}</tr><tr><td></td>${cells}</tr></tbody></table></div>`;
}
