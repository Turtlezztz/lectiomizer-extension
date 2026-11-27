// Reads studieplan/undervisningsbeskrivelse.aspx: a subject picker and, per
// hold the student has had in that subject, the formal description (stamdata
// table + one table per forløb). Content stays as DOM nodes for RichText.
import { text } from '../page-data.js';
import { ReaderError } from './util.js';

// Two-column uvb table → [{label, text, node}]
function rows(table) {
  return Array.from(table?.rows || []).map(row => {
    const label = row.querySelector('.uvbtitle');
    const value = row.querySelector('.uvbcontent');
    if (!label || !value) return null;
    return { label: text(label), text: text(value), node: text(value) || value.querySelector('img') ? value : null };
  }).filter(Boolean);
}

export function readDescriptions(doc) {
  const select = doc.querySelector('select[id$="fagDD"]');
  if (!select && !doc.querySelector('#contenttable')) throw new ReaderError('Undervisningsbeskrivelserne blev ikke fundet');
  const subjects = Array.from(select?.options || []).map(o => ({ id: o.value, name: text(o), selected: o.selected }));
  const descriptions = Array.from(doc.querySelectorAll('[id$="uvbcontainer"]')).map(box => {
    const tables = Array.from(box.querySelectorAll(':scope > table'));
    const info = rows(tables[0]);
    const phases = Array.from(box.querySelectorAll(':scope > div[id^="ph"]')).map(div => {
      const fields = rows(div.querySelector('table'));
      const titleCell = fields[0]?.node;
      const link = titleCell?.querySelector('a[href*="phaseid"]');
      const title = link ? text(link) : fields[0]?.text || '';
      // The first row is "Titel N" with the title link followed by the description.
      let description = null;
      if (titleCell) {
        const copy = titleCell.cloneNode(true);
        copy.querySelector('a[href*="phaseid"]')?.remove();
        while (copy.firstChild && (copy.firstChild.nodeName === 'BR' || (copy.firstChild.nodeType === 3 && !copy.firstChild.textContent.trim()))) copy.firstChild.remove();
        description = text(copy) ? copy : null;
      }
      return {
        id: div.id.replace(/^ph/, ''),
        number: fields[0]?.label.replace(/^Titel\s*/i, '') || '',
        title,
        href: link ? link.href : null,
        description,
        fields: fields.slice(1),
      };
    });
    const field = label => info.find(f => f.label.toLocaleLowerCase('da').startsWith(label))?.text || '';
    return {
      kind: text(box.querySelector('h2')) || 'Undervisningsbeskrivelse',
      term: field('termin'),
      institution: field('institution'),
      subject: field('fag og niveau'),
      teachers: field('lærer'),
      hold: field('hold'),
      // Each hold is a context card: "2024 Ld bi (<span data-lectiocontextcard="HE123">L1d bi</span>)".
      holds: Array.from(tables[0]?.querySelectorAll('[data-lectiocontextcard^="HE"]') || []).map(el => ({ id: el.getAttribute('data-lectiocontextcard').slice(2), label: text(el) })),
      info,
      phases,
    };
  }).filter(d => d.info.length || d.phases.length);
  return { subjects, descriptions, empty: descriptions.length ? '' : text(doc.querySelector('[id$="uvbcontainer"] .noRecordItalic, #printUVBarea .noRecord')) };
}
