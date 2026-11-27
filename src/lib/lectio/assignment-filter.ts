// Opgaver's "Vis kun aktuelle" filter hides every assignment of an earlier
// school year, so the app offers to turn it off there. Lectio remembers the
// filter across years, though: back in this year the list would keep showing
// old assignments (on lectio.dk too, and in the background check). So when the
// app turned it off, it turns it on again on the way back.
import { getPage, postback, postbackTarget } from './client';
import { PATHS, pageUrl } from './paths';

const KEY = 'lx:assignments-current-filter-off';
const FILTER = 'input[type=checkbox][id$="CurrentExerciseFilterCB"]';

function flag(value?: boolean): boolean {
  try {
    if (value === true) localStorage.setItem(KEY, '1');
    else if (value === false) localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** The app turned "Vis kun aktuelle" off to show an earlier year's assignments. */
export const markCurrentFilterOff = () => flag(true);

/** Turn "Vis kun aktuelle" on again if the app turned it off. */
export async function restoreCurrentFilter(schoolId: string): Promise<void> {
  if (!flag()) return;
  const doc = await getPage(pageUrl(schoolId, PATHS.assignments));
  const box = doc.querySelector<HTMLInputElement>(FILTER);
  const name = box?.getAttribute('name');
  if (box && name && !box.hasAttribute('checked')) {
    await postback(doc, { target: postbackTarget(box)?.target || name, argument: '', fields: { [name]: 'on' } });
  }
  flag(false);
}
