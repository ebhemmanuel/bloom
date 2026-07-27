import { describe, it, expect } from 'vitest';
import { STATUS, DERIVED_STATUS, RESOLVED_BY } from './constants.js';
import { summarise, sealDay, effectiveStatus } from './resolve.js';
import { ensureDay, dayHasWork } from './seed.js';
import { setAssignmentDefault, setEntryStatus, setEntryUseCount } from './mutations.js';
import { buildBoardModel } from './selectors.js';
import { makeDoc, withDay, deepFreeze, T } from './test-helpers.js';

const WED = '2026-09-16';
const THU = '2026-09-17';
const before = new Date(2026, 8, 16, 9, 0);
const nextDay = new Date(2026, 8, 17, 7, 45);

describe('Refused - compliance treatment', () => {
  it('counts toward the denominator', () => {
    // The duty is to OFFER the accommodation. A student declining it is not the
    // teacher failing to provide it.
    const s = summarise([STATUS.USED, STATUS.REFUSED, STATUS.NOT_USED]);
    expect(s.counted).toBe(3);
  });

  it('is addressed but not delivered', () => {
    const s = summarise([STATUS.REFUSED, STATUS.REFUSED]);
    expect(s.delivered).toBe(0);
    expect(s.addressed).toBe(2);
    expect(s.rate).toBe(0);
    // The figure that belongs on a compliance report.
    expect(s.addressedRate).toBe(1);
  });

  it('is reported in its own bucket, never folded into not_used', () => {
    const s = summarise([STATUS.REFUSED, STATUS.NOT_USED]);
    expect(s.counts[STATUS.REFUSED]).toBe(1);
    expect(s.counts[STATUS.NOT_USED]).toBe(1);
  });

  it('survives end-of-cycle sealing untouched', () => {
    const doc = withDay(makeDoc(), WED, {
      [T.jordan]: { entries: { [T.asgJordanExtTime]: STATUS.REFUSED } },
    });
    const sealed = sealDay(doc, WED, nextDay);
    expect(sealed.days[WED].students[T.jordan].entries[T.asgJordanExtTime].status).toBe(
      STATUS.REFUSED
    );
  });

  it('resolves as refused through effectiveStatus', () => {
    const doc = withDay(makeDoc(), WED, {
      [T.jordan]: { entries: { [T.asgJordanExtTime]: STATUS.REFUSED } },
    });
    expect(effectiveStatus(doc, WED, T.jordan, T.asgJordanExtTime, nextDay)).toBe(STATUS.REFUSED);
  });
});

describe('use count - "used more than once"', () => {
  it('records a repeat count on a used entry', () => {
    const doc = withDay(makeDoc(), WED, {
      [T.jordan]: { entries: { [T.asgJordanExtTime]: STATUS.USED } },
    });
    const next = setEntryUseCount(doc, WED, T.jordan, T.asgJordanExtTime, 3);
    expect(next.days[WED].students[T.jordan].entries[T.asgJordanExtTime].useCount).toBe(3);
  });

  it('refuses a count on a status where nothing was used', () => {
    // Claiming "used 3 times" on a Refused card would be a false record.
    const doc = withDay(makeDoc(), WED, {
      [T.jordan]: { entries: { [T.asgJordanExtTime]: STATUS.REFUSED } },
    });
    expect(setEntryUseCount(doc, WED, T.jordan, T.asgJordanExtTime, 3)).toBe(doc);
  });

  it('resets the count when the card leaves a used column', () => {
    // Otherwise a stale "×3" lingers on a card that now claims no usage.
    let doc = withDay(makeDoc(), WED, {
      [T.jordan]: { entries: { [T.asgJordanExtTime]: STATUS.USED } },
    });
    doc = setEntryUseCount(doc, WED, T.jordan, T.asgJordanExtTime, 4);
    doc = setEntryStatus(doc, WED, T.jordan, T.asgJordanExtTime, STATUS.REFUSED);
    expect(doc.days[WED].students[T.jordan].entries[T.asgJordanExtTime].useCount).toBe(1);
  });

  it('clamps out-of-range values', () => {
    const doc = withDay(makeDoc(), WED, {
      [T.jordan]: { entries: { [T.asgJordanExtTime]: { status: STATUS.USED, useCount: 5 } } },
    });
    const count = (d) => d.days[WED].students[T.jordan].entries[T.asgJordanExtTime].useCount;

    // Nothing below 1 - a "used" card cannot claim zero uses.
    expect(count(setEntryUseCount(doc, WED, T.jordan, T.asgJordanExtTime, -5))).toBe(1);
    expect(count(setEntryUseCount(doc, WED, T.jordan, T.asgJordanExtTime, 0))).toBe(1);
    // Capped, so a stray paste cannot claim an absurd number on an audited record.
    expect(count(setEntryUseCount(doc, WED, T.jordan, T.asgJordanExtTime, 9999))).toBe(99);
    // Non-numeric input falls back to 1 rather than writing NaN.
    expect(count(setEntryUseCount(doc, WED, T.jordan, T.asgJordanExtTime, 'lots'))).toBe(1);
  });

  it('preserves the count when moving between the two used columns', () => {
    let doc = withDay(makeDoc(), WED, {
      [T.jordan]: { entries: { [T.asgJordanExtTime]: STATUS.USED } },
    });
    doc = setEntryUseCount(doc, WED, T.jordan, T.asgJordanExtTime, 2);
    doc = setEntryStatus(doc, WED, T.jordan, T.asgJordanExtTime, STATUS.USED_WITH_DETAIL);
    expect(doc.days[WED].students[T.jordan].entries[T.asgJordanExtTime].useCount).toBe(2);
  });
});

describe('standing defaults', () => {
  it('seeds a new day at the default status', () => {
    let doc = setAssignmentDefault(makeDoc(), T.asgJordanExtTime, STATUS.USED);
    doc = ensureDay(doc, THU, nextDay);
    const entry = doc.days[THU].students[T.jordan].entries[T.asgJordanExtTime];
    expect(entry.status).toBe(STATUS.USED);
  });

  it('stamps a defaulted entry as `default`, not `user`', () => {
    // Provenance is the point. A default asserts delivery on a day nobody
    // observed anything; the record has to be able to say which is which.
    let doc = setAssignmentDefault(makeDoc(), T.asgJordanExtTime, STATUS.USED);
    doc = ensureDay(doc, THU, nextDay);
    expect(doc.days[THU].students[T.jordan].entries[T.asgJordanExtTime].resolvedBy).toBe(
      RESOLVED_BY.DEFAULT
    );
  });

  it('leaves other accommodations unassigned', () => {
    let doc = setAssignmentDefault(makeDoc(), T.asgJordanExtTime, STATUS.USED);
    doc = ensureDay(doc, THU, nextDay);
    expect(doc.days[THU].students[T.jordan].entries[T.asgJordanReadAloud].status).toBe(
      STATUS.UNASSIGNED
    );
  });

  it('applies only to that one student', () => {
    // Both Jordan and Priya have the extended-time catalog item; the default is
    // on Jordan's assignment, so Priya must be untouched.
    let doc = setAssignmentDefault(makeDoc(), T.asgJordanExtTime, STATUS.USED);
    doc = ensureDay(doc, THU, nextDay);
    expect(doc.days[THU].students[T.priya].entries[T.asgPriyaExtTime].status).toBe(
      STATUS.UNASSIGNED
    );
  });

  it('does not count as work, so Copy yesterday is not blocked', () => {
    let doc = setAssignmentDefault(makeDoc(), T.asgJordanExtTime, STATUS.USED);
    doc = ensureDay(doc, THU, nextDay);
    expect(dayHasWork(doc, THU)).toBe(false);
  });

  it('a real edit does count as work', () => {
    let doc = setAssignmentDefault(makeDoc(), T.asgJordanExtTime, STATUS.USED);
    doc = ensureDay(doc, THU, nextDay);
    doc = setEntryStatus(doc, THU, T.jordan, T.asgJordanReadAloud, STATUS.USED);
    expect(dayHasWork(doc, THU)).toBe(true);
  });

  it('carries its standing detail into every new day', () => {
    // The whole point of a default is that the teacher stops doing this. An
    // accommodation that requires a written detail must therefore be written
    // ONCE, when the default is set - not re-typed on all 180 days.
    let doc = setAssignmentDefault(makeDoc(), T.asgJordanReadAloud, STATUS.USED_WITH_DETAIL, {
      detail: 'Aide reads all written directions aloud.',
    });
    doc = ensureDay(doc, THU, nextDay);
    const entry = doc.days[THU].students[T.jordan].entries[T.asgJordanReadAloud];
    expect(entry.status).toBe(STATUS.USED_WITH_DETAIL);
    expect(entry.detail).toBe('Aide reads all written directions aloud.');
  });

  it('a defaulted detail satisfies the board’s detail-needed check', () => {
    // Read-aloud is the requiresDetail catalog item, so this is the case that
    // used to nag every single morning.
    let doc = setAssignmentDefault(makeDoc(), T.asgJordanReadAloud, STATUS.USED_WITH_DETAIL, {
      detail: 'Aide reads all written directions aloud.',
    });
    doc = ensureDay(doc, THU, nextDay);
    const model = buildBoardModel(doc, { dateKey: THU, now: nextDay });
    const lane = model.lanes.find((l) => l.studentId === T.jordan);
    expect(lane.detailsMissing).toBe(0);
  });

  it('clearing the default drops its standing detail with it', () => {
    let doc = setAssignmentDefault(makeDoc(), T.asgJordanReadAloud, STATUS.USED_WITH_DETAIL, {
      detail: 'Aide reads all written directions aloud.',
    });
    doc = setAssignmentDefault(doc, T.asgJordanReadAloud, null);
    doc = ensureDay(doc, THU, nextDay);
    const entry = doc.days[THU].students[T.jordan].entries[T.asgJordanReadAloud];
    expect(entry.status).toBe(STATUS.UNASSIGNED);
    expect(entry.detail).toBe('');
  });

  it('clearing the default returns new days to unassigned', () => {
    let doc = setAssignmentDefault(makeDoc(), T.asgJordanExtTime, STATUS.USED);
    doc = setAssignmentDefault(doc, T.asgJordanExtTime, null);
    doc = ensureDay(doc, THU, nextDay);
    expect(doc.days[THU].students[T.jordan].entries[T.asgJordanExtTime].status).toBe(
      STATUS.UNASSIGNED
    );
  });

  it('does not rewrite history when set mid-year', () => {
    // Silently restating weeks of past records because a default was added in
    // March is exactly what the amendment log exists to prevent.
    const doc = withDay(makeDoc(), WED, {});
    const next = setAssignmentDefault(doc, T.asgJordanExtTime, STATUS.USED);
    expect(next.days[WED].students[T.jordan].entries[T.asgJordanExtTime].status).toBe(
      STATUS.UNASSIGNED
    );
  });

  it('applies to the day in view when asked', () => {
    const doc = withDay(makeDoc(), WED, {});
    const next = setAssignmentDefault(doc, T.asgJordanExtTime, STATUS.USED, { applyToDate: WED });
    const entry = next.days[WED].students[T.jordan].entries[T.asgJordanExtTime];
    expect(entry.status).toBe(STATUS.USED);
    expect(entry.resolvedBy).toBe(RESOLVED_BY.DEFAULT);
  });

  it('never overwrites something the teacher already decided', () => {
    const doc = withDay(makeDoc(), WED, {
      [T.jordan]: { entries: { [T.asgJordanExtTime]: STATUS.REFUSED } },
    });
    const next = setAssignmentDefault(doc, T.asgJordanExtTime, STATUS.USED, { applyToDate: WED });
    expect(next.days[WED].students[T.jordan].entries[T.asgJordanExtTime].status).toBe(
      STATUS.REFUSED
    );
  });

  it('refuses to touch a sealed day', () => {
    const doc = withDay(makeDoc(), WED, { __sealed: true });
    const next = setAssignmentDefault(doc, T.asgJordanExtTime, STATUS.USED, { applyToDate: WED });
    expect(next.days[WED].students[T.jordan].entries[T.asgJordanExtTime].status).toBe(
      STATUS.UNASSIGNED
    );
  });

  it('never mutates its input', () => {
    const doc = deepFreeze(withDay(makeDoc(), WED, {}));
    expect(() =>
      setAssignmentDefault(doc, T.asgJordanExtTime, STATUS.USED, { applyToDate: WED })
    ).not.toThrow();
    expect(doc.assignments.find((a) => a.id === T.asgJordanExtTime).defaultStatus).toBeUndefined();
  });

  it('a defaulted entry still seals normally if left as-is', () => {
    let doc = setAssignmentDefault(makeDoc(), T.asgJordanExtTime, STATUS.USED);
    doc = ensureDay(doc, WED, before);
    const sealed = sealDay(doc, WED, nextDay);
    // It is not `unassigned`, so sealing leaves it alone rather than flipping it.
    expect(sealed.days[WED].students[T.jordan].entries[T.asgJordanExtTime].status).toBe(
      STATUS.USED
    );
    expect(sealed.days[WED].sealed).toBe(true);
  });
});
