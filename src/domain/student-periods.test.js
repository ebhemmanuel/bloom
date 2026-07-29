import { describe, it, expect } from 'vitest';
import { setStudentPeriods, setStudentPlan } from './mutations.js';
import { buildOnboardedDoc } from './onboarding.js';
import { makeDoc, deepFreeze, T } from './test-helpers.js';

describe('setStudentPlan', () => {
  const planOf = (doc, id) => doc.students.find((s) => s.id === id).planType;

  it('corrects a plan type', () => {
    const doc = setStudentPlan(deepFreeze(makeDoc()), T.jordan, '504');
    expect(planOf(doc, T.jordan)).toBe('504');
  });

  /** It prints on a compliance header, so an unknown value is refused. */
  it('refuses a plan type that is not one of ours', () => {
    const base = makeDoc();
    const doc = setStudentPlan(base, T.jordan, 'IEEP');
    expect(planOf(doc, T.jordan)).toBe(planOf(base, T.jordan));
    expect(doc).toBe(base);
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
