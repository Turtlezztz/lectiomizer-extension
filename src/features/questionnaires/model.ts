// Types for the Spørgeskema readers and the pure answer logic (state ↔ Lectio form fields).

export interface OpenQuestionnaire {
  id: string | null;
  href: string | null;
  title: string;
  owner: string;
  /** The owner's context-card id when the page links one (T… teacher, S… student), else "". */
  ownerId?: string;
  anonymous: boolean;
  deadline: Date | null;
  deadlineText: string;
}

// ------------------------------------------------------------ overview: hide & filter

/**
 * Who made a questionnaire, from what Lectio shows in "Ejer": a context card
 * when there is one, else the suffix Lectio puts on names everywhere –
 * a class and number for students ("Emma Larsen (2b 04)"), initials for
 * teachers ("Lene Madsen (lm)"). Null when the text says neither.
 */
export function ownerKind(q: Pick<OpenQuestionnaire, 'owner' | 'ownerId'>): 'teacher' | 'student' | null {
  if (/^S\d+$/.test(q.ownerId || '')) return 'student';
  if (/^T\d+$/.test(q.ownerId || '')) return 'teacher';
  const code = [...(q.owner || '').matchAll(/\(([^()]+)\)/g)].map((m) => m[1].trim()).filter((c) => c !== 'k').pop();
  if (!code) return null;
  if (/^\S+\s+\d{1,3}$/.test(code)) return 'student';
  if (/^[a-zæøå]{1,6}$/i.test(code)) return 'teacher';
  return null;
}

/** A stable key for hiding: Lectio's id, else title and owner. */
export const hideKey = (q: Pick<OpenQuestionnaire, 'id' | 'title' | 'owner'>) => q.id || `${q.title}|${q.owner}`;

export const HIDDEN_QUESTIONNAIRES = 'questionnaires-hidden';
export interface QuestionnairePrefs {
  hidden: string[];
  teachersOnly: boolean;
}
export const PREFS_DEFAULT: QuestionnairePrefs = { hidden: [], teachersOnly: false };

/**
 * Split the open questionnaires into what is shown, what the student hid and
 * what "Kun fra lærere" filters out (student-made ones; unknown owners stay).
 * `canFilter` is false unless the owners can be told apart (both kinds present).
 */
export function sortOpen<T extends Pick<OpenQuestionnaire, 'id' | 'title' | 'owner' | 'ownerId'>>(open: T[], prefs: QuestionnairePrefs) {
  const hidden = new Set(prefs.hidden || []);
  const kinds = open.map((q) => ownerKind(q));
  const canFilter = kinds.includes('student') && kinds.includes('teacher');
  const shown: T[] = [];
  const hiddenItems: T[] = [];
  let filtered = 0;
  open.forEach((q, i) => {
    if (hidden.has(hideKey(q))) hiddenItems.push(q);
    else if (canFilter && prefs.teachersOnly && kinds[i] === 'student') filtered++;
    else shown.push(q);
  });
  return { shown, hidden: hiddenItems, filtered, canFilter };
}

/** Hide or show one questionnaire; keys of questionnaires that are gone are dropped. */
export function toggleHidden(prefs: QuestionnairePrefs, key: string, present?: string[]): QuestionnairePrefs {
  const list = prefs.hidden || [];
  let hidden = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
  if (present) hidden = hidden.filter((k) => present.includes(k));
  return { ...prefs, hidden };
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
