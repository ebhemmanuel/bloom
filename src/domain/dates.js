import { WEEKDAYS } from './constants.js';

/**
 * Date handling.
 *
 * THE RULE: date keys are bare LOCAL calendar dates, `YYYY-MM-DD`.
 *
 * Never use `toISOString().slice(0, 10)` to produce one. That converts to UTC
 * first, so for any teacher west of Greenwich, anything recorded after ~7pm
 * local lands on the following day's sheet. On a compliance record that is a
 * falsified date, not a cosmetic bug. `dates.test.js` asserts this explicitly.
 *
 * Timestamps, by contrast, are full ISO strings WITH offset, so a laptop that
 * travels between timezones never rewrites the meaning of past history.
 */

const pad = (n, width = 2) => String(Math.abs(n)).padStart(width, '0');

/** Local calendar date → 'YYYY-MM-DD'. */
export function toDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today's local date key. */
export function todayKey(now = new Date()) {
  return toDateKey(now);
}

/** 'YYYY-MM-DD' → Date at LOCAL midnight. */
export function parseDateKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidDateKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const parsed = parseDateKey(key);
  return !Number.isNaN(parsed.getTime()) && toDateKey(parsed) === key;
}

/** Full ISO 8601 timestamp with local offset, e.g. 2026-09-16T07:48:22.517-04:00 */
export function isoTimestamp(now = new Date()) {
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
    `.${pad(now.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Shift a date key by n days. Handles month, year and DST boundaries. */
export function addDays(key, n) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

/** -1 | 0 | 1. Safe as a lexicographic compare because the format is fixed-width. */
export function compareDateKeys(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** 'MO' | 'TU' | … for a date key. */
export function weekdayCode(key) {
  return WEEKDAYS[parseDateKey(key).getDay()];
}

/**
 * What "no enrolment date of their own" actually means, in words.
 *
 * "Start of year" was a phrase standing in for a date nobody had chosen. Once
 * the first day of class is a real answer, the fields can say it - and where it
 * is still unset, they say so rather than implying a date exists.
 */
export function sinceTermLabel(termStart) {
  return termStart ? `Since ${formatDateMedium(termStart)}` : 'Start of year';
}

export function isWeekend(key) {
  const code = weekdayCode(key);
  return code === 'SA' || code === 'SU';
}

/** Inclusive list of date keys from start to end. Returns [] if end < start. */
export function eachDateInRange(startKey, endKey) {
  if (compareDateKeys(startKey, endKey) > 0) return [];
  const out = [];
  let cursor = startKey;
  // Guard against a malformed range spinning forever on a teacher's machine.
  let guard = 0;
  while (compareDateKeys(cursor, endKey) <= 0 && guard < 4000) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return out;
}

/**
 * Has the daily cycle closed for `dateKey`, as of `now`?
 *
 * True when the date is in the past, or it is today and the wall clock has
 * passed cycleEndTime ('HH:mm'). Used by resolve.js rules 6 and 7.
 */
export function isCycleComplete(dateKey, cycleEndTime, now = new Date()) {
  const today = todayKey(now);
  const cmp = compareDateKeys(dateKey, today);
  if (cmp < 0) return true;
  if (cmp > 0) return false;

  const [h, m] = String(cycleEndTime || '16:00')
    .split(':')
    .map(Number);
  const endMinutes = (Number.isFinite(h) ? h : 16) * 60 + (Number.isFinite(m) ? m : 0);
  return now.getHours() * 60 + now.getMinutes() >= endMinutes;
}

// --- Display helpers -------------------------------------------------------

const LONG = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
const MEDIUM = { weekday: 'short', month: 'short', day: 'numeric' };

export function formatDateLong(key) {
  return parseDateKey(key).toLocaleDateString(undefined, LONG);
}

export function formatDateMedium(key) {
  return parseDateKey(key).toLocaleDateString(undefined, MEDIUM);
}

/** Compact column header for the range report, e.g. "Mon 9/8". */
export function formatDateColumn(key) {
  const d = parseDateKey(key);
  return `${WEEKDAYS[d.getDay()].charAt(0)}${WEEKDAYS[d.getDay()].charAt(1).toLowerCase()} ${d.getMonth() + 1}/${d.getDate()}`;
}

/** Relative label for the toolbar: Today / Yesterday / Tomorrow, else null. */
export function relativeDayLabel(key, now = new Date()) {
  const today = todayKey(now);
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  if (key === addDays(today, 1)) return 'Tomorrow';
  return null;
}
