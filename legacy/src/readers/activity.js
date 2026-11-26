// Reads aktivitetforside2.aspx (the "Indhold" tab). Teacher content stays as
// DOM nodes; the view renders them through RichText, which keeps only safe
// markup.
import { text } from '../page-data.js';
import { ReaderError, iconLabel, iconLink, readLesson } from './util.js';

const navLink = (root, icon) => {
  const link = iconLink(root, icon);
  return link ? { source: link, label: link.title || '' } : null;
};

function readSections(container) {
  const sections = [];
  let current = null;
  for (const child of Array.from(container.children)) {
    const heading = child.matches('.ls-paper-section-heading') ? child : child.querySelector('.ls-paper-section-heading');
    if (heading) { current = { title: text(heading), items: [] }; sections.push(current); continue; }
    const articles = Array.from(child.matches('article') ? [child] : child.querySelectorAll('article'));
    if (!articles.length) continue;
    if (!current) { current = { title: '', items: [] }; sections.push(current); }
    for (const article of articles) {
      const first = article.firstElementChild;
      current.items.push({ id: child.id || article.id || `item-${sections.length}-${current.items.length}`, title: first && /^H\d$/.test(first.tagName) ? text(first) : '', node: article });
    }
  }
  return sections;
}

export function readActivity(doc) {
  const content = doc.querySelector('[id$="tocAndToolbar_inlineHomeworkDiv"]');
  if (!content) throw new ReaderError('Aktivitetens indhold blev ikke fundet');
  const nav = doc.querySelector('#contenttable nav') || doc;
  const own = doc.querySelector('[id$="entityNavDiv"]');
  const hold = doc.querySelector('[id$="holdNavDiv"]');
  const holdLink = doc.querySelector('[id$="holdActLink"]');
  const note = doc.querySelector('[id$="ActNoteTB_tb"]');
  const sections = readSections(content);
  return {
    lesson: readLesson(doc.querySelector('[id$="tocAndToolbar_actHeader"] a.s2skemabrik')),
    back: navLink(nav, 'arrow_back'),
    previous: navLink(own, 'keyboard_arrow_left'),
    next: navLink(own, 'keyboard_arrow_right'),
    hold: holdLink ? { source: holdLink, label: text(holdLink), previous: navLink(hold, 'keyboard_arrow_left'), next: navLink(hold, 'keyboard_arrow_right') } : null,
    tabs: Array.from(doc.querySelectorAll('#PrintAktivititetArea .lectioTabToolbar a')).map(a => ({ label: text(a), current: a.hasAttribute('disabled'), source: a })),
    print: Array.from(doc.querySelector('[id$="BurgerMenu_innerBtn"]')?.closest('div.buttonicon')?.parentElement?.querySelectorAll('.lec-context-menu a') || []).map(a => ({ label: iconLabel(a), source: a })),
    phases: Array.from(doc.querySelectorAll('a[id*="phaseRepeater"]')).map(a => ({ label: text(a), href: a.href })),
    note: note && note.value.trim() ? note.value.trim() : '',
    sections,
    empty: sections.length ? '' : text(content) || 'Der er ikke noget indhold til denne lektion.',
    extras: Array.from(doc.querySelectorAll('.ls-toc-side-list > li')).slice(1).filter(li => !li.querySelector('a[href^="#"]')).map(li => {
      const link = li.querySelector('a[href]');
      return { label: text(li), href: link ? link.href : null };
    }).filter(e => e.label),
  };
}
