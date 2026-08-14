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
    // The plan type, so "504" or "iep" narrows the board to that group. It is
    // the one fact about a student that is on screen everywhere - the pill in
    // every lane header, the heading over every roster column - and typing it
    // into the search returned nothing.
    normalizeSearch(student.planType),
  ].filter(Boolean);
}

export function buildSearchIndex(doc) {
  const index = new Map();
  for (const student of doc.students) {
    index.set(student.id, studentSearchTerms(student));
  }
  return index;
}

/**
 * Every word has to land, and each may land somewhere different.
 *
 * The whole query used to be matched as one string, which made the field hold
 * exactly one filter at a time: "iep" narrowed to the IEP students and "iep
 * marcus" found nobody, because no single term contains both. Splitting on
 * whitespace and requiring ALL tokens - each against any term - is what lets a
 * plan type and a name be asked for together, and it stacks with the period
 * filter and the date, which were always separate.
 *
 * AND rather than OR: adding a word should narrow the board, never widen it.
 */
export function matchesSearch(index, studentId, query) {
  const q = normalizeSearch(query);
  if (!q) return true;
  const terms = index.get(studentId) || [];
  return q.split(/\s+/).every((token) => terms.some((t) => t.includes(token)));
}

/**
 * The board's read model for one date.
 *
 * Returns lanes even when no day record exists, so the UI can show the roster
 * with an honest "no record for this day" state rather than an empty screen.
 * That distinction is the whole point - see resolve.js.
 */
/**
 * What a lane files under: SURNAME, then forename to break the ties.
 *
 * The surname has to be found rather than read off a field. A student is stored
 * as one display label on purpose - a teacher may type initials or a code, and
 * the file need not hold a legal name - so `addStudentWithAccommodations` puts
 * the whole typed string in `lastName` and leaves `firstName` empty. That made
 * this function compare the string entire, so "Axel Nava" filed under A and
 * came out above "Caedyn Clement", which is a first-name sort wearing a
 * surname's name. Every register, IEP folder and district export files by
 * surname, and a class list in a different order than the one in the teacher's
 * hand is worse than no ordering at all.
 *
 * So: the LAST word is the surname, and the rest is the forename that breaks
 * ties between two of them. A bare single name is its own key - dropping those
 * to the top would be worse than filing them under what was actually typed -
 * and a genuinely split record still uses its own two fields.
 */
function laneSortKey(lane) {
  const last = (lane.student?.lastName || '').trim();
  const first = (lane.student?.firstName || '').trim();

  // A record with both halves filled in: believe it.
  if (last && first) return `${last} ${first}`;

  const whole = last || first || lane.displayName || '';
  const words = whole.split(/\s+/).filter(Boolean);
  if (words.length < 2) return whole;
  return `${words[words.length - 1]} ${words.slice(0, -1).join(' ')}`;
}

/**
 * Where a lane falls when the roster is ordered by period.
 *
 * The period's own `sortOrder`, not the digits in its name: a teacher who
 * renames "Period 3" to "Geometry" has not moved it, and reading a number out
 * of a label would put it wherever G happens to fall.
 *
 * A student in more than one of this teacher's periods files under the earliest,
 * which is where someone scanning for "who is in my first class" looks. One with
 * no period at all sorts last rather than first - an unassigned student is a
 * loose end, and loose ends belong at the bottom of a list, not the top of it.
 */
function lanePeriodRank(lane, periodsById) {
  const ranks = (lane.student?.periodIds || [])
    .map((id) => periodsById.get(id)?.sortOrder)
    .filter((n) => typeof n === 'number');
  // A finite sentinel, not Infinity: two unplaced lanes would subtract to NaN
  // and leave their order down to whatever the engine happened to do.
  return ranks.length ? Math.min(...ranks) : Number.MAX_SAFE_INTEGER;
}

export function buildBoardModel(
  doc,
  { dateKey, periodIds = [], search = '', sort = 'az', sortBy = 'name', now = new Date() }
) {
  const ctx = buildResolveContext(doc);
  const catalogById = new Map(doc.catalog.map((c) => [c.id, c]));
  const searchIndex = buildSearchIndex(doc);

  const day = doc.days?.[dateKey] || null;
  const hasRecord = Boolean(day);
  const sealed = Boolean(day?.sealed);
  const cycleClosed = isCycleComplete(dateKey, doc.settings?.cycleEndTime, now);
  const periodFilter = new Set(periodIds);

  const isNonInstructional = ctx.nonInstructional.has(dateKey);
  // School is either in session on a date or it is not - it is not a per-student
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

      // Excluded from this class's totals entirely - it is not this teacher's
      // accommodation to deliver, so counting it either way would be wrong.
      if (!notRelevant) resolvedStatuses.push(resolved);

      // Cards live in a droppable column by their STORED status. A resolved
      // not_used still sits in the Unassigned column, flagged - it must remain
      // visible and correctable, not vanish off the board.
      // Cards sit in a column by their STORED status. A resolved not_used still
      // sits in Unassigned, flagged - it must stay visible and correctable.
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
   * them counts toward the day's totals - there was no obligation - and the
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

  /**
   * Lane order, applied after both passes so pre-enrolment lanes sort in with
   * everyone else rather than collecting at the bottom.
   *
   * By SURNAME. This sorted on `displayName`, which is "David L." - so the
   * board filed David under D while the register, the IEP folder and every
   * district export file him under his surname. A class list a teacher has to
   * re-scan because it is in a different order than the one in their hand is
   * worse than no ordering at all.
   *
   * The roster's own `sortOrder` is insertion order, and "the order I happened
   * to type them in" stops being useful past a handful of students.
   *
   * `localeCompare` rather than `<`, so an accented name files where a reader
   * expects it instead of after Z.
   *
   * `sortBy: 'period'` puts the period first and keeps the name as the tiebreak,
   * so each class is still alphabetical inside itself.
   *
   * The direction applies to the NAMES ONLY, never to the classes. A-Z is P1
   * alphabetical then P2 alphabetical; Z-A is P1 reversed then P2 reversed.
   * Reversing the class order too - which is what a single `direction *` on the
   * whole comparison does - reads as the sort having broken: a teacher presses
   * a button labelled Z-A and their last class, plus everyone in no class at
   * all, jumps to the top of the board. The periods are the shape of the day
   * and they run forwards; A-Z is about names.
   */
  const direction = sort === 'za' ? -1 : 1;
  const byName = (a, b) => direction * laneSortKey(a).localeCompare(laneSortKey(b));
  const compare =
    sortBy === 'period'
      ? (a, b) =>
          lanePeriodRank(a, ctx.periodsById) - lanePeriodRank(b, ctx.periodsById) || byName(a, b)
      : byName;

  lanes.sort(compare);

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
    // No class meets on this date for anyone on the visible roster - a weekend, a
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

/**
 * The day this record starts.
 *
 * The term start when the teacher gave one, and otherwise the earliest day the
 * board holds. Used where a student has no enrolment date of their own and the
 * honest answer is "since the beginning" - a field showing that date reads as
 * an answer, where an empty one reads as information nobody entered.
 *
 * The fall-through matters: a file can reach here without a term start, from a
 * setup where that question was skipped or a document written by an older
 * version. Day keys are `YYYY-MM-DD`, so sorting them as text sorts them by
 * date.
 */
export function recordStartDate(doc) {
  const term = doc?.schoolCalendar?.termStart;
  if (term) return term;
  return Object.keys(doc?.days || {}).sort()[0] || '';
}
