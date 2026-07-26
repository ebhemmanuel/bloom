import { STATUS, DERIVED_STATUS, RESOLVED_BY } from './constants.js';
import { isoTimestamp, weekdayCode, isCycleComplete, compareDateKeys, todayKey } from './dates.js';
import { isAssignmentActiveOn } from './schema.js';

/**
 * End-of-cycle resolution. The compliance-correctness core of the app.
 *
 * Everything — the board on screen and the printed PDF — reads status through
 * `effectiveStatus`, so there is exactly one source of truth and no way for what
 * a teacher sees to disagree with what an auditor reads.
 *
 * All functions here are pure and take `now` explicitly. That is what makes the
 * whole thing testable, and it is why this layer exists separately from React
 * and from Electron.
 */

/** Build the lookup maps `effectiveStatus` needs. Cheap; cache per render. */
export function buildResolveContext(doc) {
  const studentsById = new Map(doc.students.map((s) => [s.id, s]));
  const periodsById = new Map(doc.periods.map((p) => [p.id, p]));
  const assignmentsById = new Map(doc.assignments.map((a) => [a.id, a]));
  const nonInstructional = new Set(doc.schoolCalendar?.nonInstructionalDates || []);
  return { studentsById, periodsById, assignmentsById, nonInstructional };
}

/**
 * Does this student have any class on this date?
 *
 * A student may sit in several periods; if ANY of them meets that weekday, the
 * day counts. A student with no periods assigned yet is treated as meeting every
 * day — otherwise a half-finished roster would silently mark a whole term "not
 * applicable" and hide real gaps.
 */
export function studentMeetsOn(student, dateKey, ctx) {
  if (!student) return false;
  const periodIds = student.periodIds || [];
  if (periodIds.length === 0) return true;

  const weekday = weekdayCode(dateKey);
  return periodIds.some((pid) => {
    const period = ctx.periodsById.get(pid);
    if (!period || period.archivedAt) return false;
    return (period.meetingDays || []).includes(weekday);
  });
}

/**
 * Resolve the status to display or print.
 *
 * Precedence, in order:
 *   1. non-instructional date / period doesn't meet / assignment not yet or no
 *      longer in force              → not_applicable
 *   2. no day record exists at all  → no_record
 *   3. student marked absent        → absent
 *   4. entry has a real status      → that status
 *   5. day is sealed                → not_used
 *   6. date is in the past          → not_used
 *   7. today, past cycleEndTime     → not_used
 *   8. otherwise                    → unassigned
 *
 * Note on 1 vs 2: `not_applicable` is checked before `no_record` because it is
 * strictly more informative. A Wednesday when the class does not meet should
 * print "n/a", not "no record" — there was never an obligation to record
 * anything. Neither can ever become `not_used`, so the guarantee below holds
 * either way.
 *
 * @returns {string} one of STATUS.* or DERIVED_STATUS.*
 */
export function effectiveStatus(doc, dateKey, studentId, assignmentId, now = new Date(), ctx) {
  const c = ctx || buildResolveContext(doc);

  // 1 — no obligation on this date
  if (c.nonInstructional.has(dateKey)) return DERIVED_STATUS.NOT_APPLICABLE;

  const student = c.studentsById.get(studentId);
  if (!studentMeetsOn(student, dateKey, c)) return DERIVED_STATUS.NOT_APPLICABLE;

  const assignment = c.assignmentsById.get(assignmentId);
  if (!isAssignmentActiveOn(assignment, dateKey)) return DERIVED_STATUS.NOT_APPLICABLE;

  // 2 — nothing was ever recorded for this date
  const day = doc.days?.[dateKey];
  if (!day) return DERIVED_STATUS.NO_RECORD;

  const studentDay = day.students?.[studentId];
  if (!studentDay) return DERIVED_STATUS.NO_RECORD;

  // 3 — absent students are excluded from the compliance denominator entirely
  if (studentDay.absent) return DERIVED_STATUS.ABSENT;

  // 4 — an explicit decision always wins
  const entry = studentDay.entries?.[assignmentId];
  if (!entry) return DERIVED_STATUS.NO_RECORD;
  if (entry.status && entry.status !== STATUS.UNASSIGNED) return entry.status;

  // 5/6/7 — the cycle closed with nothing recorded
  if (day.sealed) return STATUS.NOT_USED;
  if (isCycleComplete(dateKey, doc.settings?.cycleEndTime, now)) return STATUS.NOT_USED;

  // 8
  return STATUS.UNASSIGNED;
}

/** Statuses that mean "the teacher delivered this". */
const DELIVERED = new Set([STATUS.USED, STATUS.USED_WITH_DETAIL]);

/** Statuses excluded from the compliance denominator. */
const NOT_COUNTED = new Set([
  DERIVED_STATUS.ABSENT,
  DERIVED_STATUS.NOT_APPLICABLE,
  DERIVED_STATUS.NO_RECORD,
]);

export const isDelivered = (status) => DELIVERED.has(status);
export const countsTowardCompliance = (status) => !NOT_COUNTED.has(status);

/**
 * Delivery rate over a set of resolved statuses.
 *
 * Absences, non-applicable days, and days with no record are excluded from BOTH
 * numerator and denominator. A teacher must never be scored down for a day a
 * student wasn't there, and must never be scored down for a day nobody recorded
 * — the second one is a data gap, not a delivery failure, and the report says so
 * separately.
 */
export function summarise(statuses) {
  const counts = {
    [STATUS.UNASSIGNED]: 0,
    [STATUS.USED]: 0,
    [STATUS.USED_WITH_DETAIL]: 0,
    [STATUS.NOT_USED]: 0,
    [DERIVED_STATUS.ABSENT]: 0,
    [DERIVED_STATUS.NOT_APPLICABLE]: 0,
    [DERIVED_STATUS.NO_RECORD]: 0,
  };

  for (const s of statuses) {
    if (counts[s] === undefined) counts[s] = 0;
    counts[s] += 1;
  }

  const denominator = statuses.filter(countsTowardCompliance).length;
  const numerator = statuses.filter(isDelivered).length;

  return {
    counts,
    total: statuses.length,
    counted: denominator,
    delivered: numerator,
    // null, not 0, when there is nothing to measure. A report must be able to
    // print "—" rather than a damning "0%" for a week that was all holidays.
    rate: denominator > 0 ? numerator / denominator : null,
  };
}

// ---------------------------------------------------------------------------
// Sealing
// ---------------------------------------------------------------------------

/**
 * Materialise `not_used` onto every still-unassigned entry of a completed day,
 * then mark the day sealed. Pure — returns a new doc, never mutates the input.
 *
 * THE CRITICAL CONSTRAINT: this only ever touches dates that ALREADY have a
 * record in `doc.days`. Dates with no record are left absent from the map and
 * resolve to `no_record`.
 *
 * Why that matters: a teacher returns after three weeks off. A naive rollover
 * would stamp 15 days × every student × every accommodation as "not used" — on
 * paper, a catastrophic compliance failure they never committed. "No data was
 * recorded" and "the accommodation was not delivered" are different claims and
 * this function must never turn the first into the second.
 */
export function sealDay(doc, dateKey, now = new Date(), sealedBy = RESOLVED_BY.AUTO) {
  const day = doc.days?.[dateKey];

  // Never create a record in order to seal it. See above.
  if (!day) return doc;
  if (day.sealed) return doc;
  if (!isCycleComplete(dateKey, doc.settings?.cycleEndTime, now)) return doc;

  const ctx = buildResolveContext(doc);
  const stamp = isoTimestamp(now);
  const nextStudents = {};

  for (const [studentId, studentDay] of Object.entries(day.students || {})) {
    const nextEntries = {};

    for (const [assignmentId, entry] of Object.entries(studentDay.entries || {})) {
      if (entry.status !== STATUS.UNASSIGNED) {
        nextEntries[assignmentId] = entry;
        continue;
      }

      // Only materialise where the resolved answer really is "not used".
      // An absent student, a non-meeting weekday, or an expired assignment all
      // stay untouched at `unassigned` so history keeps its nuance.
      const resolved = effectiveStatus(doc, dateKey, studentId, assignmentId, now, ctx);
      if (resolved !== STATUS.NOT_USED) {
        nextEntries[assignmentId] = entry;
        continue;
      }

      nextEntries[assignmentId] = {
        ...entry,
        status: STATUS.NOT_USED,
        resolvedBy: RESOLVED_BY.AUTO,
        resolvedAt: stamp,
      };
    }

    nextStudents[studentId] = { ...studentDay, entries: nextEntries };
  }

  return {
    ...doc,
    days: {
      ...doc.days,
      [dateKey]: {
        ...day,
        students: nextStudents,
        sealed: true,
        sealedAt: stamp,
        sealedBy,
      },
    },
  };
}

/**
 * Seal every unsealed PAST day. Runs at startup and on the rollover tick.
 *
 * Deliberately never seals today, even once the clock is past `cycleEndTime`.
 * Teachers do this paperwork in the evening — sealing at 16:00 would make the
 * board read-only exactly when it is being used, forcing an Amend (with an audit
 * entry) for ordinary same-day data entry. Today still *displays* unassigned
 * entries as "Not Used" via `effectiveStatus` rules 6-7, so the teacher sees the
 * real default; it just stays editable until the date rolls over, or until they
 * press "Close out day" themselves.
 *
 * Only visits dates already present in `doc.days`, so a long absence costs
 * nothing and manufactures nothing.
 */
export function sealCompletedDays(doc, now = new Date(), sealedBy = RESOLVED_BY.AUTO) {
  const today = todayKey(now);
  let next = doc;
  for (const dateKey of Object.keys(doc.days || {})) {
    if (compareDateKeys(dateKey, today) >= 0) continue;
    next = sealDay(next, dateKey, now, sealedBy);
  }
  return next;
}

/**
 * Would the system clock have us travel backwards?
 *
 * A wrong BIOS clock or a district re-imaging event must never be able to unseal
 * a day or rewrite history. When this returns true the caller warns and skips
 * all automatic sealing for the session.
 */
export function clockMovedBackwards(doc, now = new Date()) {
  const last = doc.settings?.lastKnownDate;
  if (!last) return false;
  return compareDateKeys(todayKey(now), last) < 0;
}

export function isDayEditable(doc, dateKey, now = new Date()) {
  const day = doc.days?.[dateKey];
  if (day?.sealed) return false;
  return !isCycleComplete(dateKey, doc.settings?.cycleEndTime, now) || !day;
}

/**
 * Change one entry on a SEALED day, leaving an append-only audit trail.
 *
 * IEP records get audited, and a silent retroactive edit is exactly what an
 * auditor is looking for. The day stays `sealed: true`; the amendment log is
 * what makes the correction defensible rather than suspicious.
 */
export function amendEntry(
  doc,
  dateKey,
  studentId,
  assignmentId,
  changes,
  reason,
  now = new Date()
) {
  const day = doc.days?.[dateKey];
  if (!day) return doc;

  const studentDay = day.students?.[studentId];
  if (!studentDay) return doc;

  const entry = studentDay.entries?.[assignmentId];
  if (!entry) return doc;

  const stamp = isoTimestamp(now);
  const nextEntry = { ...entry, ...changes, updatedAt: stamp, resolvedBy: RESOLVED_BY.USER };

  return {
    ...doc,
    days: {
      ...doc.days,
      [dateKey]: {
        ...day,
        amended: true,
        amendments: [
          ...(day.amendments || []),
          {
            at: stamp,
            studentId,
            assignmentId,
            from: entry.status,
            to: nextEntry.status,
            reason: reason || null,
            by: doc.settings?.activeTeacherId || null,
          },
        ],
        students: {
          ...day.students,
          [studentId]: {
            ...studentDay,
            entries: { ...studentDay.entries, [assignmentId]: nextEntry },
          },
        },
      },
    },
  };
}
