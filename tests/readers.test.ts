// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDocument, isLoginPage, postbackTarget } from '@/lib/lectio/client';
import { readHome } from '@/lib/lectio/readers/home.js';
import { readAssignments } from '@/lib/lectio/readers/assignments.js';
import { readAssignment } from '@/lib/lectio/readers/assignment.js';
import { readMessages } from '@/lib/lectio/readers/messages.js';
import { readGrades } from '@/lib/lectio/readers/grades.js';
import { readAbsence } from '@/lib/lectio/readers/absence.js';
import { readActivity } from '@/lib/lectio/readers/activity.js';
import { readSchedule } from '@/lib/lectio/readers/schedule.js';

const index: Record<string, string> = JSON.parse(readFileSync('fixtures/index.json', 'utf8'));
const load = (path: string) => {
  const key = Object.keys(index).find((k) => k.startsWith('/lectio/123/' + path.toLowerCase()))!;
  return parseDocument(readFileSync('fixtures/' + index[key], 'utf8'), 'https://www.lectio.dk' + key);
};

describe('readers on fetched (DOMParser) documents', () => {
  it('reads every page kind', () => {
    const cases: Array<[string, (d: Document) => any]> = [
      ['forside.aspx', readHome], ['opgaverelev.aspx', readAssignments], ['elevaflevering.aspx', readAssignment],
      ['beskeder2.aspx', readMessages], ['grades/grade_report.aspx', readGrades], ['subnav/fravaerelev_fravaersaarsager.aspx', readAbsence],
      ['aktivitet/aktivitetforside2.aspx', readActivity], ['skemany.aspx', readSchedule],
    ];
    for (const [path, read] of cases) {
      const doc = load(path);
      expect(isLoginPage(doc.URL, doc), path).toBe(false);
      expect(() => read(doc), path).not.toThrow();
    }
  });
  it('resolves links against Lectio', () => {
    const data = readAssignments(load('opgaverelev.aspx'));
    expect(data.assignments[0].href).toMatch(/^https:\/\/www\.lectio\.dk\/lectio\/123\//);
  });
  it('parses postback targets', () => {
    const doc = parseDocument(`<a href="javascript:__doPostBack('s$m$Content$x','DEL$1')">x</a>`, 'https://www.lectio.dk/lectio/1/a.aspx');
    expect(postbackTarget(doc.querySelector('a'))).toEqual({ target: 's$m$Content$x', argument: 'DEL$1' });
  });
});
