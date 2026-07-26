import { describe, it, expect } from 'vitest';
import {
  toDateKey,
  parseDateKey,
  isValidDateKey,
  isoTimestamp,
  addDays,
  compareDateKeys,
  weekdayCode,
  eachDateInRange,
  isCycleComplete,
  relativeDayLabel,
} from './dates.js';

describe('toDateKey — local calendar, never UTC', () => {
  it('uses local date components', () => {
    expect(toDateKey(new Date(2026, 8, 15, 10, 30))).toBe('2026-09-15');
  });

  it('does not roll forward late in the evening', () => {
    // THE regression this whole module exists to prevent. At 20:00 local in any
    // timezone west of Greenwich, toISOString() is already the next day. If this
    // ever fails, every teacher in the Americas gets their afternoon entries
    // filed under tomorrow's date on a legal record.
    const evening = new Date(2026, 8, 15, 20, 0, 0);
    expect(toDateKey(evening)).toBe('2026-09-15');

    if (evening.getTimezoneOffset() > 0) {
      // Only meaningful in a western timezone — assert the naive approach really
      // would have been wrong, so the test proves something.
      expect(evening.toISOString().slice(0, 10)).not.toBe(toDateKey(evening));
    }
  });

  it('handles the last instant before midnight', () => {
    expect(toDateKey(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
  });

  it('zero-pads single-digit months and days', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('parseDateKey', () => {
  it('round-trips with toDateKey', () => {
    for (const key of ['2026-01-01', '2026-09-15', '2027-03-14', '2026-11-01', '2028-02-29']) {
      expect(toDateKey(parseDateKey(key))).toBe(key);
    }
  });

  it('parses to local midnight, not UTC midnight', () => {
    const d = parseDateKey('2026-09-15');
    expect(d.getHours()).toBe(0);
    expect(d.getDate()).toBe(15);
  });
});

describe('isValidDateKey', () => {
  it('accepts well-formed real dates', () => {
    expect(isValidDateKey('2026-09-15')).toBe(true);
    expect(isValidDateKey('2028-02-29')).toBe(true); // leap year
  });

  it('rejects malformed or impossible dates', () => {
    for (const bad of ['2026-9-15', '15-09-2026', '2026-13-01', '2027-02-29', '', null, 42, {}]) {
      expect(isValidDateKey(bad)).toBe(false);
    }
  });
});

describe('addDays — DST and boundary safety', () => {
  it('crosses the US spring-forward boundary without losing a day', () => {
    // 2027-03-14 is the US DST start. A naive +86400000ms lands on the 14th twice.
    expect(addDays('2027-03-13', 1)).toBe('2027-03-14');
    expect(addDays('2027-03-14', 1)).toBe('2027-03-15');
  });

  it('crosses the US fall-back boundary without repeating a day', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('handles leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });
});

describe('isoTimestamp', () => {
  it('emits a full ISO string with an explicit offset, not a Z', () => {
    const ts = isoTimestamp(new Date(2026, 8, 15, 14, 41, 9, 123));
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
    expect(ts).not.toMatch(/Z$/);
  });

  it('preserves the local wall-clock time', () => {
    // A laptop that travels must not appear to rewrite when things happened.
    expect(isoTimestamp(new Date(2026, 8, 15, 14, 41, 9, 123))).toContain('T14:41:09.123');
  });
});

describe('compareDateKeys', () => {
  it('orders correctly', () => {
    expect(compareDateKeys('2026-09-15', '2026-09-16')).toBe(-1);
    expect(compareDateKeys('2026-09-16', '2026-09-15')).toBe(1);
    expect(compareDateKeys('2026-09-15', '2026-09-15')).toBe(0);
    expect(compareDateKeys('2026-09-30', '2026-10-01')).toBe(-1);
  });
});

describe('weekdayCode', () => {
  it('maps known dates', () => {
    expect(weekdayCode('2026-09-14')).toBe('MO');
    expect(weekdayCode('2026-09-15')).toBe('TU');
    expect(weekdayCode('2026-09-19')).toBe('SA');
    expect(weekdayCode('2026-09-20')).toBe('SU');
  });
});

describe('eachDateInRange', () => {
  it('is inclusive of both ends', () => {
    expect(eachDateInRange('2026-09-14', '2026-09-16')).toEqual([
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
    ]);
  });

  it('returns a single date for a same-day range', () => {
    expect(eachDateInRange('2026-09-14', '2026-09-14')).toEqual(['2026-09-14']);
  });

  it('returns empty when the range is inverted', () => {
    expect(eachDateInRange('2026-09-16', '2026-09-14')).toEqual([]);
  });

  it('spans a month boundary', () => {
    expect(eachDateInRange('2026-09-29', '2026-10-02')).toHaveLength(4);
  });
});

describe('isCycleComplete', () => {
  const cycleEnd = '16:00';

  it('is true for any past date', () => {
    const now = new Date(2026, 8, 16, 9, 0);
    expect(isCycleComplete('2026-09-15', cycleEnd, now)).toBe(true);
  });

  it('is false for a future date', () => {
    const now = new Date(2026, 8, 16, 9, 0);
    expect(isCycleComplete('2026-09-17', cycleEnd, now)).toBe(false);
  });

  it('is false today before the cycle end time', () => {
    const now = new Date(2026, 8, 16, 15, 59);
    expect(isCycleComplete('2026-09-16', cycleEnd, now)).toBe(false);
  });

  it('is true today at and after the cycle end time', () => {
    expect(isCycleComplete('2026-09-16', cycleEnd, new Date(2026, 8, 16, 16, 0))).toBe(true);
    expect(isCycleComplete('2026-09-16', cycleEnd, new Date(2026, 8, 16, 18, 30))).toBe(true);
  });

  it('falls back to 16:00 when the setting is malformed', () => {
    expect(isCycleComplete('2026-09-16', 'nonsense', new Date(2026, 8, 16, 15, 0))).toBe(false);
    expect(isCycleComplete('2026-09-16', 'nonsense', new Date(2026, 8, 16, 17, 0))).toBe(true);
  });
});

describe('relativeDayLabel', () => {
  const now = new Date(2026, 8, 16, 10, 0);

  it('labels the neighbouring days', () => {
    expect(relativeDayLabel('2026-09-16', now)).toBe('Today');
    expect(relativeDayLabel('2026-09-15', now)).toBe('Yesterday');
    expect(relativeDayLabel('2026-09-17', now)).toBe('Tomorrow');
  });

  it('returns null for anything further away', () => {
    expect(relativeDayLabel('2026-09-10', now)).toBeNull();
  });
});
