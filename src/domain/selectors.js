import { STATUS, DERIVED_STATUS, DROPPABLE_STATUSES } from './constants.js';
import { assignmentConfig } from './schema.js';
import { buildResolveContext, effectiveStatus, summarise, isDelivered } from './resolve.js';
import { activeStudentsFor, activeAssignmentsFor, preEnrolmentStudentsFor } from './seed.js';
import { isCycleComplete, isWeekend } from './dates.js';

/**
 * Read models for the UI. Pure; the React layer wraps these in useMemo.
 */

/**
 * Fold case and accents so "Álvarez" is found by typing "alvarez".
 *
 * A teacher typing a student's name quickly should not have to produce
 * diacritics, and a roster imported from a district SIS will contain them.
 */
export function normalizeSearch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Searchable forms for one student. Built once per doc, not per keystroke.
 *
 * Includes "last, first" because that is how rosters are printed and how many
 * teachers think of their students.
 */
export function studentSearchTerms(student) {
  const first = normalizeSearch(student.firstName);
  const last = normalizeSearch(student.lastName);
  return [
    normalizeSearch(student.displayName),
    `${first} ${last}`.trim(),
    `${last} ${first}`.trim(),
    `${last}, ${first}`.trim(),
    last,
    first,
    normalizeSearch(student.planRef),
  ].filter(Boolean);
}

export function buildSearchIndex(doc) {
  const index = new Map();
  for (const student of doc.students) {
    index.set(student.id, studentSearchTerms(student));
  }
  return index;
}

export function matchesSearch(index, studentId, query) {
  const q = normalizeSearch(query);
  if (!q) return true;
  const terms = index.get(studentId) || [];
  return terms.some((t) => t.includes(q));
}

/**
 * The board's read model for one date.
 *
 * Returns lanes even when no day record exists, so the UI can show the roster
 * with an honest "no record for this day" state rather than an empty screen.
 * That distinction is the whole point — see resolve.js.
 */
export function buildBoardModel(doc, { dateKey, periodIds = [], search = '', now = new Date() }) {
  const ctx = buildResolveContext(doc);
  const catalogById = new Map(doc.catalog.map((c) => [c.id, c]));
  const searchIndex = buildSearchIndex(doc);

  const day = doc.days?.[dateKey] || null;
  const hasRecord = Boolean(day);
  const sealed = Boolean(day?.sealed);
  const cycleClosed = isCycleComplete(dateKey, doc.settings?.cycleEndTime, now);
  const periodFilter = new Set(periodIds);

  const isNonInstructional = ctx.nonInstructional.has(dateKey);
  // School is either in session on a date or it is not — it is not a per-student
  // question, because a period records which class someone is in, not when it
  // runs. Kept per-lane on the model so the UI does not have to know that.
  const meetsToday = !isNonInstructional && !isWeekend(dateKey);

  const lanes = [];
  let matchedButFiltered = 0;
  let anyMeeting = false;

  for (const student of activeStudentsFor(doc, dateKey)) {
    if (periodFilter.size > 0 && !(student.periodIds || []).some((p) => periodFilter.has(p))) {
      continue;
    }
    if (!matchesSearch(searchIndex, student.id, search)) {
      matchedButFiltered += 1;
      continue;
    }

    const studentDay = day?.students?.[student.id] || null;
    const assignments = activeAssignmentsFor(doc, student.id, dateKey);

    // A period says which class a student is in, nothing about when it runs, so
    // the only thing that can put a whole lane out of scope is the date itself.
    if (meetsToday) anyMeeting = true;

    const columns = {};
    for (const col of DROPPABLE_STATUSES) columns[col] = [];

    const resolvedStatuses = [];
    let detailsMissing = 0;

    for (const assignment of assignments) {
      const cfg = assignmentConfig(assignment, catalogById);
      const entry = studentDay?.entries?.[assignment.id] || null;
      const resolved = effectiveStatus(doc, dateKey, student.id, assignment.id, now, ctx);
      const notRelevant = Boolean(assignment.notRelevant);

      // Excluded from this class's totals entirely — it is not this teacher's
      // accommodation to deliver, so counting it either way would be wrong.
      if (!notRelevant) resolvedStatuses.push(resolved);

      // Cards live in a droppable column by their STORED status. A resolved
      // not_used still sits in the Unassigned column, flagged — it must remain
      // visible and correctable, not vanish off the board.
      // Cards sit in a column by their STORED status. A resolved not_used still
      // sits in Unassigned, flagged — it must stay visible and correctable.
      const stored = entry?.status || STATUS.UNASSIGNED;
      const column = DROPPABLE_STATUSES.includes(stored) ? stored : STATUS.UNASSIGNED;

      const needsDetail =
        !notRelevant &&
        cfg.requiresDetail &&
        isDelivered(resolved) &&
        !(entry?.detail || '').trim();
      if (needsDetail) detailsMissing += 1;

      columns[column].push({
        assignmentId: assignment.id,
        studentId: student.id,
        // Prefer the snapshot so the board agrees with what will print.
        label: entry?.labelSnapshot || cfg.label,
        category: cfg.category,
        requiresDetail: cfg.requiresDetail,
        detailPrompt: cfg.detailPrompt,
        isCustom: assignment.source === 'custom',
        bulkEligible: cfg.bulkEligible,
        bulkActions: cfg.bulkActions,
        status: stored,
        resolved,
        detail: entry?.detail || '',
        hasDetail: Boolean((entry?.detail || '').trim()),
        needsDetail,
        useCount: entry?.useCount || 1,
        notRelevant,
        // A standing default for this student, and whether this specific entry
        // came from it rather than from something the teacher observed today.
        // `defaultDetail` is the boilerplate written once when the default was
        // set, which is what keeps a daily accommodation from asking for the
        // same sentence 180 times.
        defaultStatus: cfg.defaultStatus,
        defaultDetail: cfg.defaultDetail || '',
        fromDefault: entry?.resolvedBy === 'default',
        notApplicable: resolved === DERIVED_STATUS.NOT_APPLICABLE,
        noRecord: resolved === DERIVED_STATUS.NO_RECORD,
      });
    }

    const summary = summarise(resolvedStatuses);

    lanes.push({
      studentId: student.id,
      student,
      meets: meetsToday,
      displayName: student.displayName || `${student.firstName} ${student.lastName}`.trim(),
      planType: student.planType,
      periodNames: (student.periodIds || [])
        .map((id) => ctx.periodsById.get(id)?.shortName)
        .filter(Boolean),
      absent: Boolean(studentDay?.absent),
      absenceReason: studentDay?.absenceReason || null,
      notes: studentDay?.notes || '',
      columns,
      assignmentCount: assignments.length,
      summary,
      detailsMissing,
      hasRecord: Boolean(studentDay),
      enrolledFrom: student.enrolledFrom || null,
      preEnrolment: false,
    });
  }

  /**
   * Students who had not joined this class yet on this date.
   *
   * Shown, but locked and empty, carrying the date they enrolled. Nothing about
   * them counts toward the day's totals — there was no obligation — and the
   * board says so rather than leaving a gap the teacher has to explain to
   * themselves.
   */
  for (const student of preEnrolmentStudentsFor(doc, dateKey)) {
    if (periodFilter.size > 0 && !(student.periodIds || []).some((p) => periodFilter.has(p))) {
      continue;
    }
    if (!matchesSearch(searchIndex, student.id, search)) continue;

    const columns = {};
    for (const col of DROPPABLE_STATUSES) columns[col] = [];

    lanes.push({
      studentId: student.id,
      student,
      meets: false,
      displayName: student.displayName || `${student.firstName} ${student.lastName}`.trim(),
      planType: student.planType,
      periodNames: (student.periodIds || [])
        .map((id) => ctx.periodsById.get(id)?.shortName)
        .filter(Boolean),
      absent: false,
      absenceReason: null,
      notes: '',
      columns,
      assignmentCount: 0,
      summary: summarise([]),
      detailsMissing: 0,
      hasRecord: false,
      enrolledFrom: student.enrolledFrom,
      preEnrolment: true,
    });
  }

  const allStatuses = lanes.flatMap((l) =>
    Object.values(l.columns).flatMap((cards) => cards.map((c) => c.resolved))
  );

  return {
    dateKey,
    hasRecord,
    sealed,
    cycleClosed,
    dayNotes: day?.notes || '',
    teacherAbsence: day?.teacherAbsence || null,
    editable: hasRecord && !sealed,
    isNonInstructional,
    // No class meets on this date for anyone on the visible roster — a weekend, a
    // holiday, or a day none of these periods run. Without this the board would
    // show a wall of ghosted, un-droppable cards and no reason why.
    noClassToday: lanes.length > 0 && !anyMeeting,
    lanes,
    laneCount: lanes.length,
    hiddenBySearch: matchedButFiltered,
    totals: summarise(allStatuses),
    // Surfaced so the toolbar can nudge before a teacher prints something with
    // "used with detail" cards that carry no detail.
    detailsMissing: lanes.reduce((n, l) => n + l.detailsMissing, 0),
  };
}

/** Periods that actually have students, for the filter chips. */
export function periodOptions(doc) {
  const counts = new Map();
  for (const s of doc.students) {
    if (!s.active || s.archivedAt) continue;
    for (const pid of s.periodIds || []) {
      counts.set(pid, (counts.get(pid) || 0) + 1);
    }
  }
  return doc.periods
    .filter((p) => !p.archivedAt)
    .map((p) => ({ ...p, studentCount: counts.get(p.id) || 0 }));
}

/** Column header counts for the board, by stored status. */
export function columnCounts(model) {
  const counts = {};
  for (const col of DROPPABLE_STATUSES) {
    counts[col] = model.lanes.reduce((n, lane) => n + lane.columns[col].length, 0);
  }
  return counts;
}
