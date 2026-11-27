// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseDocument, postbackTarget, serializeForm } from '@/lib/lectio/client';
import { appRoute } from '@/lib/lectio/paths';
import { isAnswerPage, readQuestionnaire, readQuestionnaires, splitHeading } from '@/lib/lectio/readers/questionnaire.js';
import { answerFields, answersOf, isScale, progress, sameAnswers, type QuestionnaireData, type QuestionnairesData } from '@/features/questionnaires/model';
import { questionnaireAnswerPage, questionnaireListPage } from '../scripts/questionnaire-fixture.mjs';

const ROOT = 'https://www.lectio.dk/lectio/123/spoergeskema/';
const list = (opts = {}) => readQuestionnaires(parseDocument(questionnaireListPage('/lectio/123/', opts), ROOT + 'spoergeskema_rapport.aspx')) as QuestionnairesData;
const answerDoc = (opts: Parameters<typeof questionnaireAnswerPage>[1] = {}) =>
  parseDocument(questionnaireAnswerPage('/lectio/123/', opts), `${ROOT}spoergeskema_besvar.aspx?id=${opts.id ?? 4001}&prevurl=spoergeskema%2fspoergeskema_rapport.aspx`);

describe('readQuestionnaires', () => {
  it('reads the open, report and own lists', () => {
    const data = list();
    expect(data.open).toHaveLength(2);
    expect(data.open[0]).toMatchObject({ id: '4001', title: 'Trivsel i 3a', owner: 'Lene Madsen (lm)', anonymous: true, deadlineText: '15/12-2026 23:59' });
    expect(data.open[0].deadline).toEqual(new Date(2026, 11, 15, 23, 59));
    expect(data.open[1].anonymous).toBe(false);
    expect(data.reports[0]).toMatchObject({ id: '3901', title: 'Motion i hverdagen', owner: 'Ida Kjær (1c 03)' });
    expect(data.reports[0].href).toMatch(/spoergeskemarapportering\.aspx\?id=3901/);
    expect(data.own[0]).toMatchObject({ id: '3801', title: 'Studietur', deadline: null });
    expect(data.own[0].editHref).toMatch(/spoergeskema_rediger\.aspx\?id=3801/);
    expect(data.createHref).toMatch(/skabeloner\.aspx/);
  });
  it('reads empty lists', () => {
    const data = list({ empty: true });
    expect(data.open).toEqual([]);
    expect(data.reports).toEqual([]);
  });
});

describe('readQuestionnaire', () => {
  it('reads sections and the three answer types', () => {
    const doc = answerDoc();
    expect(isAnswerPage(doc)).toBe(true);
    const data = readQuestionnaire(doc) as QuestionnaireData;
    expect(data).toMatchObject({ id: '4001', title: 'Trivsel i 3a', owner: 'Lene Madsen (lm)', anonymous: true });
    expect(data.questions.map((q) => `${q.number}:${q.kind}:${q.level}`)).toEqual(['1:info:1', '1.1:single:2', '1.2:multi:2', '1.3:text:2', '2:info:1', '2.1:single:2']);
    const [intro, scale, multi, text] = data.questions as any[];
    expect(intro.title).toBe('Om dig og klassen');
    expect(intro.text.innerHTML).toContain('<br>');
    expect(scale.options.map((o: any) => o.label)).toEqual(['1', '2', '3', '4', '5']);
    expect(scale.name).toBe('m$Content$questionnairegv$ctl02$choicerbl');
    expect(scale.value).toBeNull();
    expect(multi.options.map((o: any) => o.label)).toEqual(['Dansk', 'Matematik', 'Engelsk', 'Idræt']);
    expect(text.name).toBe('m$Content$questionnairegv$ctl04$answertext$tb');
    expect(postbackTarget(data.actions!.submit)).toEqual({ target: 'm$Content$answercompletebt', argument: '' });
    expect(postbackTarget(data.actions!.save)).toEqual({ target: 'm$Content$answerbt', argument: '' });
  });
  it('reads a saved draft', () => {
    const data = readQuestionnaire(answerDoc({ id: 4002, answers: { ctl02: 3, ctl03: [0, 3], ctl04: 'Mere frugt' } })) as QuestionnaireData;
    const answers = answersOf(data.questions);
    expect(answers.q1).toBe('400223');
    expect(answers.q2).toEqual([true, false, false, true]);
    expect(answers.q3).toBe('Mere frugt');
    expect(progress(data.questions, answers)).toEqual({ answered: 3, total: 4 });
  });
  it('has no actions when the questionnaire can no longer be answered', () => {
    expect((readQuestionnaire(answerDoc({ answerable: false })) as QuestionnaireData).actions).toBeNull();
  });
  it('splits numbered headings', () => {
    expect(splitHeading('1.10 Hvor ofte?')).toEqual({ number: '1.10', title: 'Hvor ofte?' });
    expect(splitHeading('Uden nummer')).toEqual({ number: '', title: 'Uden nummer' });
  });
});

describe('answer fields', () => {
  it('posts exactly what the browser would for the chosen answers', () => {
    const doc = answerDoc({ answers: { ctl03: [1] } });
    const data = readQuestionnaire(doc) as QuestionnaireData;
    const answers = { ...answersOf(data.questions), q1: '400124', q2: [true, false, false, false], q3: 'Hej\nmed dig' };
    const { fields, omit } = answerFields(data.questions, answers);
    expect(fields).toEqual([
      ['m$Content$questionnairegv$ctl02$choicerbl', '400124'],
      ['m$Content$questionnairegv$ctl03$multichoiceslv$ctrl0$multichoice', 'on'],
      ['m$Content$questionnairegv$ctl04$answertext$tb', 'Hej\nmed dig'],
    ]);
    // Matematik was ticked in the saved draft and is now unticked; 2.1 is unanswered.
    expect(omit).toContain('m$Content$questionnairegv$ctl03$multichoiceslv$ctrl1$multichoice');
    expect(omit).toContain('m$Content$questionnairegv$ctl05$choicerbl');
    // The saved page itself serialises the ticked box, which is why it must be omitted.
    const form = doc.querySelector('form') as HTMLFormElement;
    expect(serializeForm(form).map(([k]) => k)).toContain('m$Content$questionnairegv$ctl03$multichoiceslv$ctrl1$multichoice');
  });
  it('compares answers ignoring line endings and outer whitespace', () => {
    expect(sameAnswers({ a: 'x\r\ny ' }, { a: 'x\ny' })).toBe(true);
    expect(sameAnswers({ a: [true, false] }, { a: [true, true] })).toBe(false);
    expect(sameAnswers({ a: null }, { a: '1' })).toBe(false);
  });
  it('recognises numeric scales', () => {
    expect(isScale(['1', '2', '3', '10'].map((label) => ({ label })))).toBe(true);
    expect(isScale(['500 kr.', '1000 kr.'].map((label) => ({ label })))).toBe(false);
  });
});

describe('appRoute', () => {
  it('routes answer pages in-app but leaves templates on Lectio', () => {
    expect(appRoute(`${ROOT}spoergeskema_besvar.aspx?id=83961256690&prevurl=x`)).toBe('/questionnaires/83961256690');
    expect(appRoute(`${ROOT}spoergeskema_besvar.aspx?mode=display&id=1`)).toBeNull();
    expect(appRoute(`${ROOT}spoergeskema_rapport.aspx`)).toBe('/questionnaires');
    expect(appRoute(`${ROOT}spoergeskemarapportering.aspx?id=1`)).toBeNull();
  });
});
