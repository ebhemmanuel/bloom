import { STATUS, SEED_MODE, RESOLVED_BY } from './constants.js';
import { isoTimestamp, addDays, compareDateKeys } from './dates.js';
import { assignmentConfig, isAssignmentActiveOn } from './schema.js';

/**
 * Creating and seeding day records.
 *
 * CRITICAL: nothing in here may be called automatically for an arbitrary past
 * date. Creating a record retroactively converts `no_record` into `unassigned`,
 * which the next seal turns into `not_used` — silently manufacturing documented
 * non-delivery for a day nobody ever worked on. `ensureDay` is therefore an
 * explicit action: it runs for today, or when a teacher deliberately opens a
 * past day and asks to start a record for it.
 */

/**
 * Students who should appear on the board for a given date.
 *
 * Deliberately NOT filtered by `createdAt`. That field records when the row was
 * typed into the app, which is not the same as when the student joined the class
 * — and treating it as an enrolment date breaks the most ordinary workflow there
 * is: set up the roster today, then backfill last week. Every student would
 * silently disappear from every past board.
 *
 * If per-student enrolment windows are ever needed, they belong in explicit
 * fields, the way assignments use activeFrom/activeTo.
 */
export function activeStudentsFor(doc, dateKey) {
  return (
    doc.students
      .filter((s) => s.active && !s.archivedAt)
      // Unenrolment is dated, not a flag: the student vanishes from that day
      // forward and stays put on every earlier one, so year-to-date history is
      // untouched while upcoming days stop carrying them.
      .filter((s) => !s.unenrolledFrom || dateKey < s.unenrolledFrom)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.lastName.localeCompare(b.lastName))
  );
}

/** Assignments in force for a student on a date, in display order. */
export function activeAssignmentsFor(doc, studentId, dateKey) {
  return doc.assignments
    .filter((a) => a.studentId === studentId)
    .filter((a) => isAssignmentActiveOn(a, dateKey))
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * A fresh entry for a new day.
 *
 * If the student has a standing default on this accommodation, the entry starts
 * at that status with `resolvedBy: 'default'` rather than `'user'`. The teacher
 * did not observe anything yet, and the record has to say so — otherwise a
 * permanent arrangement and a same-day observation become indistinguishable on an
 * audited document.
 */
function blankEntry(assignment, catalogById, stamp) {
  const cfg = assignmentConfig(assignment, catalogById);
  const hasDefault = Boolean(cfg.defaultStatus);

  return {
    status: hasDefault ? cfg.defaultStatus : STATUS.UNASSIGNED,
    detail: hasDefault ? cfg.defaultDetail || '' : '',
    useCount: 1,
    // Captured now and never updated. This is what makes a report printed in
    // June still say what the accommodation was called in September.
    labelSnapshot: cfg.label,
    resolvedBy: hasDefault ? RESOLVED_BY.DEFAULT : null,
    resolvedAt: null,
    updatedAt: hasDefault ? stamp : null,
  };
}

/**
 * Create the day record if it does not exist, and top it up with any assignments
 * added since it was created. Existing entries are never touched.
 *
 * Idempotent: calling it repeatedly on an unchanged roster returns the same doc
 * reference, so it is safe to call on every render or focus.
 */
export function ensureDay(doc, dateKey, now = new Date()) {
  const stamp = isoTimestamp(now);
  const catalogById = new Map(doc.catalog.map((c) => [c.id, c]));
  const existing = doc.days?.[dateKey];

  // Never modify a sealed day. Corrections go through amendEntry.
  if (existing?.sealed) return doc;

  const students = {};
  let changed = false;

  for (const student of activeStudentsFor(doc, dateKey)) {
    const prior = existing?.students?.[student.id];
    const entries = {};

    for (const assignment of activeAssignmentsFor(doc, student.id, dateKey)) {
      const priorEntry = prior?.entries?.[assignment.id];
      if (priorEntry) {
        entries[assignment.id] = priorEntry;
      } else {
        entries[assignment.id] = blankEntry(assignment, catalogById, stamp);
        changed = true;
      }
    }

    // An assignment that lapsed mid-term drops off future boards, but any entry
    // already recorded against it stays in the day it belongs to.
    if (prior) {
      for (const [asgId, entry] of Object.entries(prior.entries || {})) {
        if (!entries[asgId] && entry.status !== STATUS.UNASSIGNED) {
          entries[asgId] = entry;
        }
      }
    }

    if (!prior) changed = true;

    students[student.id] = {
      absent: prior?.absent ?? false,
      absenceReason: prior?.absenceReason ?? null,
      notes: prior?.notes ?? '',
      notesUpdatedAt: prior?.notesUpdatedAt ?? null,
      entries,
    };
  }

  if (existing && !changed) return doc;

  return {
    ...doc,
    days: {
      ...doc.days,
      [dateKey]: {
        date: dateKey,
        createdAt: existing?.createdAt || stamp,
        notes: existing?.notes ?? '',
        notesUpdatedAt: existing?.notesUpdatedAt ?? null,
        teacherAbsence: existing?.teacherAbsence ?? null,
        seededFrom: existing?.seededFrom ?? null,
        seedMode: existing?.seedMode ?? SEED_MODE.STRUCTURE,
        sealed: false,
        sealedAt: null,
        sealedBy: null,
        amended: existing?.amended ?? false,
        amendments: existing?.amendments ?? [],
        students,
      },
    },
  };
}

/**
 * True if the teacher has actually done something on this day.
 *
 * An entry seeded from a standing default does NOT count: it is a pre-set value
 * nobody has looked at yet. Counting it would make every freshly-opened day look
 * "already worked on", which would then make "Copy yesterday" refuse with a
 * would-overwrite warning on a day the teacher had not touched.
 */
export function dayHasWork(doc, dateKey) {
  const day = doc.days?.[dateKey];
  if (!day) return false;
  return Object.values(day.students || {}).some(
    (s) =>
      s.absent ||
      (s.notes && s.notes.length > 0) ||
      Object.values(s.entries || {}).some(
        (e) => e.status !== STATUS.UNASSIGNED && e.resolvedBy !== RESOLVED_BY.DEFAULT
      )
  );
}

/**
 * Seed a day from the previous one.
 *
 * `structure` (the default) copies only WHICH cards appear, resetting every
 * status to unassigned. `full` also copies statuses and details.
 *
 * The default must be `structure`. Copying yesterday's "Used" into today
 * produces a record asserting delivery that did not happen — that is a
 * fabricated compliance claim, not a convenience. `full` remains available
 * because some teachers genuinely run identical daily routines, but it is gated
 * behind an explicit confirmation and stamps `seedMode` for provenance.
 *
 * @returns {{ doc: object, applied: boolean, reason?: string, copied: number }}
 */
export function copyFromPreviousDay(
  doc,
  targetDate,
  { sourceDate, mode = SEED_MODE.STRUCTURE, force = false, now = new Date() } = {}
) {
  const from = sourceDate || findPreviousDayWithRecord(doc, targetDate);
  if (!from) return { doc, applied: false, reason: 'no-source', copied: 0 };

  const source = doc.days?.[from];
  if (!source) return { doc, applied: false, reason: 'no-source', copied: 0 };

  const target = doc.days?.[targetDate];
  if (target?.sealed) return { doc, applied: false, reason: 'sealed', copied: 0 };

  // Refuse to silently overwrite work already done today.
  if (!force && dayHasWork(doc, targetDate)) {
    return { doc, applied: false, reason: 'would-overwrite', copied: 0 };
  }

  const stamp = isoTimestamp(now);
  const catalogById = new Map(doc.catalog.map((c) => [c.id, c]));
  const seeded = ensureDay(doc, targetDate, now);
  const day = seeded.days[targetDate];

  const students = {};
  let copied = 0;

  for (const [studentId, studentDay] of Object.entries(day.students)) {
    const sourceStudent = source.students?.[studentId];
    const entries = {};

    for (const [asgId, entry] of Object.entries(studentDay.entries)) {
      if (mode !== SEED_MODE.FULL) {
        entries[asgId] = entry;
        continue;
      }

      const sourceEntry = sourceStudent?.entries?.[asgId];
      if (!sourceEntry || sourceEntry.status === STATUS.UNASSIGNED) {
        entries[asgId] = entry;
        continue;
      }

      entries[asgId] = {
        ...entry,
        status: sourceEntry.status,
        detail: sourceEntry.detail || '',
        resolvedBy: 'user',
        updatedAt: stamp,
      };
      copied += 1;
    }

    // Notes and absence are never copied under any mode. Yesterday's note is
    // about yesterday, and yesterday's absence says nothing about today.
    students[studentId] = { ...studentDay, entries };
  }

  return {
    doc: {
      ...seeded,
      days: {
        ...seeded.days,
        [targetDate]: { ...day, students, seededFrom: from, seedMode: mode },
      },
    },
    applied: true,
    copied,
    sourceDate: from,
  };
}

/** Walk backwards for the most recent date that already has a record. */
export function findPreviousDayWithRecord(doc, fromDate, maxLookback = 30) {
  const keys = Object.keys(doc.days || {})
    .filter((k) => compareDateKeys(k, fromDate) < 0)
    .sort();
  if (keys.length === 0) return null;

  const earliest = addDays(fromDate, -maxLookback);
  const candidate = keys[keys.length - 1];
  return compareDateKeys(candidate, earliest) >= 0 ? candidate : null;
}
