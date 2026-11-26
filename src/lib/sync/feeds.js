import { readHome } from '../lectio/readers/home.js';
import { readAssignments } from '../lectio/readers/assignments.js';
import { readMe } from '../lectio/readers/thread.js';

export function assertAccount(doc, context) {
  const ids = readMe(doc).ids;
  if (ids.length && !ids.includes(context.accountId)) throw new Error('Lectio-kontoen er ændret');
}

function itemId(href, parameter) {
  try { return new URL(href).searchParams.get(parameter); } catch { return null; }
}

export async function readFeeds(context, load) {
  const root = new URL('./', context.scheduleHref);
  const read = async (path, parse) => {
    try {
      const doc = await load(new URL(path, root).href);
      assertAccount(doc, context);
      return parse(doc);
    } catch { return null; }
  };
  const [lectioMessages, assignments] = await Promise.all([
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
      return { id, title: item.title, href: item.href, deadline: item.deadline?.toISOString() || '', notify: item.statusKind !== 'delivered' && (!item.deadline || item.deadline.getTime() >= Date.now()), description: [item.hold, item.deadlineText && `Frist: ${item.deadlineText}`].filter(Boolean).join(' · ') };
    })),
  ]);
  return { lectioMessages, assignments };
}
