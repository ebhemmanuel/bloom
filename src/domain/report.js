import { STATUS, DERIVED_STATUS, STATUS_GLYPH, STATUS_LABEL } from './constants.js';
import { buildResolveContext, effectiveStatus, summarise } from './resolve.js';
import { activeStudentsFor, activeAssignmentsFor } from './seed.js';
import { eachDateInRange, isWeekend, todayKey, isoTimestamp, formatDateLong } from './dates.js';
import { assignmentConfig } from './schema.js';
import { matchesSearch, buildSearchIndex } from './selectors.js';

/**
 * Assemble the printable compliance record. Pure.
 *
 * The report is a DIFFERENT model from the board: the board is an input surface
 * keyed by status, this is a document keyed by date. They deliberately share no
 * markup, only `effectiveStatus` — which is what guarantees the paper and the
 * screen can never disagree.
 */

/** School days in range: weekdays that are not marked non-instructional. */
export function schoolDaysIn(doc, from, to) {
  const skip = new Set(doc.schoolCalendar?.nonInstructionalDates || []);
  return eachDateInRange(from, to).filter((d) => !isWeekend(d) && !skip.has(d));
}

/**
 * The two scopes a teacher actually asks for.
 *
 * "Everything so far" covers the year-end case without needing a third option —
 * at the end of the year, everything so far IS the year.
 */
export function resolveScope(doc, scope, now = new Date()) {
  const today = todayKey(now);

  if (scope.kind === 'range' && scope.from && scope.to) {
    return { from: scope.from, to: scope.to };
  }

  // Everything up to and including today, starting from the first day that has
  // any record (or the term start, whichever is known).
  const recorded = Object.keys(doc.days || {}).sort();
  const from = doc.schoolCalendar?.termStart || recorded[0] || today;
  return { from, to: today };
}

export function buildReport(doc, { scope, periodIds = [], search = '', now = new Date() } = {}) {
  const { from, to } = resolveScope(doc, scope, now);
  const dates = schoolDaysIn(doc, from, to);

  const ctx = buildResolveContext(doc);
  const catalogById = new Map(doc.catalog.map((c) => [c.id, c]));
  const searchIndex = buildSearchIndex(doc);
  const periodFilter = new Set(periodIds);

  const teacher =
    doc.teachers.find((t) => t.id === doc.settings?.activeTeacherId) || doc.teachers[0] || null;

  const students = [];

  for (const student of activeStudentsFor(doc, to)) {
    if (periodFilter.size > 0 && !(student.periodIds || []).some((p) => periodFilter.has(p))) {
      continue;
    }
    if (!matchesSearch(searchIndex, student.id, search)) continue;

    const rows = [];
    const allStatuses = [];
    const details = [];
    const notes = [];

    for (const assignment of activeAssignmentsFor(doc, student.id, to)) {
      const cfg = assignmentConfig(assignment, catalogById);
      const cells = [];

      for (const date of dates) {
        const resolved = effectiveStatus(doc, date, student.id, assignment.id, now, ctx);
        cells.push({ date, status: resolved, glyph: STATUS_GLYPH[resolved] || '·' });

        // Irrelevant accommodations are excluded from this class's totals.
        if (!assignment.notRelevant) allStatuses.push(resolved);

        const entry = doc.days?.[date]?.students?.[student.id]?.entries?.[assignment.id];
        if (entry?.detail?.trim()) {
          details.push({ date, label: entry.labelSnapshot || cfg.label, detail: entry.detail });
        }
      }

      rows.push({
        assignmentId: assignment.id,
        // The snapshot from the first day it appears, so a later rename cannot
        // rewrite what this report said it was.
        label: cells.length
          ? doc.days?.[cells[0].date]?.students?.[student.id]?.entries?.[assignment.id]
              ?.labelSnapshot || cfg.label
          : cfg.label,
        notRelevant: Boolean(assignment.notRelevant),
        cells,
        summary: summarise(cells.map((c) => c.status)),
      });
    }

    for (const date of dates) {
      const text = doc.days?.[date]?.students?.[student.id]?.notes;
      if (text?.trim()) notes.push({ date, text });
    }

    students.push({
      student,
      displayName: student.displayName,
      planType: student.planType,
      sasid: student.sasid,
      periodNames: (student.periodIds || [])
        .map((id) => ctx.periodsById.get(id)?.shortName)
        .filter(Boolean),
      rows,
      notes,
      details,
      summary: summarise(allStatuses),
      // Every school day in range is a day this student was expected. Periods
      // record which class someone is in, not when it runs.
      metDays: dates.length,
    });
  }

  // Whole-day context: handoff notes and any day the TEACHER was out. An auditor
  // reading a thin week needs the reason on the same page as the gaps.
  const dayContext = dates
    .map((date) => {
      const day = doc.days?.[date];
      if (!day) return null;
      if (!day.notes?.trim() && !day.teacherAbsence) return null;
      return { date, notes: day.notes || '', teacherAbsence: day.teacherAbsence || null };
    })
    .filter(Boolean);

  return {
    teacher,
    from,
    to,
    dates,
    schoolDayCount: dates.length,
    generatedAt: isoTimestamp(now),
    students,
    dayContext,
    totals: summarise(students.flatMap((s) => s.rows.flatMap((r) => r.cells.map((c) => c.status)))),
  };
}

/** Legend for the glyph table, in the order it should print. */
export const REPORT_LEGEND = [
  STATUS.USED,
  STATUS.USED_WITH_DETAIL,
  STATUS.REFUSED,
  STATUS.NOT_USED,
  DERIVED_STATUS.ABSENT,
  DERIVED_STATUS.TEACHER_ABSENT,
  DERIVED_STATUS.NOT_APPLICABLE,
  DERIVED_STATUS.NO_RECORD,
].map((id) => ({ id, glyph: STATUS_GLYPH[id], label: STATUS_LABEL[id] }));

/** "0%" is a damning thing to print when there was nothing to measure. */
export function formatRate(rate) {
  return rate === null || rate === undefined ? '—' : `${Math.round(rate * 100)}%`;
}

export function formatRangeLabel(from, to) {
  return from === to ? formatDateLong(from) : `${formatDateLong(from)} – ${formatDateLong(to)}`;
}
