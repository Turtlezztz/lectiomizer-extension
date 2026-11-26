// Reads the "Elevfeedback" tab of an activity
// (aktivitetforside2.aspx?absid=…&lectab=elevindhold).
//
// Every student (and the teacher) owns one "paper" in a shared Lectio document.
// Papers are rendered as <article> fragments. Lectio remembers per session
// whether the page is in edit or read mode: in edit mode the signed-in
// student's own paper is a CKEditor <textarea> holding HTML; in read mode it is
// an article like everyone else's, and a "Rediger" button (editModeBtn) posts
// back to switch to edit mode. A module where elevfeedback isn't open renders
// the tab with an empty container and no Rediger button.
import { text } from '../page-data.js';
import { ReaderError, readLesson } from './util.js';

const contextId = el => el?.querySelector('[data-lectiocontextcard]')?.getAttribute('data-lectiocontextcard') || '';

function readEditor(paper) {
  const textarea = paper.querySelector('textarea[lectio-role="editor-textarea"], textarea[name$="$editor$ed"]');
  if (!textarea) return null;
  const name = textarea.getAttribute('name') || '';
  const prefix = name.replace(/\$ed$/, '');
  const dirty = paper.querySelector(`input[name="${prefix}$isDirty"]`);
  return {
    textarea,
    html: textarea.value ?? textarea.textContent ?? '',
    // CKEditor's "lectiosave" command posts back with the editor control as event target.
    target: prefix,
    dirtyName: dirty?.getAttribute('name') || `${prefix}$isDirty`,
    hasBackup: !!paper.querySelector('[id*="backupContentDiv"].ls-alertbox'),
  };
}

function readPaper(me, paper, index) {
  const heading = paper.querySelector('.ls-section-subgroup-heading');
  const who = contextId(heading);
  const name = text(heading) || (who.startsWith('T') ? 'Lærer' : 'Ukendt');
  const editor = readEditor(paper);
  const items = Array.from(paper.querySelectorAll('[data-role="homeworkitemdetails"]'))
    .map(container => ({ id: container.id, node: container.querySelector('article') }))
    .filter(item => item.node && text(item.node));
  return {
    id: paper.id || `paper-${index}`,
    name,
    contextId: who,
    teacher: who.startsWith('T') || /^lærer/i.test(name),
    own: !!editor || (!!me && who === me),
    editor,
    items,
  };
}

// Table of contents: everyone who could write, including people who haven't.
function readRoster(doc) {
  const toc = doc.querySelector('[id$="Elevindhold_tocAndToolbar_tocDiv"]');
  if (!toc) return [];
  return Array.from(toc.querySelectorAll('.ls-std-rowblock-top')).map(row => {
    const list = row.nextElementSibling;
    const entries = list ? Array.from(list.querySelectorAll('.ls-homework-toc a[href^="#"]')).map(a => ({ title: text(a), anchor: a.getAttribute('href').slice(1) })) : [];
    return { name: text(row.querySelector('h3')), contextId: contextId(row), entries };
  }).filter(r => r.name);
}

export function readFeedback(doc) {
  const container = doc.querySelector('[id$="Elevindhold_tocAndToolbar_inlineHomeworkDiv"]');
  const tabs = Array.from(doc.querySelectorAll('#PrintAktivititetArea .lectioTabToolbar a'));
  const onTab = tabs.some(a => a.hasAttribute('disabled') && /elevfeedback/i.test(text(a)));
  if (!container && !onTab) throw new ReaderError('Elevfeedback blev ikke fundet på siden');
  // The signed-in student, from the page header ("Eleven …, 3a - Aktivitetsforside").
  const me = doc.querySelector('#s_m_HeaderContent_MainTitle[data-lectiocontextcard], .maintitle[data-lectiocontextcard]')?.getAttribute('data-lectiocontextcard') || '';
  const papers = container ? Array.from(container.querySelectorAll(':scope > .ls-paper')).map((p, i) => readPaper(me, p, i)) : [];
  const own = papers.find(p => p.editor) || papers.find(p => p.own) || null;
  const editButton = doc.querySelector('[id$="Elevindhold_tocAndToolbar_editModeBtn"]');
  const info = doc.querySelector('#ElevContentContainer .nb_type_information');
  const contentTab = tabs.find(a => /indhold/i.test(text(a)));
  return {
    lesson: readLesson(doc.querySelector('#ElevContentContainer .ls-paper-header a.s2skemabrik')),
    contentHref: contentTab && !contentTab.hasAttribute('disabled') ? contentTab.href : null,
    open: papers.length > 0 || !!editButton,
    // Writable: the editor is showing, or Lectio offers to switch to it.
    canWrite: !!own?.editor || !!editButton,
    editing: !!own?.editor,
    editButton,
    me,
    own,
    teacher: papers.filter(p => p.teacher),
    others: papers.filter(p => !p.teacher && !p.own),
    roster: readRoster(doc),
    hint: info ? text(info) : '',
  };
}
