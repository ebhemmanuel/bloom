import { describe, it, expect } from 'vitest';
import {
  schoolYearOf,
  recordedYears,
  startsANewYear,
  needsLicenceFor,
  freeYearStatus,
} from './licensing.js';

/**
 * The gate is the only thing in this app that can say no to a teacher, so these
 * tests are mostly about what it must NEVER say no to.
 */

const docWith = (termStart, dates = [], opts = {}) => ({
  schoolCalendar: { termStart },
  days: Object.fromEntries(
    dates.map((d) => [d, { date: d, backfilled: Boolean(opts.backfilled) }])
  ),
});

describe('schoolYearOf', () => {
  it('hinges on August, so the spring term belongs to the year that started it', () => {
    expect(schoolYearOf('2026-08-13')).toBe(2026);
    expect(schoolYearOf('2026-12-20')).toBe(2026);
    // Without the hinge, every teacher would start a "new year" on 1 January.
    expect(schoolYearOf('2027-01-05')).toBe(2026);
    expect(schoolYearOf('2027-06-10')).toBe(2026);
    expect(schoolYearOf('2027-08-20')).toBe(2027);
  });
});

describe('recordedYears', () => {
  it('reads the years from the days that exist', () => {
    const doc = docWith('2026-08-17', ['2026-09-01', '2027-02-11']);
    expect(recordedYears(doc)).toEqual([2026]);
  });

  /*
    The backfill lays out every school day from the start of the year so a
    teacher never has to create a day before filling it in. Those are drawings,
    not work, and nobody should owe money because the app drew them a calendar.
  */
  it('ignores days the backfill created', () => {
    const doc = {
      schoolCalendar: { termStart: '2026-08-17' },
      days: {
        '2026-09-01': { date: '2026-09-01' },
        '2027-09-01': { date: '2027-09-01', backfilled: true },
      },
    };
    expect(recordedYears(doc)).toEqual([2026]);
  });
});

describe('the gate', () => {
  const doc = docWith('2026-08-17', ['2026-09-01', '2027-03-02']);

  it('asks when a second school year is started', () => {
    expect(startsANewYear(doc, '2027-08-19')).toBe(true);
    expect(needsLicenceFor(doc, '2027-08-19', false)).toBe(true);
  });

  /*
    The correction case. A teacher fixing the term start because school actually
    began on the 19th is not starting a year - and being asked for money over a
    typo is the fastest way to lose someone.
  */
  it('never asks when the date moves within the year already recorded', () => {
    expect(startsANewYear(doc, '2026-08-19')).toBe(false);
    expect(startsANewYear(doc, '2027-01-06')).toBe(false);
    expect(needsLicenceFor(doc, '2026-08-19', false)).toBe(false);
  });

  it('never asks a licensed teacher anything', () => {
    expect(needsLicenceFor(doc, '2027-08-19', true)).toBe(false);
  });

  it('never asks on a record that has not started yet', () => {
    const fresh = { schoolCalendar: {}, days: {} };
    expect(needsLicenceFor(fresh, '2026-08-17', false)).toBe(false);
  });

  /*
    The one that matters most. Whatever the licence state, a record that already
    holds two years keeps both: the gate is on STARTING a year, never on the
    years already in the file. Nothing recorded is ever taken away.
  */
  it('never gates a year already in the record', () => {
    const twoYears = docWith('2026-08-17', ['2026-09-01', '2027-09-01']);
    expect(recordedYears(twoYears)).toEqual([2026, 2027]);
    expect(needsLicenceFor(twoYears, '2027-09-01', false)).toBe(false);
    expect(needsLicenceFor(twoYears, '2026-10-01', false)).toBe(false);
  });
});

describe('the new-school-year notice', () => {
  /*
    Wired through deriveNotifications, and worth testing here because the
    condition is the licensing one: it fires when the calendar has moved past
    every year the record holds, and only then.
  */
  const doc = {
    ...docWith('2026-08-17', ['2026-09-01', '2027-03-02']),
    students: [{ id: 's1' }],
    settings: {},
  };

  it('says nothing during the year the record is in', async () => {
    const { deriveNotifications } = await import('./notifications.js');
    const items = deriveNotifications(doc, { now: new Date(2027, 2, 3) });
    expect(items.some((i) => i.id === 'new-school-year')).toBe(false);
  });

  it('speaks up once August of the next year arrives', async () => {
    const { deriveNotifications } = await import('./notifications.js');
    const items = deriveNotifications(doc, { now: new Date(2027, 7, 20) });
    const notice = items.find((i) => i.id === 'new-school-year');
    expect(notice).toBeTruthy();
    expect(notice.title).toBe('2027-2028 has started');
    // Unlicensed: names the price.
    expect(notice.body).toContain('$29');
  });

  it('drops the price for a licensed teacher and still gives the reminder', async () => {
    const { deriveNotifications } = await import('./notifications.js');
    const items = deriveNotifications(doc, { now: new Date(2027, 7, 20), licensed: true });
    const notice = items.find((i) => i.id === 'new-school-year');
    expect(notice).toBeTruthy();
    expect(notice.body).not.toContain('$29');
  });
});

describe('freeYearStatus', () => {
  const doc = docWith('2026-08-17', ['2026-09-01']);

  it('says nothing at all to a licensed teacher', () => {
    expect(freeYearStatus(doc, true, '2027-05-20')).toEqual({ licensed: true });
  });

  it('speaks up in the spring of the first year, not before', () => {
    expect(freeYearStatus(doc, false, '2026-11-04').nearingEnd).toBe(false);
    expect(freeYearStatus(doc, false, '2027-05-20').nearingEnd).toBe(true);
  });
});
