import { describe, it, expect } from 'vitest';
import {
  setStudentPeriods,
  setStudentPlan,
  setStudentEnrolledFrom,
  setTermStart,
} from './mutations.js';
import { buildOnboardedDoc } from './onboarding.js';
import { makeDoc, deepFreeze, T } from './test-helpers.js';

describe('setStudentEnrolledFrom', () => {
  const enrolOf = (doc, id) => doc.students.find((s) => s.id === id).enrolledFrom;

  it('records when a student joined this class', () => {
    const doc = setStudentEnrolledFrom(deepFreeze(makeDoc()), T.jordan, '2026-10-05');
    expect(enrolOf(doc, T.jordan)).toBe('2026-10-05');
  });

  /** Blank is a real answer: they have been here since the start of the year. */
  it('clears back to no date', () => {
    const set = setStudentEnrolledFrom(makeDoc(), T.jordan, '2026-10-05');
    expect(enrolOf(setStudentEnrolledFrom(set, T.jordan, ''), T.jordan)).toBeNull();
  });

  /**
   * Nothing is deleted, in either direction. The date only changes what
   * `effectiveStatus` computes, so moving it back returns those days with
   * whatever they already held.
   */
  it('leaves every day record and every other student alone', () => {
    const base = makeDoc();
    const doc = setStudentEnrolledFrom(base, T.jordan, '2026-10-05');
    expect(doc.days).toBe(base.days);
    expect(doc.students.find((s) => s.id === T.priya)).toBe(
      base.students.find((s) => s.id === T.priya)
    );
  });
});

/**
 * The first day of class, which is what "start of the year" means.
 *
 * It was never asked for - setup stamped whatever day it ran on - so every
 * screen saying "start of the year" meant a date nobody had chosen.
 */
describe('setTermStart', () => {
  it('records the day the teacher named', () => {
    const doc = setTermStart(deepFreeze(makeDoc()), '2026-09-08');
    expect(doc.schoolCalendar.termStart).toBe('2026-09-08');
  });

  it('takes blank as an answer, so the record starts at its earliest day', () => {
    const doc = setTermStart(deepFreeze(makeDoc()), '');
    expect(doc.schoolCalendar.termStart).toBeNull();
  });

  it('leaves everything else alone, including the days already recorded', () => {
    const base = makeDoc();
    const doc = setTermStart(base, '2026-09-08');
    expect(doc.days).toBe(base.days);
    expect(doc.students).toBe(base.students);
  });
});

describe('setStudentPlan', () => {
  const planOf = (doc, id) => doc.students.find((s) => s.id === id).planType;

  it('corrects a plan type', () => {
    const doc = setStudentPlan(deepFreeze(makeDoc()), T.jordan, '504');
    expect(planOf(doc, T.jordan)).toBe('504');
  });

  /**
   * A plan the app has no word for is still a real plan.
   *
   * "IEP" and "504" are not the only true things a compliance header can say -
   * a behaviour plan, a health plan and a district's own scheme are all
   * records a teacher has to keep - so any wording is accepted and printed as
   * written.
   */
  it('takes a wording of the teacher’s own', () => {
    const doc = setStudentPlan(deepFreeze(makeDoc()), T.jordan, 'Behaviour plan');
    expect(planOf(doc, T.jordan)).toBe('Behaviour plan');
  });

  it('tidies the spacing rather than the words', () => {
    const doc = setStudentPlan(deepFreeze(makeDoc()), T.jordan, '  Health   plan  ');
    expect(planOf(doc, T.jordan)).toBe('Health plan');
  });

  /** Blank is the one refusal: a header with nothing in it says nothing. */
  it('refuses an empty plan type', () => {
    const base = makeDoc();
    for (const bad of ['', '   ', null, undefined]) {
      const doc = setStudentPlan(base, T.jordan, bad);
      expect(planOf(doc, T.jordan)).toBe(planOf(base, T.jordan));
      expect(doc).toBe(base);
    }
  });

  /** Undated: no entry snapshots a plan, so nothing recorded may move. */
  it('leaves every day record and every other student alone', () => {
    const base = makeDoc();
    const doc = setStudentPlan(base, T.jordan, 'Other');
    expect(doc.days).toBe(base.days);
    expect(doc.students.find((s) => s.id === T.priya)).toBe(
      base.students.find((s) => s.id === T.priya)
    );
  });
});

describe('setStudentPeriods', () => {
  it('sets which classes a student is in', () => {
    const doc = setStudentPeriods(deepFreeze(makeDoc()), T.jordan, [T.p1, T.p3]);
    expect(doc.students.find((s) => s.id === T.jordan).periodIds).toEqual([T.p1, T.p3]);
  });

  it('drops ids for periods that no longer exist', () => {
    const doc = setStudentPeriods(makeDoc(), T.jordan, [T.p1, 'per_deleted']);
    expect(doc.students.find((s) => s.id === T.jordan).periodIds).toEqual([T.p1]);
  });

  it('de-duplicates', () => {
    const doc = setStudentPeriods(makeDoc(), T.jordan, [T.p1, T.p1, T.p3]);
    expect(doc.students.find((s) => s.id === T.jordan).periodIds).toEqual([T.p1, T.p3]);
  });

  it('accepts none, which is a real answer', () => {
    const doc = setStudentPeriods(makeDoc(), T.jordan, []);
    expect(doc.students.find((s) => s.id === T.jordan).periodIds).toEqual([]);
  });

  /** A period is not a claim about a day, so no day record may move. */
  it('leaves every day record alone', () => {
    const base = makeDoc();
    const doc = setStudentPeriods(base, T.jordan, [T.p3]);
    expect(doc.days).toBe(base.days);
    expect(doc.students.find((s) => s.id === T.priya)).toBe(
      base.students.find((s) => s.id === T.priya)
    );
  });
});

describe('onboarding assigns students to the periods the teacher picked', () => {
  const answers = (students) => ({
    name: 'Em',
    periods: [1, 3],
    periodNames: {},
    students,
    termStart: '2026-09-01',
  });

  const periodsOf = (doc, displayName) => {
    const s = doc.students.find((x) => x.displayName === displayName);
    return s.periodIds.map((id) => doc.periods.find((p) => p.id === id).shortName).sort();
  };

  it('puts a student only in the periods chosen for them', () => {
    const doc = buildOnboardedDoc(
      answers([{ name: 'Ann Baker', plan: 'IEP', accoms: [], periods: [3] }]),
      new Date(2026, 8, 1)
    );
    expect(periodsOf(doc, 'Ann Baker')).toEqual(['P3']);
  });

  /**
   * Blank means all of them. A teacher typing names at speed has said "they are
   * in my class", and dropping them out of every period would hide them from a
   * filtered board entirely.
   */
  it('falls back to every period when none was chosen', () => {
    const doc = buildOnboardedDoc(
      answers([{ name: 'Wes Cole', plan: '504', accoms: [] }]),
      new Date(2026, 8, 1)
    );
    expect(periodsOf(doc, 'Wes Cole')).toEqual(['P1', 'P3']);
  });

  it('ignores a period number the teacher never created', () => {
    const doc = buildOnboardedDoc(
      answers([{ name: 'Ivy Dunn', plan: 'IEP', accoms: [], periods: [3, 7] }]),
      new Date(2026, 8, 1)
    );
    expect(periodsOf(doc, 'Ivy Dunn')).toEqual(['P3']);
  });
});
