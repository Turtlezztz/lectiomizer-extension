import { readMe } from '../readers/thread.js';

// Always observe the signed-in person's schedule, even on another student's
// page. The header's user and start URL supply the stable account identity.
export function scheduleContext(model, doc = document) {
  if (!model.authenticated || !model.base) return null;
  const ids = readMe(doc).ids;
  const student = doc.querySelector('meta[name="msapplication-starturl"]')?.getAttribute('content')?.match(/elevid=(\d+)/)?.[1];
  const accountId = student ? `S${student}` : ids.find(id => /^U\d+$/.test(id));
  if (!accountId) return null;
  const url = new URL(`${model.base}SkemaNy.aspx`, model.url);
  if (accountId.startsWith('S')) { url.searchParams.set('type', 'elev'); url.searchParams.set('elevid', accountId.slice(1)); }
  return { scheduleHref: url.href, accountId };
}
