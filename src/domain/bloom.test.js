import { describe, it, expect } from 'vitest';
import { STATUS, DERIVED_STATUS } from './constants.js';
import { effectiveStatus, sealDay, summarise } from './resolve.js';
import { buildBoardModel } from './selectors.js';
import { ensureDay } from './seed.js';
import {
  setAssignmentNotRelevant,
  setAssignmentDefault,
  setEntryStatus,
  setStudentAbsent,
  setDayNotes,
  reportTeacherAbsence,
  clearTeacherAbsence,
  absenceLine,
} from './mutations.js';
import { makeDoc, withDay, deepFreeze, T } from './test-helpers.js';

const WED = '2026-09-16';
const THU = '2026-09-17';
const now = new Date(2026, 8, 16, 9, 0);
const nextDay = new Date(2026, 8, 17, 7, 45);

const notRelevant = (doc, id = T.asgJordanExtTime, on = true, opts) =>
  setAssignmentNotRelevant(doc, id, on, opts);

describe('not relevant to this subject', () => {
  it('resolves NOT_APPLICABLE, never NOT_USED', () => {
    // The whole point: a plan written for the student's full schedule can list
    // things this teacher does not deliver. Those must never read as missed.
    const doc = notRelevant(withDay(makeDoc(), WED, {}));
    expect(effectiveStatus(doc, WED, T.jordan, T.asgJordanExtTime, nextDay)).toBe(
      DERIVED_STATUS.NOT_APPLICABLE
    );
  });

  it('stays NOT_APPLICABLE through close-out', () => {
    const doc = notRelevant(withDay(makeDoc(), WED, {}));
    const sealed = sealDay(doc, WED, nextDay);
    expect(sealed.days[WED].students[T.jordan].entries[T.asgJordanExtTime].status).toBe(
      STATUS.UNASSIGNED
    );
    expect(effectiveStatus(sealed, WED, T.jordan, T.asgJordanExtTime, nextDay)).toBe(
      DERIVED_STATUS.NOT_APPLICABLE
    );
  });

  it('is excluded from the lane denominator', () => {
    const plain = buildBoardModel(withDay(makeDoc(), WED, {}), { dateKey: WED, now });
    const marked = buildBoardModel(notRelevant(withDay(makeDoc(), WED, {})), {
      dateKey: WED,
      now,
    });

    const laneOf = (m) => m.lanes.find((l) => l.studentId === T.jordan);
    expect(laneOf(marked).summary.counted).toBe(laneOf(plain).summary.counted - 1);
  });

  it('is excluded from details-missing counts', () => {
    // Read-aloud requires a detail; marking it irrelevant must stop nagging.
    const doc = withDay(makeDoc(), WED, {
      [T.jordan]: { entries: { [T.asgJordanReadAloud]: STATUS.USED_WITH_DETAIL } },
    });
    expect(buildBoardModel(doc, { dateKey: WED, now }).detailsMissing).toBe(1);

    const marked = notRelevant(doc, T.asgJordanReadAloud);
    expect(buildBoardModel(marked, { dateKey: WED, now }).detailsMissing).toBe(0);
  });

  it('still appears on the board, flagged', () => {
    // It must stay visible and reversible, not vanish.
    const model = buildBoardModel(notRelevant(withDay(makeDoc(), WED, {})), {
      dateKey: WED,
      now,
    });
    const lane = model.lanes.find((l) => l.studentId === T.jordan);
    const card = Object.values(lane.columns)
      .flat()
      .find((c) => c.assignmentId === T.asgJordanExtTime);
    expect(card).toBeTruthy();
    expect(card.notRelevant).toBe(true);
  });

  it('resets the entry and clears any standing default', () => {
    let doc = withDay(makeDoc(), WED, {
      [T.jordan]: { entries: { [T.asgJordanExtTime]: STATUS.USED } },
    });
    doc = setAssignmentDefault(doc, T.asgJordanExtTime, STATUS.USED);
    doc = notRelevant(doc, T.asgJordanExtTime, true, { applyToDate: WED });

    expect(doc.assignments.find((a) => a.id === T.asgJordanExtTime).defaultStatus).toBeNull();
    expect(doc.days[WED].students[T.jordan].entries[T.asgJordanExtTime].status).toBe(
      STATUS.UNASSIGNED
    );
  });

  it('keeps the detail text so undo does not destroy the teacher’s words', () => {
    let doc = withDay(makeDoc(), WED, {
      [T.jordan]: {
        entries: {
          [T.asgJordanReadAloud]: { status: STATUS.USED_WITH_DETAIL, detail: 'Section 3.' },
        },
      },
    });
    doc = notRelevant(doc, T.asgJordanReadAloud, true, { applyToDate: WED });
    expect(doc.days[WED].students[T.jordan].entries[T.asgJordanReadAloud].detail).toBe(
      'Section 3.'
    );
  });

  it('undoes cleanly', () => {
    let doc = notRelevant(withDay(makeDoc(), WED, {}));
    doc = notRelevant(doc, T.asgJordanExtTime, false);
    expect(effectiveStatus(doc, WED, T.jordan, T.asgJordanExtTime, now)).toBe(STATUS.UNASSIGNED);
  });

  it('does not mutate its input', () => {
    const doc = deepFreeze(withDay(makeDoc(), WED, {}));
    expect(() => notRelevant(doc, T.asgJordanExtTime, true, { applyToDate: WED })).not.toThrow();
  });
});

describe('forward-only assignment dating', () => {
  it('a mid-year addition never appears on earlier days', () => {
    // Otherwise a card added in March silently gains Not Used for all of
    // January and February the next time those days seal.
    const doc = makeDoc();
    const added = {
      ...doc,
      assignments: doc.assignments.map((a) =>
        a.id === T.asgJordanExtTime ? { ...a, activeFrom: THU } : a
      ),
    };
    expect(effectiveStatus(added, WED, T.jordan, T.asgJordanExtTime, nextDay)).toBe(
      DERIVED_STATUS.NOT_APPLICABLE
    );
  });

  it('records normally from its start date onward', () => {
    const doc = makeDoc();
    const added = {
      ...doc,
      assignments: doc.assignments.map((a) =>
        a.id === T.asgJordanExtTime ? { ...a, activeFrom: WED } : a
      ),
    };
    const seeded = ensureDay(added, WED, now);
    expect(effectiveStatus(seeded, WED, T.jordan, T.asgJordanExtTime, now)).toBe(STATUS.UNASSIGNED);
  });

  it('an earlier day does not gain the card when seeded', () => {
    const doc = makeDoc();
    const added = {
      ...doc,
      assignments: doc.assignments.map((a) =>
        a.id === T.asgJordanExtTime ? { ...a, activeFrom: THU } : a
      ),
    };
    const seeded = ensureDay(added, WED, now);
    expect(seeded.days[WED].students[T.jordan].entries[T.asgJordanExtTime]).toBeUndefined();
  });
});

describe('marking a student absent', () => {
  it('resets their cards to Unassigned', () => {
    const doc = withDay(makeDoc(), WED, {
      [T.jordan]: { entries: { [T.asgJordanExtTime]: STATUS.USED } },
    });
    const next = setStudentAbsent(doc, WED, T.jordan, true, 'excused');
    expect(next.days[WED].students[T.jordan].entries[T.asgJordanExtTime].status).toBe(
      STATUS.UNASSIGNED
    );
    expect(next.days[WED].students[T.jordan].absent).toBe(true);
  });

  it('keeps details so an undo does not destroy them', () => {
    const doc = withDay(makeDoc(), WED, {
      [T.jordan]: {
        entries: {
          [T.asgJordanReadAloud]: { status: STATUS.USED_WITH_DETAIL, detail: 'Read 3.2' },
        },
      },
    });
    const next = setStudentAbsent(doc, WED, T.jordan, true);
    expect(next.days[WED].students[T.jordan].entries[T.asgJordanReadAloud].detail).toBe('Read 3.2');
  });

  it('marking present again does not resurrect the old statuses', () => {
    let doc = withDay(makeDoc(), WED, {
      [T.jordan]: { entries: { [T.asgJordanExtTime]: STATUS.USED } },
    });
    doc = setStudentAbsent(doc, WED, T.jordan, true);
    doc = setStudentAbsent(doc, WED, T.jordan, false);
    expect(doc.days[WED].students[T.jordan].absent).toBe(false);
    expect(doc.days[WED].students[T.jordan].entries[T.asgJordanExtTime].status).toBe(
      STATUS.UNASSIGNED
    );
  });
});

describe('day notes and teacher absence', () => {
  it('stores whole-day notes separately from per-student notes', () => {
    const doc = setDayNotes(withDay(makeDoc(), WED, {}), WED, 'Sub covering period 3.');
    expect(doc.days[WED].notes).toBe('Sub covering period 3.');
    expect(doc.days[WED].students[T.jordan].notes).toBe('');
  });

  it('appends an absence line to the day notes and records the reason', () => {
    let doc = setDayNotes(withDay(makeDoc(), WED, {}), WED, 'Quiz moved to Friday.');
    doc = reportTeacherAbsence(doc, WED, 'Out sick', 'Back Thursday');

    expect(doc.days[WED].teacherAbsence).toMatchObject({
      reason: 'Out sick',
      text: 'Back Thursday',
    });
    expect(doc.days[WED].notes).toBe('Quiz moved to Friday.\nAbsence - Out sick: Back Thursday');
  });

  it('works when there were no notes yet', () => {
    const doc = reportTeacherAbsence(withDay(makeDoc(), WED, {}), WED, 'TDY', '');
    expect(doc.days[WED].notes).toBe('Absence - TDY');
  });

  it('undo removes both the record and the appended line', () => {
    let doc = setDayNotes(withDay(makeDoc(), WED, {}), WED, 'Quiz moved to Friday.');
    doc = reportTeacherAbsence(doc, WED, 'Out sick', 'Back Thursday');
    doc = clearTeacherAbsence(doc, WED);

    expect(doc.days[WED].teacherAbsence).toBeNull();
    expect(doc.days[WED].notes).toBe('Quiz moved to Friday.');
  });

  it('refuses to record on a sealed day', () => {
    const doc = withDay(makeDoc(), WED, { __sealed: true });
    expect(reportTeacherAbsence(doc, WED, 'TDY', '')).toBe(doc);
  });

  /**
   * The teacher was not there, so the day closes with nothing claimed against
   * it: every entry back to unassigned, and the day sealed so nothing more can
   * be added.
   */
  it('clears every recorded status and seals the day', () => {
    let doc = withDay(makeDoc(), WED, {});
    doc = setEntryStatus(doc, WED, T.jordan, T.asgJordanExtTime, STATUS.USED, { now });
    expect(doc.days[WED].students[T.jordan].entries[T.asgJordanExtTime].status).toBe(STATUS.USED);

    doc = reportTeacherAbsence(doc, WED, 'Out sick', '', now);

    for (const studentDay of Object.values(doc.days[WED].students)) {
      for (const entry of Object.values(studentDay.entries)) {
        expect(entry.status).toBe(STATUS.UNASSIGNED);
      }
    }
    expect(doc.days[WED].sealed).toBe(true);
    expect(doc.days[WED].sealedBy).toBe('teacher_absence');
  });

  /**
   * The guarantee that makes sealing safe here. A sealed day resolves its blanks
   * to NOT_USED; the teacher-absence branch is checked first, so a day the
   * teacher was out of the building can never read as support they failed to
   * deliver.
   */
  it('never lets that seal resolve to not used', () => {
    let doc = reportTeacherAbsence(withDay(makeDoc(), WED, {}), WED, 'Out sick', '', now);
    expect(effectiveStatus(doc, WED, T.jordan, T.asgJordanExtTime, nextDay)).toBe(
      DERIVED_STATUS.TEACHER_ABSENT
    );
  });

  // Undo has to give the board back, or a mis-click locks the day for good.
  it('undo unseals the day it sealed', () => {
    let doc = reportTeacherAbsence(withDay(makeDoc(), WED, {}), WED, 'TDY', '', now);
    expect(doc.days[WED].sealed).toBe(true);

    doc = clearTeacherAbsence(doc, WED, now);
    expect(doc.days[WED].sealed).toBe(false);
    expect(doc.days[WED].sealedBy).toBeNull();
  });

  // A day closed out at the end of its own cycle stays closed. Going back
  // through that is what amending is for.
  it('undo leaves a seal it did not put there alone', () => {
    let doc = withDay(makeDoc(), WED, {});
    doc = reportTeacherAbsence(doc, WED, 'TDY', '', now);
    doc = {
      ...doc,
      days: { ...doc.days, [WED]: { ...doc.days[WED], sealedBy: 'auto' } },
    };

    doc = clearTeacherAbsence(doc, WED, now);
    expect(doc.days[WED].sealed).toBe(true);
    expect(doc.days[WED].teacherAbsence).toBeNull();
  });

  it('surfaces notes and absence on the board model', () => {
    let doc = setDayNotes(withDay(makeDoc(), WED, {}), WED, 'Fire drill 2nd period.');
    doc = reportTeacherAbsence(doc, WED, 'Left early', '');
    const model = buildBoardModel(doc, { dateKey: WED, now });
    expect(model.dayNotes).toContain('Fire drill');
    expect(model.teacherAbsence.reason).toBe('Left early');
  });

  it('formats the absence line consistently', () => {
    expect(absenceLine('TDY', '')).toBe('Absence - TDY');
    expect(absenceLine('Out sick', 'back Thu')).toBe('Absence - Out sick: back Thu');
  });
});

describe('a day the TEACHER was out never resolves to Not Used', () => {
  const outSick = (doc, date = WED) => reportTeacherAbsence(doc, date, 'Out sick', '');

  it('unrecorded entries resolve to teacher_absent, not not_used', () => {
    // The bug this exists to prevent: the teacher is out, nothing gets marked,
    // the day seals, and the printed report documents them as failing to deliver
    // support on a day they were not in the building.
    const doc = outSick(withDay(makeDoc(), WED, {}));
    expect(effectiveStatus(doc, WED, T.jordan, T.asgJordanExtTime, nextDay)).toBe(
      DERIVED_STATUS.TEACHER_ABSENT
    );
  });

  it('holds through close-out', () => {
    const doc = outSick(withDay(makeDoc(), WED, {}));
    const sealed = sealDay(doc, WED, nextDay);
    expect(sealed.days[WED].students[T.jordan].entries[T.asgJordanExtTime].status).toBe(
      STATUS.UNASSIGNED
    );
    expect(effectiveStatus(sealed, WED, T.jordan, T.asgJordanExtTime, nextDay)).toBe(
      DERIVED_STATUS.TEACHER_ABSENT
    );
  });

  it('sealing never stamps not_used on such a day', () => {
    const doc = outSick(withDay(makeDoc(), WED, {}));
    const sealed = sealDay(doc, WED, nextDay);
    const statuses = Object.values(sealed.days[WED].students).flatMap((s) =>
      Object.values(s.entries).map((e) => e.status)
    );
    expect(statuses).not.toContain(STATUS.NOT_USED);
  });

  /**
   * Reporting an absence clears the day, including anything already recorded.
   *
   * This reverses an earlier choice: entries made before leaving used to stand,
   * on the grounds that a morning taught is a morning delivered. Reporting the
   * absence now closes the whole day at unassigned, so what the day claims is
   * "the teacher was out" and nothing else. The cost is real and worth naming:
   * on a "Left early" day, a morning's work is cleared, and Undo restores the
   * board but not those statuses.
   */
  it('clears what was recorded before leaving, and covers the rest', () => {
    let doc = withDay(makeDoc(), WED, {
      [T.jordan]: { entries: { [T.asgJordanExtTime]: STATUS.USED } },
    });
    doc = reportTeacherAbsence(doc, WED, 'Left early', '');

    expect(doc.days[WED].students[T.jordan].entries[T.asgJordanExtTime].status).toBe(
      STATUS.UNASSIGNED
    );
    expect(effectiveStatus(doc, WED, T.jordan, T.asgJordanExtTime, nextDay)).toBe(
      DERIVED_STATUS.TEACHER_ABSENT
    );
    expect(effectiveStatus(doc, WED, T.jordan, T.asgJordanReadAloud, nextDay)).toBe(
      DERIVED_STATUS.TEACHER_ABSENT
    );
  });

  it('is excluded from the compliance denominator', () => {
    const s = summarise([
      STATUS.USED,
      DERIVED_STATUS.TEACHER_ABSENT,
      DERIVED_STATUS.TEACHER_ABSENT,
    ]);
    expect(s.counted).toBe(1);
    expect(s.rate).toBe(1);
    expect(s.counts[DERIVED_STATUS.TEACHER_ABSENT]).toBe(2);
  });

  it('undoing the absence puts the day back to normal resolution', () => {
    let doc = outSick(withDay(makeDoc(), WED, {}));
    doc = clearTeacherAbsence(doc, WED);
    expect(effectiveStatus(doc, WED, T.jordan, T.asgJordanExtTime, nextDay)).toBe(STATUS.NOT_USED);
  });

  it('a student absence still wins over a teacher absence', () => {
    // Both are non-punitive; the student's own record is the more specific fact.
    let doc = withDay(makeDoc(), WED, { [T.jordan]: { absent: true } });
    doc = reportTeacherAbsence(doc, WED, 'Out sick', '');
    expect(effectiveStatus(doc, WED, T.jordan, T.asgJordanExtTime, nextDay)).toBe(
      DERIVED_STATUS.ABSENT
    );
  });
});
