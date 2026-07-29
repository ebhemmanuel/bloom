import { describe, it, expect } from 'vitest';
import { recordStartDate } from './selectors.js';

/**
 * What the enrolment field falls back to for a student who has no date of
 * their own. An empty date field reads as information nobody entered; this is
 * what makes it read as "since the beginning" instead.
 */
describe('recordStartDate', () => {
  it('is the term start when the teacher gave one', () => {
    const doc = {
      schoolCalendar: { termStart: '2026-09-01' },
      days: { '2026-09-14': {}, '2026-09-08': {} },
    };
    expect(recordStartDate(doc)).toBe('2026-09-01');
  });

  /**
   * A file can reach here without one: a setup where that question was
   * skipped, or a document written by an older version. The board still knows
   * when it starts.
   */
  it('falls through to the earliest day on the board', () => {
    const doc = {
      schoolCalendar: { termStart: null },
      days: { '2026-11-02': {}, '2026-09-08': {}, '2026-10-19': {} },
    };
    expect(recordStartDate(doc)).toBe('2026-09-08');
  });

  it('reads day keys as dates, not as text that happens to sort', () => {
    const doc = { days: { '2026-12-01': {}, '2027-01-04': {}, '2026-09-30': {} } };
    expect(recordStartDate(doc)).toBe('2026-09-30');
  });

  it('gives back nothing rather than guessing, on a document with no days', () => {
    expect(recordStartDate({ schoolCalendar: {}, days: {} })).toBe('');
    expect(recordStartDate({})).toBe('');
    expect(recordStartDate(null)).toBe('');
  });
});
