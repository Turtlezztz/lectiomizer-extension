import { readHome } from '../lectio/readers/home.js';
import { readAssignments } from '../lectio/readers/assignments.js';
import { readGrades } from '../lectio/readers/grades.js';
import { readAbsence } from '../lectio/readers/absence.js';
import { readMe } from '../lectio/readers/thread.js';

export const GRADES_PATH = 'grades/grade_report.aspx';
export const ABSENCE_PATH = 'subnav/fravaerelev_fravaersaarsager.aspx';

export function assertAccount(doc, context) {
  const ids = readMe(doc).ids;
  if (ids.length && !ids.includes(context.accountId)) throw new Error('Lectio-kontoen er ændret');
}

function itemId(href, parameter) {
  try { return new URL(href).searchParams.get(parameter); } catch { return null; }
}

/** One item per grade cell; the value is the revision, so a changed grade notifies too. */
export function gradeItems(grades, href) {
  return grades.current.subjects.flatMap(({ subject, hold, forms }) => forms.flatMap(({ form, grades: list }) => list.map(grade => ({
    id: [subject, hold, form, grade.type].join('|'),
    revision: grade.value,
    title: [subject, form].filter(Boolean).join(', '),
    value: grade.value,
    type: grade.type,
    href,
  }))));
}

/** Registered absence: lessons missing a cause plus the registration history, one item per lesson. */
export function absenceItems(absence, href) {
  const items = new Map();
  for (const row of [...(absence.missing?.rows || []), ...(absence.history?.rows || [])]) {
    const id = itemId(row.lesson?.href, 'absid') || itemId(row.edit, 'id') || `${row.week}|${row.lessonText}`;
    if (items.has(id)) continue;
    const lesson = row.lesson;
    const title = lesson ? [lesson.holds?.join(', '), [lesson.date, lesson.module].filter(Boolean).join(' ')].filter(Boolean).join(' · ') : row.lessonText;
    items.set(id, { id, title: title || 'Modul', href, description: [row.amount, row.remark].filter(Boolean).join(' · ') });
  }
  return [...items.values()];
}

/**
 * Messages and assignments are always read; grades and absence only when asked
 * (their notice type is on), so a check costs no more pages than it needs.
 * A feed that fails to read is null; one that wasn't asked for is undefined.
 */
export async function readFeeds(context, load, { grades = false, absence = false } = {}) {
  const root = new URL('./', context.scheduleHref);
  const read = async (path, parse) => {
    try {
      const doc = await load(new URL(path, root).href);
      assertAccount(doc, context);
      return parse(doc);
    } catch { return null; }
  };
  const [lectioMessages, assignments, gradeFeed, absenceFeed] = await Promise.all([
    read('forside.aspx', doc => {
      const block = readHome(doc).messages;
      if (!block) throw new Error('Beskeder blev ikke fundet');
      return block.rows.map(row => {
        const id = itemId(row.href, 'id');
        if (!id) throw new Error('Beskedens id blev ikke fundet');
        return { id, title: row.text, href: row.href, sender: row.sender, revision: row.due?.toISOString() || row.dueText, description: row.sender };
      });
    }),
    read('OpgaverElev.aspx', doc => readAssignments(doc).assignments.map(item => {
      const id = itemId(item.href, 'exerciseid');
      if (!id) throw new Error('Afleveringens id blev ikke fundet');
      const delivered = item.statusKind === 'delivered';
      return { id, title: item.title, href: item.href, deadline: item.deadline?.toISOString() || '', delivered, notify: !delivered && (!item.deadline || item.deadline.getTime() >= Date.now()), description: [item.hold, item.deadlineText && `Frist: ${item.deadlineText}`].filter(Boolean).join(' · ') };
    })),
    grades ? read(GRADES_PATH, doc => gradeItems(readGrades(doc), new URL(GRADES_PATH, root).href)) : undefined,
    absence ? read(ABSENCE_PATH, doc => absenceItems(readAbsence(doc), new URL(ABSENCE_PATH, root).href)) : undefined,
  ]);
  return { lectioMessages, assignments, grades: gradeFeed, absence: absenceFeed };
}
