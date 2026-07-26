import { describe, it, expect } from 'vitest';
import {
  effectiveStatus,
  sealDay,
  sealCompletedDays,
  summarise,
  clockMovedBackwards,
  amendEntry,
  buildResolveContext,
} from './resolve.js';
import { STATUS, DERIVED_STATUS } from './constants.js';
import { makeDoc, withDay, deepFreeze, T } from './test-helpers.js';

// Tuesday 2026-09-15 and Wednesday 2026-09-16 are the working dates throughout.
const TUE = '2026-09-15';
const WED = '2026-09-16';
const SAT = '2026-09-19';

const beforeCycle = new Date(2026, 8, 16, 9, 0); // Wed 09:00
const afterCycle = new Date(2026, 8, 16, 17, 30); // Wed 17:30
const nextMorning = new Date(2026, 8, 17, 7, 45); // Thu 07:45

const status = (doc, date, student, asg, now) => effectiveStatus(doc, date, student, asg, now);

describe('effectiveStatus — precedence chain', () => {
  it('returns no_record when the day was never opened', () => {
    const doc = makeDoc();
    expect(status(doc, WED, T.jordan, T.asgJordanExtTime, beforeCycle)).toBe(
      DERIVED_STATUS.NO_RECORD
    );
  });

  it('returns unassigned on an open day before the cycle closes', () => {
    const doc = withDay(makeDoc(), WED, {});
    expect(status(doc, WED, T.jordan, T.asgJordanExtTime, beforeCycle)).toBe(STATUS.UNASSIGNED);
  });

  it('returns the explicit status when one was recorded', () => {
    const doc = withDay(makeDoc(), WED, {
      [T.jordan]: { entries: { [T.asgJordanExtTime]: STATUS.USED } },
    });
    expect(status(doc, WED, T.jordan, T.asgJordanExtTime, beforeCycle)).toBe(STATUS.USED);
  });

  it('an explicit status survives the cycle closing', () => {
    const doc = withDay(makeDoc(), WED, {
      [T.jordan]: { entries: { [T.asgJordanReadAloud]: STATUS.USED_WITH_DETAIL } },
    });
    expect(status(doc, WED, T.jordan, T.asgJordanReadAloud, afterCycle)).toBe(
      STATUS.USED_WITH_DETAIL
    );
  });

  it('resolves unassigned to not_used once the cycle closes, WITHOUT persisting it', () => {
    const doc = withDay(makeDoc(), WED, {});
    expect(status(doc, WED, T.jordan, T.asgJordanExtTime, afterCycle)).toBe(STATUS.NOT_USED);
    // The stored value is untouched — resolution is lazy.
    expect(doc.days[WED].students[T.jordan].entries[T.asgJordanExtTime].status).toBe(
      STATUS.UNASSIGNED
    );
  });

  it('resolves unassigned to not_used for any past day', () => {
    const doc = withDay(makeDoc(), TUE, {});
    expect(status(doc, TUE, T.jordan, T.asgJordanExtTime, beforeCycle)).toBe(STATUS.NOT_USED);
  });

  it('returns not_used on a sealed day', () => {
    const doc = withDay(makeDoc(), TUE, { __sealed: true });
    expect(status(doc, TUE, T.jordan, T.asgJordanExtTime, beforeCycle)).toBe(STATUS.NOT_USED);
  });

  it('returns absent for an absent student, whatever the clock says', () => {
    const doc = withDay(makeDoc(), WED, { [T.jordan]: { absent: true } });
    expect(status(doc, WED, T.jordan, T.asgJordanExtTime, beforeCycle)).toBe(DERIVED_STATUS.ABSENT);
    expect(status(doc, WED, T.jordan, T.asgJordanExtTime, afterCycle)).toBe(DERIVED_STATUS.ABSENT);
  });

  it('absence outranks a recorded status', () => {
    const doc = withDay(makeDoc(), WED, {
      [T.jordan]: { absent: true, entries: { [T.asgJordanExtTime]: STATUS.USED } },
    });
    expect(status(doc, WED, T.jordan, T.asgJordanExtTime, afterCycle)).toBe(DERIVED_STATUS.ABSENT);
  });

  it('returns not_applicable on a non-instructional date', () => {
    const base = makeDoc();
    base.schoolCalendar.nonInstructionalDates = [WED];
    const doc = withDay(base, WED, {});
    expect(status(doc, WED, T.jordan, T.asgJordanExtTime, afterCycle)).toBe(
      DERIVED_STATUS.NOT_APPLICABLE
    );
  });

  it('returns not_applicable when the student’s period does not meet that weekday', () => {
    // Priya is only in Period 3 (Mon/Wed/Fri). Tuesday does not apply to her.
    const doc = withDay(makeDoc(), TUE, {});
    expect(status(doc, TUE, T.priya, T.asgPriyaExtTime, nextMorning)).toBe(
      DERIVED_STATUS.NOT_APPLICABLE
    );
    // Jordan is in Period 1 (Mon-Fri), so Tuesday does apply to him.
    expect(status(doc, TUE, T.jordan, T.asgJordanExtTime, nextMorning)).toBe(STATUS.NOT_USED);
  });

  it('returns not_applicable on a weekend for everyone', () => {
    const doc = withDay(makeDoc(), SAT, {});
    expect(status(doc, SAT, T.jordan, T.asgJordanExtTime, nextMorning)).toBe(
      DERIVED_STATUS.NOT_APPLICABLE
    );
  });

  it('returns not_applicable before an assignment’s activeFrom date', () => {
    // The custom sensory-break pass only starts 2026-09-08.
    const doc = withDay(makeDoc(), '2026-09-03', {});
    expect(status(doc, '2026-09-03', T.jordan, T.asgJordanCustom, nextMorning)).toBe(
      DERIVED_STATUS.NOT_APPLICABLE
    );
  });

  it('returns not_applicable after an assignment’s activeTo date', () => {
    const base = makeDoc();
    base.assignments = base.assignments.map((a) =>
      a.id === T.asgJordanExtTime ? { ...a, activeTo: '2026-09-12' } : a
    );
    const doc = withDay(base, WED, {});
    expect(status(doc, WED, T.jordan, T.asgJordanExtTime, afterCycle)).toBe(
      DERIVED_STATUS.NOT_APPLICABLE
    );
  });
});

describe('the load-bearing guarantee: a missing day is never not_used', () => {
  it('a three-week gap resolves to no_record throughout, never not_used', () => {
    const doc = makeDoc(); // no day records at all
    const gap = [
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
      '2026-08-27',
      '2026-08-28',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
    ];

    for (const date of gap) {
      const s = status(doc, date, T.jordan, T.asgJordanExtTime, nextMorning);
      expect(s).not.toBe(STATUS.NOT_USED);
      expect([DERIVED_STATUS.NO_RECORD, DERIVED_STATUS.NOT_APPLICABLE]).toContain(s);
    }
  });

  it('sealing a whole document never creates a day record', () => {
    const doc = makeDoc();
    const sealed = sealCompletedDays(doc, nextMorning);
    expect(Object.keys(sealed.days)).toHaveLength(0);
  });

  it('auto-seal leaves TODAY editable even after the cycle end time', () => {
    // Teachers do this paperwork in the evening. Sealing today at 16:00 would
    // make the board read-only exactly when it is being used, forcing an audited
    // Amend for ordinary same-day entry.
    const doc = withDay(makeDoc(), WED, {});
    const sealed = sealCompletedDays(doc, afterCycle); // Wed 17:30

    expect(sealed.days[WED].sealed).toBe(false);
    // …but the teacher still SEES the real default.
    expect(status(sealed, WED, T.jordan, T.asgJordanExtTime, afterCycle)).toBe(STATUS.NOT_USED);
    // …and the stored value is still editable, not materialised.
    expect(sealed.days[WED].students[T.jordan].entries[T.asgJordanExtTime].status).toBe(
      STATUS.UNASSIGNED
    );
  });

  it('auto-seal does close out yesterday once the date rolls over', () => {
    const doc = withDay(withDay(makeDoc(), TUE, {}), WED, {});
    const sealed = sealCompletedDays(doc, nextMorning); // Thu 07:45

    expect(sealed.days[TUE].sealed).toBe(true);
    expect(sealed.days[WED].sealed).toBe(true);
  });

  it('an explicit close-out can still seal today', () => {
    const doc = withDay(makeDoc(), WED, {});
    const sealed = sealDay(doc, WED, afterCycle, 'user');
    expect(sealed.days[WED].sealed).toBe(true);
    expect(sealed.days[WED].sealedBy).toBe('user');
  });

  it('a student with no entry on an existing day is no_record, not not_used', () => {
    const doc = withDay(makeDoc(), TUE, {});
    delete doc.days[TUE].students[T.jordan].entries[T.asgJordanExtTime];
    expect(status(doc, TUE, T.jordan, T.asgJordanExtTime, nextMorning)).toBe(
      DERIVED_STATUS.NO_RECORD
    );
  });
});

describe('sealDay', () => {
  it('materialises not_used onto unassigned entries and marks the day sealed', () => {
    const doc = withDay(makeDoc(), TUE, {
      [T.jordan]: { entries: { [T.asgJordanExtTime]: STATUS.USED } },
    });
    const sealed = sealDay(doc, TUE, nextMorning);
    const entries = sealed.days[TUE].students[T.jordan].entries;

    expect(sealed.days[TUE].sealed).toBe(true);
    expect(sealed.days[TUE].sealedBy).toBe('auto');
    expect(entries[T.asgJordanExtTime].status).toBe(STATUS.USED); // untouched
    expect(entries[T.asgJordanReadAloud].status).toBe(STATUS.NOT_USED);
    expect(entries[T.asgJordanReadAloud].resolvedBy).toBe('auto');
    expect(entries[T.asgJordanReadAloud].resolvedAt).toBeTruthy();
  });

  it('does not seal a day whose cycle has not completed', () => {
    const doc = withDay(makeDoc(), WED, {});
    expect(sealDay(doc, WED, beforeCycle)).toBe(doc);
  });

  it('is a strict no-op on an already-sealed day', () => {
    const doc = withDay(makeDoc(), TUE, { __sealed: true });
    expect(sealDay(doc, TUE, nextMorning)).toBe(doc);
  });

  it('is idempotent', () => {
    const doc = withDay(makeDoc(), TUE, {});
    const once = sealDay(doc, TUE, nextMorning);
    const twice = sealDay(once, TUE, nextMorning);
    expect(twice).toBe(once);
  });

  it('never mutates its input', () => {
    const doc = deepFreeze(withDay(makeDoc(), TUE, {}));
    expect(() => sealDay(doc, TUE, nextMorning)).not.toThrow();
    expect(doc.days[TUE].sealed).toBe(false);
  });

  it('does not stamp not_used on an absent student', () => {
    const doc = withDay(makeDoc(), TUE, { [T.jordan]: { absent: true } });
    const sealed = sealDay(doc, TUE, nextMorning);
    expect(sealed.days[TUE].students[T.jordan].entries[T.asgJordanExtTime].status).toBe(
      STATUS.UNASSIGNED
    );
    expect(sealed.days[TUE].sealed).toBe(true);
  });

  it('does not stamp not_used where the period does not meet', () => {
    const doc = withDay(makeDoc(), TUE, {});
    const sealed = sealDay(doc, TUE, nextMorning);
    // Priya's Period 3 does not meet on Tuesday.
    expect(sealed.days[TUE].students[T.priya].entries[T.asgPriyaExtTime].status).toBe(
      STATUS.UNASSIGNED
    );
  });

  it('returns the same reference when there is nothing to do', () => {
    const doc = makeDoc();
    expect(sealDay(doc, '2026-09-01', nextMorning)).toBe(doc);
  });
});

describe('summarise — compliance math', () => {
  it('excludes absences from the denominator', () => {
    const s = summarise([STATUS.USED, STATUS.USED, DERIVED_STATUS.ABSENT, STATUS.NOT_USED]);
    expect(s.counted).toBe(3);
    expect(s.delivered).toBe(2);
    expect(s.rate).toBeCloseTo(2 / 3);
  });

  it('excludes no_record and not_applicable from the denominator', () => {
    const s = summarise([
      STATUS.USED,
      DERIVED_STATUS.NO_RECORD,
      DERIVED_STATUS.NOT_APPLICABLE,
      DERIVED_STATUS.ABSENT,
    ]);
    expect(s.counted).toBe(1);
    expect(s.rate).toBe(1);
  });

  it('counts used_with_detail as delivered', () => {
    const s = summarise([STATUS.USED_WITH_DETAIL, STATUS.NOT_USED]);
    expect(s.delivered).toBe(1);
    expect(s.rate).toBe(0.5);
  });

  it('returns a null rate rather than 0% when nothing is measurable', () => {
    // A week of holidays must print "—", not a damning "0%".
    const s = summarise([DERIVED_STATUS.NOT_APPLICABLE, DERIVED_STATUS.NO_RECORD]);
    expect(s.counted).toBe(0);
    expect(s.rate).toBeNull();
  });

  it('reports every bucket', () => {
    const s = summarise([STATUS.USED, STATUS.USED, STATUS.NOT_USED, DERIVED_STATUS.ABSENT]);
    expect(s.counts[STATUS.USED]).toBe(2);
    expect(s.counts[STATUS.NOT_USED]).toBe(1);
    expect(s.counts[DERIVED_STATUS.ABSENT]).toBe(1);
    expect(s.total).toBe(4);
  });
});

describe('clockMovedBackwards', () => {
  it('is false when time moves forward normally', () => {
    const doc = makeDoc();
    doc.settings.lastKnownDate = '2026-09-15';
    expect(clockMovedBackwards(doc, new Date(2026, 8, 16))).toBe(false);
  });

  it('detects a backwards jump so history is never unsealed', () => {
    const doc = makeDoc();
    doc.settings.lastKnownDate = '2026-09-16';
    expect(clockMovedBackwards(doc, new Date(2026, 8, 10))).toBe(true);
  });

  it('is false on the same day', () => {
    const doc = makeDoc();
    doc.settings.lastKnownDate = '2026-09-16';
    expect(clockMovedBackwards(doc, new Date(2026, 8, 16, 23, 0))).toBe(false);
  });
});

describe('amendEntry', () => {
  it('records the change, keeps the day sealed, and appends to the log', () => {
    const doc = withDay(makeDoc(), TUE, { __sealed: true });
    const amended = amendEntry(
      doc,
      TUE,
      T.jordan,
      T.asgJordanExtTime,
      { status: STATUS.USED },
      'Recorded late — quiz accommodation was delivered.'
    );

    const day = amended.days[TUE];
    expect(day.sealed).toBe(true);
    expect(day.amended).toBe(true);
    expect(day.amendments).toHaveLength(1);
    expect(day.amendments[0]).toMatchObject({
      studentId: T.jordan,
      assignmentId: T.asgJordanExtTime,
      from: STATUS.UNASSIGNED,
      to: STATUS.USED,
      reason: 'Recorded late — quiz accommodation was delivered.',
    });
    expect(day.students[T.jordan].entries[T.asgJordanExtTime].status).toBe(STATUS.USED);
  });

  it('appends rather than replacing on a second amendment', () => {
    const doc = withDay(makeDoc(), TUE, { __sealed: true });
    const once = amendEntry(doc, TUE, T.jordan, T.asgJordanExtTime, { status: STATUS.USED }, 'a');
    const twice = amendEntry(
      once,
      TUE,
      T.jordan,
      T.asgJordanExtTime,
      { status: STATUS.NOT_USED },
      'b'
    );
    expect(twice.days[TUE].amendments).toHaveLength(2);
  });

  it('never mutates its input', () => {
    const doc = deepFreeze(withDay(makeDoc(), TUE, { __sealed: true }));
    expect(() =>
      amendEntry(doc, TUE, T.jordan, T.asgJordanExtTime, { status: STATUS.USED }, 'x')
    ).not.toThrow();
    expect(doc.days[TUE].amended).toBe(false);
  });

  it('is a no-op for an unknown day, student, or assignment', () => {
    const doc = withDay(makeDoc(), TUE, { __sealed: true });
    expect(amendEntry(doc, '2026-01-01', T.jordan, T.asgJordanExtTime, {}, null)).toBe(doc);
    expect(amendEntry(doc, TUE, 'stu_nope', T.asgJordanExtTime, {}, null)).toBe(doc);
    expect(amendEntry(doc, TUE, T.jordan, 'asg_nope', {}, null)).toBe(doc);
  });
});

describe('buildResolveContext', () => {
  it('produces working lookups', () => {
    const ctx = buildResolveContext(makeDoc());
    expect(ctx.studentsById.get(T.jordan).displayName).toBe('Jordan A.');
    expect(ctx.periodsById.get(T.p3).meetingDays).toEqual(['MO', 'WE', 'FR']);
    expect(ctx.assignmentsById.get(T.asgJordanCustom).source).toBe('custom');
  });
});
