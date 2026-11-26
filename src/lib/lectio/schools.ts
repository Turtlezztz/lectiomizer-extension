import { ORIGIN } from './client';
import type { School } from '../settings';

/** Public list of schools on login_list.aspx. */
export async function fetchSchools(): Promise<School[]> {
  const res = await fetch(`${ORIGIN}/lectio/login_list.aspx?showall=1`, { credentials: 'omit' });
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const seen = new Set<string>();
  return Array.from(doc.querySelectorAll('a[href]'))
    .map((a) => {
      const m = (a.getAttribute('href') || '').match(/\/lectio\/(\d+)\//);
      return m ? { id: m[1], name: (a.textContent || '').replace(/\s+/g, ' ').trim() } : null;
    })
    .filter((s): s is School => !!s && !!s.name && !seen.has(s.id) && !!seen.add(s.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'da'));
}
