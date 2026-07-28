import { describe, it, expect } from 'vitest';
import { STATUS, DERIVED_STATUS } from './constants.js';
import { effectiveStatus, sealDay } from './resolve.js';
import {
  backfillDays,
  backfillRange,
  ensureDay,
  activeStudentsFor,
  findPreviousWorkedDay,
  copyFromPreviousDay,
  copyStudentFromPreviousDay,
  dayHasWork,
  dayHasCopyableState,
} from './seed.js';
import { SEED_MODE } from './constants.js';
import { setEntryStatus, setAssignmentDefault } from './mutations.js';
import { buildBoardModel } from './selectors.js';
import { makeDoc, deepFreeze, T } from './test-helpers.js';

// 2026-09-14 is a Monday; 2026-09-19/20 are the weekend.
const TERM_START = '2026-09-07';
const MON = '2026-09-14';
const SAT = '2026-09-19';
const TODAY = '2026-09-16';
const now = new Date(2026, 8, 16, 17, 30); // Wed, after cycle end

function docWithTerm() {
  const doc = makeDoc();
  doc.schoolCalendar = { ...doc.schoolCalendar, termStart: TERM_START };
  return doc;
}

describe('backfilling the year', () => {
  it('lays out every school day from the term start to today', () => {
    const { doc, created } = backfillDays(deepFreeze(docWithTerm()), {
      from: TERM_START,
      to: TODAY,
      now,
    });
    // Mon 7th – Wed 16th, weekends excluded: 7,8,9,10,11,14,15,16 = 8 days.
    expect(created).toBe(8);
    expect(doc.days[MON]).toBeTruthy();
    expect(doc.days[MON].backfilled).toBe(true);
  });

  it('skips weekends and non-instructional dates', () => {
    let base = docWithTerm();
    base.schoolCalendar.nonInstructionalDates = ['2026-09-08'];
    const { doc } = backfillDays(base, { from: TERM_START, to: TODAY, now });
    expect(doc.days[SAT]).toBeUndefined();
    expect(doc.days['2026-09-08']).toBeUndefined();
  });

  it('never touches a day that already exists', () => {
    let doc = ensureDay(docWithTerm(), MON, now);
    doc = setEntryStatus(doc, MON, T.jordan, T.asgJordanExtTime, STATUS.USED, { now });
    const filled = backfillDays(doc, { from: TERM_START, to: TODAY, now }).doc;
    expect(filled.days[MON].students[T.jordan].entries[T.asgJordanExtTime].status).toBe(
      STATUS.USED
    );
    expect(filled.days[MON].backfilled).toBe(false);
  });

  /**
   * The whole reason the `backfilled` flag exists. Creating 60 days of structure
   * must not simultaneously assert that 60 days of support went undelivered by a
   * teacher who installed the app this morning.
   */
  it('does not turn a laid-out day into documented non-delivery', () => {
    const { doc } = backfillDays(docWithTerm(), { from: TERM_START, to: TODAY, now });
    expect(effectiveStatus(doc, MON, T.jordan, T.asgJordanExtTime, now)).toBe(
      DERIVED_STATUS.NO_RECORD
    );
    expect(effectiveStatus(doc, MON, T.jordan, T.asgJordanExtTime, now)).not.toBe(STATUS.NOT_USED);
  });

  it('sealing a backfilled day stamps nothing', () => {
    const { doc } = backfillDays(docWithTerm(), { from: TERM_START, to: TODAY, now });
    const sealed = sealDay(doc, MON, now);
    expect(sealed.days[MON].students[T.jordan].entries[T.asgJordanExtTime].status).toBe(
      STATUS.UNASSIGNED
    );
  });

  /**
   * Once a teacher has actually worked a day, it is a real day. Anything still
   * blank on it resolves normally - that is a genuine "I was here and this did
   * not happen", which is exactly what not_used is for.
   */
  it('stops being backfilled the moment the teacher records anything', () => {
    let { doc } = backfillDays(docWithTerm(), { from: TERM_START, to: TODAY, now });
    doc = setEntryStatus(doc, MON, T.jordan, T.asgJordanExtTime, STATUS.USED, { now });

    expect(doc.days[MON].backfilled).toBe(false);
    expect(effectiveStatus(doc, MON, T.jordan, T.asgJordanReadAloud, now)).toBe(STATUS.NOT_USED);
  });

  it('is idempotent', () => {
    const first = backfillDays(docWithTerm(), { from: TERM_START, to: TODAY, now });
    const second = backfillDays(first.doc, { from: TERM_START, to: TODAY, now });
    expect(second.created).toBe(0);
    expect(second.doc).toBe(first.doc);
  });

  it('has no range to fill without a recorded term start', () => {
    expect(backfillRange(makeDoc(), now)).toBeNull();
  });

  /**
   * "Copy yesterday" means the last day you worked, not the last day that
   * exists. Once the year is laid out, yesterday almost always has a record and
   * it is almost always empty, so copying from it brought across nothing.
   */
  it('copies from the last day with work, skipping empty laid-out days', () => {
    let { doc } = backfillDays(docWithTerm(), { from: TERM_START, to: TODAY, now });
    // Work on the 8th; the 9th, 10th, 14th and 15th stay empty behind it.
    doc = setEntryStatus(doc, '2026-09-08', T.jordan, T.asgJordanExtTime, STATUS.USED, { now });

    expect(findPreviousWorkedDay(doc, TODAY)).toBe('2026-09-08');

    const result = copyFromPreviousDay(doc, TODAY, { mode: SEED_MODE.FULL, now });
    expect(result.applied).toBe(true);
    expect(result.sourceDate).toBe('2026-09-08');
    expect(result.copied).toBe(1);
    expect(result.doc.days[TODAY].students[T.jordan].entries[T.asgJordanExtTime].status).toBe(
      STATUS.USED
    );
  });

  /** The reported case: record on day A, stand on day B, copy it across. */
  it('carries a full day across to the next one', () => {
    const A = '2026-09-15';
    const B = TODAY; // the 16th
    let doc = ensureDay(docWithTerm(), A, now);
    doc = setEntryStatus(doc, A, T.jordan, T.asgJordanExtTime, STATUS.USED, { now });
    doc = setEntryStatus(doc, A, T.jordan, T.asgJordanReadAloud, STATUS.USED_WITH_DETAIL, {
      detail: 'Aide read section 3.',
      now,
    });
    doc = ensureDay(doc, B, now);

    const result = copyFromPreviousDay(doc, B, { mode: SEED_MODE.FULL, now });

    expect(result.applied).toBe(true);
    expect(result.sourceDate).toBe(A);
    expect(result.copied).toBe(2);

    const landed = result.doc.days[B].students[T.jordan].entries;
    expect(landed[T.asgJordanExtTime].status).toBe(STATUS.USED);
    expect(landed[T.asgJordanReadAloud].status).toBe(STATUS.USED_WITH_DETAIL);
    expect(landed[T.asgJordanReadAloud].detail).toBe('Aide read section 3.');
  });

  it('copies one student without touching the others', () => {
    const A = '2026-09-15';
    const B = TODAY;
    let doc = ensureDay(docWithTerm(), A, now);
    doc = setEntryStatus(doc, A, T.jordan, T.asgJordanExtTime, STATUS.USED, { now });
    doc = setEntryStatus(doc, A, T.priya, T.asgPriyaExtTime, STATUS.USED, { now });
    doc = ensureDay(doc, B, now);

    const result = copyStudentFromPreviousDay(doc, B, T.jordan, { now });

    expect(result.applied).toBe(true);
    expect(result.copied).toBe(1);
    expect(result.doc.days[B].students[T.jordan].entries[T.asgJordanExtTime].status).toBe(
      STATUS.USED
    );
    // Priya worked that day too, and must be left exactly as she was.
    expect(result.doc.days[B].students[T.priya].entries[T.asgPriyaExtTime].status).toBe(
      STATUS.UNASSIGNED
    );
  });

  it('reports no source when nothing has ever been worked', () => {
    const { doc } = backfillDays(docWithTerm(), { from: TERM_START, to: TODAY, now });
    expect(findPreviousWorkedDay(doc, TODAY)).toBeNull();
    expect(copyFromPreviousDay(doc, TODAY, { now }).reason).toBe('no-source');
  });

  /**
   * The reported bug, and the reason it took three goes to find.
   *
   * A day whose statuses all came from standing defaults is not "worked on" -
   * the teacher has not looked at it - but it is absolutely full of things to
   * copy. Source-finding used the overwrite guard's predicate, so on a board
   * where every accommodation had a default, "Copy yesterday" answered "no
   * earlier day with anything recorded" while showing a screen full of records.
   */
  it('copies from a day whose statuses came from standing defaults', () => {
    let doc = setAssignmentDefault(docWithTerm(), T.asgJordanExtTime, STATUS.USED, { now });
    doc = backfillDays(doc, { from: TERM_START, to: TODAY, now }).doc;

    const A = '2026-09-15';
    expect(doc.days[A].students[T.jordan].entries[T.asgJordanExtTime].resolvedBy).toBe('default');
    // Nobody has touched it, so it is not work...
    expect(dayHasWork(doc, A)).toBe(false);
    // ...but there is plainly something on it to bring forward.
    expect(dayHasCopyableState(doc, A)).toBe(true);

    const result = copyFromPreviousDay(doc, TODAY, { mode: SEED_MODE.FULL, now });
    expect(result.applied).toBe(true);
    expect(result.sourceDate).toBe(A);
    expect(result.doc.days[TODAY].students[T.jordan].entries[T.asgJordanExtTime].resolvedBy).toBe(
      'user'
    );
  });

  /**
   * A copy is the teacher working on the day, so the day stops being bulk
   * structure. Left backfilled, the entries the copy did not fill went on
   * resolving as no_record beside ones reading as delivered.
   */
  it('clears the backfilled flag on the day it copies onto', () => {
    let { doc } = backfillDays(docWithTerm(), { from: TERM_START, to: TODAY, now });
    doc = setEntryStatus(doc, '2026-09-15', T.jordan, T.asgJordanExtTime, STATUS.USED, { now });
    expect(doc.days[TODAY].backfilled).toBe(true);

    const result = copyFromPreviousDay(doc, TODAY, { mode: SEED_MODE.FULL, now });
    expect(result.doc.days[TODAY].backfilled).toBe(false);
  });

  /** A long holiday used to put the last real day out of reach. */
  it('still finds a source across a long break', () => {
    const base = docWithTerm();
    // The break has to be longer than the old 30-day window, so the
    // accommodations must have been in force before it started.
    const doc0 = {
      ...base,
      assignments: base.assignments.map((a) => ({ ...a, activeFrom: '2026-05-01' })),
    };
    let doc = ensureDay(doc0, '2026-08-03', now);
    doc = setEntryStatus(doc, '2026-08-03', T.jordan, T.asgJordanExtTime, STATUS.USED, { now });
    doc = ensureDay(doc, TODAY, now);

    const result = copyFromPreviousDay(doc, TODAY, { mode: SEED_MODE.FULL, now });
    expect(result.applied).toBe(true);
    expect(result.sourceDate).toBe('2026-08-03');
  });
});

describe('a student enrolled part-way through the year', () => {
  const JOINED = '2026-09-15';

  function withLateJoiner() {
    const doc = docWithTerm();
    doc.students = doc.students.map((s) => (s.id === T.priya ? { ...s, enrolledFrom: JOINED } : s));
    return doc;
  }

  /**
   * The line that must not be crossed. A student who was not in the class cannot
   * have been denied an accommodation in it, so their earlier days are not
   * applicable - never "not used", which would be a documented failure the
   * teacher did not commit against a student who was not there.
   */
  it('resolves every earlier day as not applicable, never not used', () => {
    const doc = withLateJoiner();
    expect(effectiveStatus(doc, MON, T.priya, T.asgPriyaExtTime, now)).toBe(
      DERIVED_STATUS.NOT_APPLICABLE
    );
    expect(effectiveStatus(doc, JOINED, T.priya, T.asgPriyaExtTime, now)).not.toBe(
      DERIVED_STATUS.NOT_APPLICABLE
    );
  });

  it('writes no entries for days before they joined', () => {
    const doc = ensureDay(withLateJoiner(), MON, now);
    expect(doc.days[MON].students[T.priya]).toBeUndefined();
    expect(doc.days[MON].students[T.jordan]).toBeTruthy();
  });

  it('is excluded from the roster for earlier days', () => {
    const doc = withLateJoiner();
    expect(activeStudentsFor(doc, MON).map((s) => s.id)).not.toContain(T.priya);
    expect(activeStudentsFor(doc, JOINED).map((s) => s.id)).toContain(T.priya);
  });

  /**
   * Shown rather than hidden: a lane that silently vanishes from an earlier
   * board leaves the teacher wondering whether they lost a student.
   */
  it('still appears on an earlier board, locked and carrying the date', () => {
    const doc = ensureDay(withLateJoiner(), MON, now);
    const lane = buildBoardModel(doc, { dateKey: MON, now }).lanes.find(
      (l) => l.studentId === T.priya
    );
    expect(lane.preEnrolment).toBe(true);
    expect(lane.enrolledFrom).toBe(JOINED);
    expect(Object.values(lane.columns).flat()).toHaveLength(0);
  });

  it('is an ordinary lane from the day they joined', () => {
    const doc = ensureDay(withLateJoiner(), JOINED, now);
    const lane = buildBoardModel(doc, { dateKey: JOINED, now }).lanes.find(
      (l) => l.studentId === T.priya
    );
    expect(lane.preEnrolment).toBe(false);
    expect(Object.values(lane.columns).flat().length).toBeGreaterThan(0);
  });
});
