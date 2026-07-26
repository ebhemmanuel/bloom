import { STATUS, RESOLVED_BY } from './constants.js';
import { isoTimestamp } from './dates.js';
import { ensureDay } from './seed.js';

/**
 * Board mutations. Every function is pure and returns a new document.
 *
 * Each one refuses to touch a sealed day — corrections to history go through
 * `amendEntry` in resolve.js, which leaves an audit trail. Silently editing a
 * sealed day is precisely what an auditor looks for.
 */

function replaceStudentDay(doc, dateKey, studentId, updater) {
  const day = doc.days?.[dateKey];
  if (!day || day.sealed) return doc;

  const studentDay = day.students?.[studentId];
  if (!studentDay) return doc;

  const next = updater(studentDay);
  if (next === studentDay) return doc;

  return {
    ...doc,
    days: {
      ...doc.days,
      [dateKey]: {
        ...day,
        students: { ...day.students, [studentId]: next },
      },
    },
  };
}

/**
 * Set an entry's status, and its detail when moving into "Used with Detail".
 *
 * Moving back to Unassigned clears the detail: an unassigned entry carrying
 * leftover narrative would be a confusing half-record on a printed report.
 */
export function setEntryStatus(
  doc,
  dateKey,
  studentId,
  assignmentId,
  status,
  { detail, now = new Date() } = {}
) {
  const stamp = isoTimestamp(now);

  return replaceStudentDay(doc, dateKey, studentId, (studentDay) => {
    const entry = studentDay.entries?.[assignmentId];
    if (!entry) return studentDay;

    let nextDetail = entry.detail;
    if (detail !== undefined) nextDetail = detail;
    if (status === STATUS.UNASSIGNED) nextDetail = '';

    const nextEntry = {
      ...entry,
      status,
      detail: nextDetail,
      resolvedBy: status === STATUS.UNASSIGNED ? null : RESOLVED_BY.USER,
      resolvedAt: null,
      updatedAt: status === STATUS.UNASSIGNED ? null : stamp,
    };

    return { ...studentDay, entries: { ...studentDay.entries, [assignmentId]: nextEntry } };
  });
}

export function setEntryDetail(doc, dateKey, studentId, assignmentId, detail, now = new Date()) {
  const stamp = isoTimestamp(now);

  return replaceStudentDay(doc, dateKey, studentId, (studentDay) => {
    const entry = studentDay.entries?.[assignmentId];
    if (!entry) return studentDay;
    return {
      ...studentDay,
      entries: {
        ...studentDay.entries,
        [assignmentId]: { ...entry, detail, updatedAt: stamp },
      },
    };
  });
}

/** Per-student, per-day notes — the last column of the swimlane. */
export function setStudentNotes(doc, dateKey, studentId, notes, now = new Date()) {
  return replaceStudentDay(doc, dateKey, studentId, (studentDay) => {
    if (studentDay.notes === notes) return studentDay;
    return { ...studentDay, notes, notesUpdatedAt: isoTimestamp(now) };
  });
}

/**
 * Mark a student absent (or present again).
 *
 * Recorded statuses are deliberately preserved. Absence excludes the student
 * from the compliance denominator; it does not erase what a teacher already
 * noted, and a mis-click followed by an undo must not destroy data.
 */
export function setStudentAbsent(doc, dateKey, studentId, absent, reason = null) {
  return replaceStudentDay(doc, dateKey, studentId, (studentDay) => ({
    ...studentDay,
    absent: Boolean(absent),
    absenceReason: absent ? reason : null,
  }));
}

/** Toggle, reading current state from the doc. */
export function toggleStudentAbsent(doc, dateKey, studentId, reason = null) {
  const current = doc.days?.[dateKey]?.students?.[studentId]?.absent;
  return setStudentAbsent(doc, dateKey, studentId, !current, reason);
}

/**
 * Apply a batch of patches as one operation.
 *
 * Bulk actions return patches rather than mutating, so the whole batch folds
 * into a single document version — which is what makes one Ctrl+Z undo an entire
 * bulk action instead of unwinding it one card at a time.
 */
export function applyPatches(doc, patches, now = new Date()) {
  return patches.reduce((acc, patch) => {
    switch (patch.op) {
      case 'setStatus':
        return setEntryStatus(
          acc,
          patch.dateKey,
          patch.studentId,
          patch.assignmentId,
          patch.status,
          {
            detail: patch.detail,
            now,
          }
        );
      case 'setDetail':
        return setEntryDetail(
          acc,
          patch.dateKey,
          patch.studentId,
          patch.assignmentId,
          patch.detail,
          now
        );
      case 'setNotes':
        return setStudentNotes(acc, patch.dateKey, patch.studentId, patch.notes, now);
      case 'setAbsent':
        return setStudentAbsent(acc, patch.dateKey, patch.studentId, patch.absent, patch.reason);
      default:
        return acc;
    }
  }, doc);
}

// --- settings & roster ------------------------------------------------------

export function updateSettings(doc, changes) {
  return { ...doc, settings: { ...doc.settings, ...changes } };
}

export function touchLastKnownDate(doc, dateKey) {
  if (doc.settings?.lastKnownDate === dateKey) return doc;
  return updateSettings(doc, { lastKnownDate: dateKey });
}

export function completeOnboarding(doc, now = new Date()) {
  return updateSettings(doc, { onboardingCompletedAt: isoTimestamp(now) });
}

/** Ensure today's record exists and record that we opened it. */
export function openDay(doc, dateKey, now = new Date()) {
  return touchLastKnownDate(ensureDay(doc, dateKey, now), dateKey);
}
