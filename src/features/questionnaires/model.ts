// Types for the Spørgeskema readers and the pure answer logic (state ↔ Lectio form fields).

export interface OpenQuestionnaire {
  id: string | null;
  href: string | null;
  title: string;
  owner: string;
  anonymous: boolean;
  deadline: Date | null;
  deadlineText: string;
}

export interface ReportQuestionnaire {
  id: string | null;
  href: string | null;
  title: string;
  owner: string;
  deadline: Date | null;
  releases: Date | null;
  expires: Date | null;
}

export interface OwnQuestionnaire {
  id: string | null;
  href: string | null;
  editHref: string | null;
  title: string;
  deadline: Date | null;
  releases: Date | null;
  expires: Date | null;
}

export interface QuestionnairesData {
  open: OpenQuestionnaire[];
  reports: ReportQuestionnaire[];
  own: OwnQuestionnaire[];
  createHref: string | null;
}

interface QuestionBase {
  key: string;
  number: string;
  title: string;
  /** 1 = Overskrift (section), 2 = question */
  level: 1 | 2;
  /** Lectio's question text (rich HTML) */
  text: Element | null;
}

export type Question =
  | (QuestionBase & { kind: 'info' | 'unsupported' })
  | (QuestionBase & { kind: 'text'; name: string; value: string })
  | (QuestionBase & { kind: 'single'; name: string; options: Array<{ value: string; label: string }>; value: string | null })
  | (QuestionBase & { kind: 'multi'; options: Array<{ name: string; label: string; checked: boolean }> });

export interface QuestionnaireData {
  id: string | null;
  title: string;
  owner: string;
  anonymous: boolean;
  questions: Question[];
  actions: { submit: Element | null; save: Element | null } | null;
}

/** text: string, single: chosen value or null, multi: one boolean per option */
export type Answer = string | null | boolean[];
export type Answers = Record<string, Answer>;

export const isAnswerable = (q: Question) => q.kind === 'text' || q.kind === 'single' || q.kind === 'multi';

export function answersOf(questions: Question[]): Answers {
  const out: Answers = {};
  for (const q of questions) {
    if (q.kind === 'text') out[q.key] = q.value;
    else if (q.kind === 'single') out[q.key] = q.value;
    else if (q.kind === 'multi') out[q.key] = q.options.map((o) => o.checked);
  }
  return out;
}

// Lectio stores textarea values with CRLF and may trim them.
const normText = (value: string) => value.replace(/\r\n?/g, '\n').trim();

function same(a: Answer | undefined, b: Answer | undefined): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
  if (typeof a === 'string' && typeof b === 'string') return normText(a) === normText(b);
  return (a ?? null) === (b ?? null);
}

export function sameAnswers(a: Answers, b: Answers): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => same(a[k], b[k]));
}

export function isAnswered(q: Question, answer: Answer | undefined): boolean {
  if (q.kind === 'text') return typeof answer === 'string' && answer.trim() !== '';
  if (q.kind === 'single') return typeof answer === 'string';
  if (q.kind === 'multi') return Array.isArray(answer) && answer.some(Boolean);
  return false;
}

export function progress(questions: Question[], answers: Answers) {
  const answerable = questions.filter(isAnswerable);
  return { answered: answerable.filter((q) => isAnswered(q, answers[q.key])).length, total: answerable.length };
}

/**
 * The form fields that make Lectio's page carry `answers`: values to set, and
 * names to leave out (unticked checkboxes that the loaded page has ticked).
 */
export function answerFields(questions: Question[], answers: Answers): { fields: Array<[string, string]>; omit: string[] } {
  const fields: Array<[string, string]> = [];
  const omit: string[] = [];
  for (const q of questions) {
    const answer = answers[q.key];
    if (q.kind === 'text') fields.push([q.name, typeof answer === 'string' ? answer : '']);
    else if (q.kind === 'single') {
      if (typeof answer === 'string') fields.push([q.name, answer]);
      else omit.push(q.name);
    } else if (q.kind === 'multi') {
      q.options.forEach((o, i) => (Array.isArray(answer) && answer[i] ? fields.push([o.name, 'on']) : omit.push(o.name)));
    }
  }
  return { fields, omit };
}

/** A "1 - 10" style scale: short numeric labels, shown as a row of buttons. */
export function isScale(options: Array<{ label: string }>): boolean {
  return options.length >= 2 && options.length <= 11 && options.every((o) => /^-?\d{1,3}$/.test(o.label.trim()));
}
