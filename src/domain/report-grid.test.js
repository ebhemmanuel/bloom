import { describe, it, expect } from 'vitest';
import { buildReport } from './report.js';
import { ensureDay } from './seed.js';
import { setEntryStatus } from './mutations.js';
import { STATUS } from './constants.js';
import { makeDoc, T } from './test-helpers.js';

const MON = '2026-09-14';
const TUE = '2026-09-15';
const WED = '2026-09-16';
const now = new Date(2026, 8, 16, 17, 30);

/**
 * The printed sheet runs dates DOWN and accommodations ACROSS, so it reads the
 * grid by date rather than by position. These pin that lookup: a report that
 * attributes a status to the wrong day is the one failure it cannot have.
 */
describe('report grid, keyed by date', () => {
  function reportWith() {
    let doc = makeDoc();
    for (const d of [MON, TUE, WED]) doc = ensureDay(doc, d, now);
    doc = setEntryStatus(doc, MON, T.jordan, T.asgJordanExtTime, STATUS.USED, { now });
    doc = setEntryStatus(doc, WED, T.jordan, T.asgJordanExtTime, STATUS.REFUSED, { now });
    return buildReport(doc, { scope: { kind: 'range', from: MON, to: WED }, now });
  }

  const rowFor = (report, assignmentId) =>
    report.students
      .find((s) => s.student.id === T.jordan)
      .rows.find((r) => r.assignmentId === assignmentId);

  it('offers every cell by its own date', () => {
    const row = rowFor(reportWith(), T.asgJordanExtTime);
    expect([...row.cellsByDate.keys()].sort()).toEqual([MON, TUE, WED]);
  });

  it('puts each status on the day it was recorded', () => {
    const row = rowFor(reportWith(), T.asgJordanExtTime);
    expect(row.cellsByDate.get(MON).status).toBe(STATUS.USED);
    expect(row.cellsByDate.get(WED).status).toBe(STATUS.REFUSED);
    expect(row.cellsByDate.get(TUE).status).not.toBe(STATUS.USED);
  });

  it('agrees with the positional cells it was built from', () => {
    const report = reportWith();
    const row = rowFor(report, T.asgJordanExtTime);
    for (const cell of row.cells) {
      expect(row.cellsByDate.get(cell.date)).toBe(cell);
    }
    expect(row.cellsByDate.size).toBe(row.cells.length);
  });

  /** Every row must cover every date, or the transposed table would misalign. */
  it('covers the full range on every accommodation', () => {
    const report = reportWith();
    const student = report.students.find((s) => s.student.id === T.jordan);
    for (const row of student.rows) {
      expect(row.cellsByDate.size).toBe(report.dates.length);
      for (const d of report.dates) expect(row.cellsByDate.has(d)).toBe(true);
    }
  });
});
