// Reads everything a background check needs from Lectio: who is signed in,
// the coming schedule weeks, and the message/assignment feeds. Needs a DOM
// (DOMParser), so on Chrome it runs in the offscreen document and on Firefox
// directly in the background page. Returns plain, serialisable data.
import { ORIGIN, getPage } from '../lectio/client';
import { readMe } from '../lectio/readers/thread.js';
import { readSchedule, weekUrl, weeksFrom } from '../lectio/readers/schedule.js';
import { assertAccount, readFeeds } from './feeds.js';
import { PastTermError, isPastTerm, readTerm, schoolYearOf } from '../lectio/term';
import type { FeedItem, Lesson } from './store';

export interface Context {
  scheduleHref: string;
  accountId: string;
}
export interface Week {
  dates: string[];
  lessons?: Lesson[];
  error?: string;
}
export interface LectioRead {
  context: Context;
  weeks: Week[];
  feeds: { lectioMessages: FeedItem[] | null; assignments: FeedItem[] | null };
}

/** The signed-in student's own schedule address and stable id (S… or U…). */
export function accountContext(doc: Document, schoolId: string): Context | null {
  const ids: string[] = readMe(doc).ids;
  const student = doc.querySelector('meta[name="msapplication-starturl"]')?.getAttribute('content')?.match(/elevid=(\d+)/)?.[1];
  const accountId = student ? `S${student}` : ids.find((id) => /^U\d+$/.test(id));
  if (!accountId) return null;
  const url = new URL(`${ORIGIN}/lectio/${schoolId}/SkemaNy.aspx`);
  if (accountId.startsWith('S')) {
    url.searchParams.set('type', 'elev');
    url.searchParams.set('elevid', accountId.slice(1));
  }
  return { scheduleHref: url.href, accountId };
}

async function readWeek(week: { dates: string[]; week: number; year: number }, context: Context): Promise<Week> {
  try {
    const doc = await getPage(weekUrl(context.scheduleHref, week));
    assertAccount(doc, context);
    const lessons: Lesson[] = readSchedule(doc);
    const inWeek = lessons.filter((lesson) => week.dates.includes(lesson.start.slice(0, 10)));
    // Lectio falls back to another week on a bad ?week=; don't treat that as this one.
    if (lessons.length && !inWeek.length) throw new Error('Lectio viste en anden uge');
    return { dates: week.dates, lessons: inWeek };
  } catch (error) {
    return { dates: week.dates, error: (error as Error).message };
  }
}

/**
 * Lectio keeps the chosen school year in the session, so after the student
 * picks last year (in the app or on lectio.dk) every page shows that year:
 * the coming weeks come back empty and Opgaver lists last year's. Comparing
 * that with the snapshot would report every lesson as removed, so don't check.
 * Forside only shows the chosen year; the schedule's menu also lists the years
 * Lectio offers, which tells whether a newer one exists.
 */
async function assertCurrentTerm(home: Document, context: Context, now: Date) {
  const term = readTerm(home);
  if (!term || term.year >= schoolYearOf(now)) return;
  const schedule = readTerm(await getPage(context.scheduleHref));
  if (schedule && isPastTerm(schedule, now)) throw new PastTermError(schedule.year);
}

/** Throws NotLoggedInError when the Lectio session has expired, PastTermError when it shows an earlier school year. */
export async function readLectio({ schoolId, weekCount, now = Date.now() }: { schoolId: string; weekCount: number; now?: number }): Promise<LectioRead> {
  const home = await getPage(`${ORIGIN}/lectio/${schoolId}/forside.aspx`);
  const context = accountContext(home, schoolId);
  if (!context) throw new Error('Kunne ikke se, hvem der er logget ind på Lectio');
  await assertCurrentTerm(home, context, new Date(now));
  const [weeks, feeds] = await Promise.all([
    Promise.all(weeksFrom(new Date(now), weekCount).map((week: any) => readWeek(week, context))),
    // Reuse the Forside we already fetched.
    readFeeds(context, (url: string) => (/\/forside\.aspx$/i.test(new URL(url).pathname) ? Promise.resolve(home) : getPage(url))),
  ]);
  return { context, weeks, feeds };
}
