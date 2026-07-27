import { STATUS, RESOLVED_BY, COUNTABLE_STATUSES } from './constants.js';
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
      // A repeat count only means something for statuses where it was used at
      // all. Moving a card to Refused or back to Unassigned resets it, so a
      // stale "×3" can never linger on a card that claims no usage.
      useCount: COUNTABLE_STATUSES.includes(status) ? entry.useCount || 1 : 1,
      resolvedBy: status === STATUS.UNASSIGNED ? null : RESOLVED_BY.USER,
      resolvedAt: null,
      updatedAt: status === STATUS.UNASSIGNED ? null : stamp,
    };

    return { ...studentDay, entries: { ...studentDay.entries, [assignmentId]: nextEntry } };
  });
}

/**
 * Record that an accommodation was used more than once in the day.
 *
 * Only valid on Used / Used with Detail — a count on Refused or Unassigned would
 * be claiming repeated use of something that was not used.
 */
export function setEntryUseCount(doc, dateKey, studentId, assignmentId, count, now = new Date()) {
  const clamped = Math.max(1, Math.min(99, Math.round(Number(count) || 1)));
  const stamp = isoTimestamp(now);

  return replaceStudentDay(doc, dateKey, studentId, (studentDay) => {
    const entry = studentDay.entries?.[assignmentId];
    if (!entry) return studentDay;
    if (!COUNTABLE_STATUSES.includes(entry.status)) return studentDay;
    if ((entry.useCount || 1) === clamped) return studentDay;

    return {
      ...studentDay,
      entries: {
        ...studentDay.entries,
        [assignmentId]: {
          ...entry,
          useCount: clamped,
          resolvedBy: RESOLVED_BY.USER,
          updatedAt: stamp,
        },
      },
    };
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
 * Marking absent resets every card to Unassigned — a student who was not there
 * cannot have received anything, so leaving a "Used" behind would be a false
 * record. Details are deliberately KEPT: they are the teacher's own words, and a
 * mis-click followed by an undo must not destroy them.
 */
export function setStudentAbsent(doc, dateKey, studentId, absent, reason = null) {
  return replaceStudentDay(doc, dateKey, studentId, (studentDay) => {
    if (!absent) {
      return { ...studentDay, absent: false, absenceReason: null };
    }

    const entries = {};
    for (const [id, entry] of Object.entries(studentDay.entries || {})) {
      entries[id] =
        entry.status === STATUS.UNASSIGNED
          ? entry
          : {
              ...entry,
              status: STATUS.UNASSIGNED,
              useCount: 1,
              resolvedBy: null,
              resolvedAt: null,
              updatedAt: null,
            };
    }

    return { ...studentDay, absent: true, absenceReason: reason, entries };
  });
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
      case 'setUseCount':
        return setEntryUseCount(
          acc,
          patch.dateKey,
          patch.studentId,
          patch.assignmentId,
          patch.count,
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

// --- standing defaults ------------------------------------------------------

/**
 * Set (or clear) a standing default for one student's accommodation.
 *
 * From the day it is set onward, every newly-seeded day starts this entry at
 * `status` instead of `unassigned`, so a permanent arrangement is not re-marked
 * 180 times a year. Pass `status: null` to clear.
 *
 * Only affects days created AFTER this point, plus optionally the day in view via
 * `applyToDate`. It deliberately does not walk backwards over history — silently
 * rewriting weeks of past records because a default was added in March is exactly
 * the kind of retroactive edit the amendment log exists to prevent.
 */
export function setAssignmentDefault(
  doc,
  assignmentId,
  status,
  { detail = '', applyToDate = null, now = new Date() } = {}
) {
  const next = {
    ...doc,
    assignments: doc.assignments.map((a) =>
      a.id === assignmentId
        ? { ...a, defaultStatus: status || null, defaultDetail: status ? detail : '' }
        : a
    ),
  };

  if (!applyToDate) return next;

  // Apply to the visible day too, but only if the teacher hasn't already decided
  // this entry themselves — a default must never overwrite an observation.
  const day = next.days?.[applyToDate];
  const assignment = next.assignments.find((a) => a.id === assignmentId);
  if (!day || day.sealed || !assignment) return next;

  const studentDay = day.students?.[assignment.studentId];
  const entry = studentDay?.entries?.[assignmentId];
  if (!entry) return next;
  if (entry.resolvedBy === RESOLVED_BY.USER) return next;

  const stamp = isoTimestamp(now);
  const nextEntry = status
    ? {
        ...entry,
        status,
        detail,
        resolvedBy: RESOLVED_BY.DEFAULT,
        resolvedAt: null,
        updatedAt: stamp,
      }
    : { ...entry, status: STATUS.UNASSIGNED, detail: '', resolvedBy: null, updatedAt: null };

  return {
    ...next,
    days: {
      ...next.days,
      [applyToDate]: {
        ...day,
        students: {
          ...day.students,
          [assignment.studentId]: {
            ...studentDay,
            entries: { ...studentDay.entries, [assignmentId]: nextEntry },
          },
        },
      },
    },
  };
}

// --- subject relevance ------------------------------------------------------

/**
 * Mark an accommodation as not relevant to this teacher's subject (or undo it).
 *
 * Marking it also resets the entry on the day in view to unassigned and clears
 * any standing default — leaving a "Used" behind on a card that no longer counts
 * would be a claim about something this teacher does not deliver.
 */
export function setAssignmentNotRelevant(
  doc,
  assignmentId,
  notRelevant,
  { applyToDate = null, now = new Date() } = {}
) {
  const next = {
    ...doc,
    assignments: doc.assignments.map((a) =>
      a.id === assignmentId
        ? {
            ...a,
            notRelevant: Boolean(notRelevant),
            // A default on an irrelevant accommodation would keep re-asserting
            // delivery every morning, so clear it on the way in.
            defaultStatus: notRelevant ? null : a.defaultStatus,
            defaultDetail: notRelevant ? '' : a.defaultDetail,
          }
        : a
    ),
  };

  if (!notRelevant || !applyToDate) return next;

  const assignment = next.assignments.find((a) => a.id === assignmentId);
  const day = next.days?.[applyToDate];
  if (!assignment || !day || day.sealed) return next;

  const studentDay = day.students?.[assignment.studentId];
  const entry = studentDay?.entries?.[assignmentId];
  if (!entry) return next;

  return {
    ...next,
    days: {
      ...next.days,
      [applyToDate]: {
        ...day,
        students: {
          ...day.students,
          [assignment.studentId]: {
            ...studentDay,
            entries: {
              ...studentDay.entries,
              [assignmentId]: {
                ...entry,
                status: STATUS.UNASSIGNED,
                // The detail is kept: if this is undone, the teacher's words
                // should still be there rather than silently destroyed.
                useCount: 1,
                resolvedBy: null,
                resolvedAt: null,
                updatedAt: null,
              },
            },
          },
        },
      },
    },
  };
}

// --- day notes & teacher absence --------------------------------------------

/** Whole-day handoff notes — for a substitute, or for tomorrow-you. */
export function setDayNotes(doc, dateKey, notes, now = new Date()) {
  const day = doc.days?.[dateKey];
  if (!day || day.notes === notes) return doc;

  return {
    ...doc,
    days: {
      ...doc.days,
      [dateKey]: { ...day, notes, notesUpdatedAt: isoTimestamp(now) },
    },
  };
}

/** The line an absence report appends to the day notes. */
export function absenceLine(reason, text) {
  const detail = String(text || '').trim();
  return `Absence — ${reason}${detail ? `: ${detail}` : ''}`;
}

/**
 * Record that the teacher was out, and append that context to the day notes.
 *
 * Both halves matter: the structured record drives the notification and the
 * printed report header, and the appended line means the note itself reads
 * correctly to a human skimming it.
 */
export function reportTeacherAbsence(doc, dateKey, reason, text, now = new Date()) {
  const day = doc.days?.[dateKey];
  if (!day || day.sealed) return doc;

  const line = absenceLine(reason, text);
  const notes = day.notes ? `${day.notes.replace(/\s*$/, '')}\n${line}` : line;

  return {
    ...doc,
    days: {
      ...doc.days,
      [dateKey]: {
        ...day,
        notes,
        notesUpdatedAt: isoTimestamp(now),
        teacherAbsence: { reason, text: String(text || '').trim(), reportedAt: isoTimestamp(now) },
      },
    },
  };
}

/** Undo an absence report, removing both the record and the appended line. */
export function clearTeacherAbsence(doc, dateKey, now = new Date()) {
  const day = doc.days?.[dateKey];
  if (!day || !day.teacherAbsence) return doc;

  const line = absenceLine(day.teacherAbsence.reason, day.teacherAbsence.text);
  const notes = (day.notes || '')
    .split('\n')
    .filter((l) => l.trim() !== line)
    .join('\n')
    .replace(/\s*$/, '');

  return {
    ...doc,
    days: {
      ...doc.days,
      [dateKey]: { ...day, notes, notesUpdatedAt: isoTimestamp(now), teacherAbsence: null },
    },
  };
}

// --- settings & roster ------------------------------------------------------

export function updateSettings(doc, changes) {
  return { ...doc, settings: { ...doc.settings, ...changes } };
}

/**
 * Rename a period. Clearing the name restores the default "Period N".
 *
 * The label propagates everywhere it appears because every consumer reads
 * `period.name` rather than caching a copy.
 */
export function renamePeriod(doc, periodId, name) {
  return {
    ...doc,
    periods: doc.periods.map((p) => {
      if (p.id !== periodId) return p;
      const trimmed = String(name || '').trim();
      return { ...p, name: trimmed || `Period ${p.sortOrder}` };
    }),
  };
}

/** Edit the active teacher's own details (name, subjects, grades, school, room). */
export function updateTeacher(doc, teacherId, changes) {
  return {
    ...doc,
    teachers: doc.teachers.map((t) => (t.id === teacherId ? { ...t, ...changes } : t)),
  };
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
