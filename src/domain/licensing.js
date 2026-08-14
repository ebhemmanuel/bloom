import { compareDateKeys } from './dates.js';

/**
 * What a licence is for, and - more importantly - what it is never for.
 *
 * The rule is one sentence: THE FIRST SCHOOL YEAR IS FREE, IN FULL. Every
 * student, every accommodation, every day, every report. What a licence buys is
 * the right to start a SECOND year in the same record.
 *
 * Everything about that shape is deliberate.
 *
 * A caseload cap was the obvious alternative and it is wrong here. A real
 * caseload runs to thirty students, so any cap below that turns the free tier
 * into a demo that never survives September - and it would fall hardest on the
 * teachers carrying the most documentation, who are exactly the people this is
 * worth paying for. There is no number that works.
 *
 * A time limit is wrong for a different reason: it expires. A trial that lapses
 * in March locks a teacher out of a legal record of accommodations delivered to
 * disabled children, mid-year, over a billing state. Measuring YEARS IN THE
 * FILE rather than days on the clock means nothing can expire, and it cannot be
 * bypassed by changing the system clock either, because it is not reading one.
 *
 * And the moment it asks is the moment it is worth paying: a teacher setting up
 * next August, with a full year of printed evidence behind them.
 */

/**
 * NOTHING already recorded is ever gated.
 *
 * Reading, editing, printing and exporting every day already in the file stay
 * free forever, licence or not. If this function ever grows a second caller,
 * something has gone wrong with the argument above.
 */
export const GATED_ACTION = 'start-another-school-year';

/**
 * Which school year a date falls in, as the year it STARTED.
 *
 * August is the hinge: a US school year runs August to June, so January 2027
 * belongs to the year that began in August 2026. Without this, every teacher
 * would appear to start a second year on New Year's Day.
 */
export function schoolYearOf(dateKey) {
  if (!dateKey) return null;
  const [y, m] = dateKey.split('-').map(Number);
  return m >= 8 ? y : y - 1;
}

/**
 * The school years this record already covers, oldest first.
 *
 * Read from the days that exist rather than from a counter, so it cannot drift
 * from the truth and cannot be reset by editing a setting.
 */
export function recordedYears(doc) {
  const years = new Set();
  const start = doc?.schoolCalendar?.termStart;
  if (start) years.add(schoolYearOf(start));

  for (const dateKey of Object.keys(doc?.days || {})) {
    const day = doc.days[dateKey];
    // Laid-out days that were never worked do not make a year real - the
    // backfill creates those, and a teacher should not buy a licence because
    // the app drew them a calendar.
    if (day?.backfilled) continue;
    years.add(schoolYearOf(dateKey));
  }

  return [...years].filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
}

/**
 * Would setting the term start to `nextStart` begin a year this record has not
 * seen before?
 *
 * Only that. Moving the term start WITHIN the year already recorded - fixing
 * the date because school actually began on the 19th - is a correction, not a
 * new year, and must never ask for money.
 */
export function startsANewYear(doc, nextStart) {
  if (!nextStart) return false;
  const years = recordedYears(doc);
  if (years.length === 0) return false;
  return !years.includes(schoolYearOf(nextStart));
}

/**
 * The one question the UI asks.
 *
 * `licensed` comes from the main process, which verified a signature locally
 * with no network. A record already holding two or more years is never gated
 * either: whatever happened in the past, it is theirs.
 */
export function needsLicenceFor(doc, nextStart, licensed) {
  if (licensed) return false;
  return startsANewYear(doc, nextStart);
}

/**
 * How far through the free year they are, for the one honest nudge.
 *
 * Shown near the end of the first year so the ask is never a surprise, and
 * phrased as information rather than a countdown to being locked out - because
 * nothing locks.
 */
export function freeYearStatus(doc, licensed, today) {
  if (licensed) return { licensed: true };
  const years = recordedYears(doc);
  if (years.length === 0) return { licensed: false, started: false };

  const current = schoolYearOf(today);
  const first = years[0];
  return {
    licensed: false,
    started: true,
    firstYear: first,
    // June onward, in the first year. Early enough to plan, late enough to have
    // a year's worth of evidence in hand.
    nearingEnd: current === first && compareDateKeys(today, `${current + 1}-05-01`) >= 0,
  };
}
