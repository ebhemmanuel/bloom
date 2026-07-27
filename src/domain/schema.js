import {
  STATUS,
  SEED_MODE,
  RESOLVED_BY,
  PLAN_TYPES,
  DEFAULTABLE_STATUSES,
  DEFAULT_CYCLE_END_TIME,
  DEFAULT_IDLE_LOCK_MINUTES,
} from './constants.js';
import { isoTimestamp, isValidDateKey, todayKey } from './dates.js';

/** Bump whenever the shape changes, and add a migration in ./migrations. */
export const CURRENT_SCHEMA_VERSION = 1;

export const APP_NAME = 'accommodations-tracker';

/** Product name, as it appears in the UI and on printed reports. */
export const PRODUCT_NAME = 'Bloom';

// --- Coercion helpers ------------------------------------------------------

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const asArray = (v) => (Array.isArray(v) ? v : []);
const asString = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const asBool = (v, fallback = false) => (typeof v === 'boolean' ? v : fallback);
const asIntIn = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
};
const asNullableString = (v) => (typeof v === 'string' && v.length > 0 ? v : null);

const VALID_STATUSES = new Set(Object.values(STATUS));

// --- Empty document --------------------------------------------------------

export function createEmptyDoc(now = new Date()) {
  const stamp = isoTimestamp(now);
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    app: {
      name: APP_NAME,
      createdAt: stamp,
      lastOpenedAt: stamp,
      lastWrittenBy: { version: null, host: null },
    },
    settings: {
      activeTeacherId: null,
      onboardingCompletedAt: null,
      cycleEndTime: DEFAULT_CYCLE_END_TIME,
      autoSealOnStartup: true,
      copyPreviousDayMode: SEED_MODE.STRUCTURE,
      idleLockMinutes: DEFAULT_IDLE_LOCK_MINUTES,
      lastKnownDate: todayKey(now),
      theme: 'light',
    },
    schoolCalendar: {
      termStart: null,
      termEnd: null,
      nonInstructionalDates: [],
    },
    teachers: [],
    periods: [],
    students: [],
    catalog: [],
    assignments: [],
    days: {},
  };
}

// --- Normalisation ---------------------------------------------------------

/**
 * Forgiving, coercing normaliser - NOT a validator.
 *
 * It repairs whatever it can and reports what it did. It must never throw and
 * must never refuse to open a file. For a compliance tool, "your record won't
 * open" is the worst possible failure mode: a teacher who hand-edited the JSON
 * and broke a comma should still get their year back.
 *
 * That is also why this is not zod. The goal is repair, not rejection.
 *
 * @returns {{ doc: object, repairs: string[] }}
 */
export function normalizeDoc(raw, now = new Date()) {
  const repairs = [];
  const note = (msg) => repairs.push(msg);

  if (!isObj(raw)) {
    return {
      doc: createEmptyDoc(now),
      repairs: ['File was not a JSON object - started a new record.'],
    };
  }

  const base = createEmptyDoc(now);
  const doc = { ...base };

  // --- version -------------------------------------------------------------
  doc.schemaVersion = asIntIn(raw.schemaVersion, 0, 9999, CURRENT_SCHEMA_VERSION);

  // --- app -----------------------------------------------------------------
  const app = isObj(raw.app) ? raw.app : {};
  doc.app = {
    name: asString(app.name, APP_NAME),
    createdAt: asString(app.createdAt, base.app.createdAt),
    lastOpenedAt: isoTimestamp(now),
    lastWrittenBy: isObj(app.lastWrittenBy)
      ? {
          version: asNullableString(app.lastWrittenBy.version),
          host: asNullableString(app.lastWrittenBy.host),
        }
      : { version: null, host: null },
  };

  // --- settings ------------------------------------------------------------
  const s = isObj(raw.settings) ? raw.settings : {};
  const cycleEndTime = /^\d{1,2}:\d{2}$/.test(s.cycleEndTime)
    ? s.cycleEndTime
    : DEFAULT_CYCLE_END_TIME;
  if (s.cycleEndTime !== undefined && cycleEndTime !== s.cycleEndTime) {
    note(`Cycle end time was invalid; reset to ${DEFAULT_CYCLE_END_TIME}.`);
  }
  doc.settings = {
    activeTeacherId: asNullableString(s.activeTeacherId),
    onboardingCompletedAt: asNullableString(s.onboardingCompletedAt),
    cycleEndTime,
    autoSealOnStartup: asBool(s.autoSealOnStartup, true),
    copyPreviousDayMode:
      s.copyPreviousDayMode === SEED_MODE.FULL ? SEED_MODE.FULL : SEED_MODE.STRUCTURE,
    idleLockMinutes: asIntIn(s.idleLockMinutes, 0, 240, DEFAULT_IDLE_LOCK_MINUTES),
    lastKnownDate: isValidDateKey(s.lastKnownDate) ? s.lastKnownDate : todayKey(now),
    theme: s.theme === 'dark' ? 'dark' : 'light',
  };

  // --- school calendar -----------------------------------------------------
  const cal = isObj(raw.schoolCalendar) ? raw.schoolCalendar : {};
  const nonInstructional = asArray(cal.nonInstructionalDates).filter(isValidDateKey);
  if (nonInstructional.length !== asArray(cal.nonInstructionalDates).length) {
    note('Removed invalid dates from the non-instructional list.');
  }
  doc.schoolCalendar = {
    termStart: isValidDateKey(cal.termStart) ? cal.termStart : null,
    termEnd: isValidDateKey(cal.termEnd) ? cal.termEnd : null,
    nonInstructionalDates: [...new Set(nonInstructional)].sort(),
  };

  // --- teachers ------------------------------------------------------------
  const teacherIds = new Set();
  doc.teachers = asArray(raw.teachers)
    .filter(isObj)
    .map((t) => ({
      id: asString(t.id),
      displayName: asString(t.displayName),
      // Collected during onboarding. Personalises the printed report header;
      // deliberately NOT used in any compliance calculation.
      subjects: [...new Set(asArray(t.subjects).filter((x) => typeof x === 'string'))],
      gradeLevels: [...new Set(asArray(t.gradeLevels).filter((x) => typeof x === 'string'))],
      school: asString(t.school),
      room: asString(t.room),
      createdAt: asString(t.createdAt, base.app.createdAt),
    }))
    .filter((t) => {
      if (!t.id || teacherIds.has(t.id)) {
        if (t.id) note(`Removed a duplicate teacher record (${t.id}).`);
        return false;
      }
      teacherIds.add(t.id);
      return true;
    });

  if (doc.settings.activeTeacherId && !teacherIds.has(doc.settings.activeTeacherId)) {
    note('Active teacher no longer exists; cleared the selection.');
    doc.settings.activeTeacherId = null;
  }
  if (!doc.settings.activeTeacherId && doc.teachers.length > 0) {
    doc.settings.activeTeacherId = doc.teachers[0].id;
  }

  // --- periods -------------------------------------------------------------
  const periodIds = new Set();
  doc.periods = asArray(raw.periods)
    .filter(isObj)
    .map((p, i) => {
      // A period is a grouping and a filter, nothing more. It carries no
      // schedule: every period a student is in is one this teacher delivers in,
      // so nothing about a period can make an accommodation not applicable.
      // Any `meetingDays` left in an older file is dropped here.
      return {
        id: asString(p.id),
        teacherId: asNullableString(p.teacherId),
        name: asString(p.name, `Period ${i + 1}`),
        shortName: asString(p.shortName, `P${i + 1}`),
        sortOrder: asIntIn(p.sortOrder, 0, 9999, i),
        archivedAt: asNullableString(p.archivedAt),
      };
    })
    .filter((p) => {
      if (!p.id || periodIds.has(p.id)) return false;
      periodIds.add(p.id);
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // --- students ------------------------------------------------------------
  const studentIds = new Set();
  doc.students = asArray(raw.students)
    .filter(isObj)
    .map((st, i) => {
      const kept = asArray(st.periodIds).filter((id) => periodIds.has(id));
      if (kept.length !== asArray(st.periodIds).length) {
        note(
          `Removed a reference to a deleted period from ${asString(st.displayName, 'a student')}.`
        );
      }
      const first = asString(st.firstName);
      const last = asString(st.lastName);
      return {
        id: asString(st.id),
        teacherId: asNullableString(st.teacherId),
        firstName: first,
        lastName: last,
        displayName: asString(st.displayName, [first, last].filter(Boolean).join(' ')),
        periodIds: [...new Set(kept)],
        planType: PLAN_TYPES.includes(st.planType) ? st.planType : 'IEP',
        /** State-Assigned Student ID, as it appears in the district's system. */
        sasid: asString(st.sasid),
        planRef: asString(st.planRef),
        caseManager: asString(st.caseManager),
        sortOrder: asIntIn(st.sortOrder, 0, 99999, i),
        active: asBool(st.active, true),
        /**
         * The student left this class on this date.
         *
         * A soft end, never a delete: they disappear from that day FORWARD while
         * every earlier day keeps them exactly as recorded. Deleting the row
         * instead would take their year-to-date compliance history with it,
         * which is the one thing this file exists to preserve.
         */
        unenrolledFrom: isValidDateKey(st.unenrolledFrom) ? st.unenrolledFrom : null,
        /**
         * The student joined this class on this date - the mirror of the above.
         *
         * Set when a student is added part-way through the year. Every day before
         * it resolves as `not_applicable`, never `not_used`: they were not in the
         * program, so there was no accommodation to deliver and no failure to
         * record. The board locks those days and says why.
         */
        enrolledFrom: isValidDateKey(st.enrolledFrom) ? st.enrolledFrom : null,
        archivedAt: asNullableString(st.archivedAt),
        createdAt: asString(st.createdAt, base.app.createdAt),
      };
    })
    .filter((st) => {
      if (!st.id || studentIds.has(st.id)) return false;
      studentIds.add(st.id);
      return true;
    });

  // --- catalog -------------------------------------------------------------
  const catalogIds = new Set();
  doc.catalog = asArray(raw.catalog)
    .filter(isObj)
    .map((c) => ({
      id: asString(c.id),
      label: asString(c.label, 'Untitled accommodation'),
      category: asString(c.category, 'other'),
      requiresDetail: asBool(c.requiresDetail, false),
      detailPrompt: asNullableString(c.detailPrompt),
      bulkEligible: asBool(c.bulkEligible, true),
      bulkActions: asArray(c.bulkActions).filter((x) => typeof x === 'string'),
      archived: asBool(c.archived, false),
      createdAt: asString(c.createdAt, base.app.createdAt),
    }))
    .filter((c) => {
      if (!c.id || catalogIds.has(c.id)) return false;
      catalogIds.add(c.id);
      return true;
    });

  // --- assignments ---------------------------------------------------------
  const assignmentIds = new Set();
  doc.assignments = asArray(raw.assignments)
    .filter(isObj)
    .map((a, i) => {
      const source = a.source === 'custom' ? 'custom' : 'catalog';
      return {
        id: asString(a.id),
        studentId: asString(a.studentId),
        source,
        catalogId: source === 'catalog' ? asNullableString(a.catalogId) : null,
        label: source === 'custom' ? asString(a.label, 'Untitled accommodation') : null,
        category: source === 'custom' ? asString(a.category, 'other') : null,
        requiresDetail: source === 'custom' ? asBool(a.requiresDetail, false) : null,
        detailPrompt: source === 'custom' ? asNullableString(a.detailPrompt) : null,
        bulkEligible: source === 'custom' ? asBool(a.bulkEligible, false) : null,
        bulkActions:
          source === 'custom' ? asArray(a.bulkActions).filter((x) => typeof x === 'string') : null,
        sortOrder: asIntIn(a.sortOrder, 0, 99999, i * 10),
        /**
         * Standing default for this student's accommodation. When set, each new
         * day is seeded with this status instead of `unassigned`, so a permanent
         * arrangement does not have to be re-marked 180 times.
         *
         * Only `used` and `used_with_detail` are defaultable - defaulting
         * `not_used` would fabricate non-delivery.
         */
        defaultStatus: DEFAULTABLE_STATUSES.includes(a.defaultStatus) ? a.defaultStatus : null,
        /** Optional boilerplate detail written alongside a defaulted entry. */
        defaultDetail: asString(a.defaultDetail),
        /**
         * Not relevant to THIS teacher's subject.
         *
         * A student's plan is written for their whole schedule, so it can list
         * accommodations that mean nothing in this room - "read aloud" in a PE
         * class. Marking it excludes the card from this class's totals and makes
         * it resolve NOT_APPLICABLE, never NOT_USED: the accommodation is not
         * this teacher's to deliver, so it must never read as one they missed.
         */
        notRelevant: asBool(a.notRelevant, false),
        // activeFrom/activeTo are how an accommodation is "removed" without
        // erasing the months of history that reference it.
        //
        // activeFrom doubles as the spec's `assignedFrom`: an accommodation added
        // mid-year records from that day FORWARD only, so earlier days never
        // retroactively gain a card and get sealed as Not Used. Deliberately one
        // field rather than two - a second date meaning the same thing is a
        // correctness hazard the moment they disagree.
        activeFrom: isValidDateKey(a.activeFrom) ? a.activeFrom : null,
        activeTo: isValidDateKey(a.activeTo) ? a.activeTo : null,
        createdAt: asString(a.createdAt, base.app.createdAt),
      };
    })
    .filter((a) => {
      if (!a.id || assignmentIds.has(a.id)) return false;
      if (!studentIds.has(a.studentId)) {
        note('Removed an accommodation attached to a student who no longer exists.');
        return false;
      }
      if (a.source === 'catalog' && !catalogIds.has(a.catalogId)) {
        note('Removed an accommodation pointing at a deleted catalog entry.');
        return false;
      }
      assignmentIds.add(a.id);
      return true;
    });

  // --- days ----------------------------------------------------------------
  const rawDays = isObj(raw.days) ? raw.days : {};
  const days = {};
  let coercedStatuses = 0;
  let droppedEntries = 0;

  for (const [dateKey, rawDay] of Object.entries(rawDays)) {
    if (!isValidDateKey(dateKey) || !isObj(rawDay)) {
      note(`Discarded an unreadable day record (${dateKey}).`);
      continue;
    }

    const rawStudents = isObj(rawDay.students) ? rawDay.students : {};
    const students = {};

    for (const [sid, rawStudent] of Object.entries(rawStudents)) {
      if (!studentIds.has(sid) || !isObj(rawStudent)) {
        droppedEntries += 1;
        continue;
      }

      const rawEntries = isObj(rawStudent.entries) ? rawStudent.entries : {};
      const entries = {};

      for (const [asgId, rawEntry] of Object.entries(rawEntries)) {
        if (!assignmentIds.has(asgId) || !isObj(rawEntry)) {
          droppedEntries += 1;
          continue;
        }
        let status = rawEntry.status;
        if (!VALID_STATUSES.has(status)) {
          status = STATUS.UNASSIGNED;
          coercedStatuses += 1;
        }
        entries[asgId] = {
          status,
          detail: asString(rawEntry.detail),
          /**
           * How many times it was used that day. 1 unless the teacher recorded a
           * repeat. Capped at 99 so a stray paste cannot claim an absurd number
           * on an audited record.
           */
          useCount: asIntIn(rawEntry.useCount, 1, 99, 1),
          // Written when the entry is created and never updated. It is what
          // makes an old printed report still say what it said at the time,
          // even after the catalog wording changes.
          labelSnapshot: asString(rawEntry.labelSnapshot),
          resolvedBy: Object.values(RESOLVED_BY).includes(rawEntry.resolvedBy)
            ? rawEntry.resolvedBy
            : null,
          resolvedAt: asNullableString(rawEntry.resolvedAt),
          updatedAt: asNullableString(rawEntry.updatedAt),
        };
      }

      students[sid] = {
        absent: asBool(rawStudent.absent, false),
        absenceReason: asNullableString(rawStudent.absenceReason),
        notes: asString(rawStudent.notes),
        notesUpdatedAt: asNullableString(rawStudent.notesUpdatedAt),
        entries,
      };
    }

    const rawAbsence = isObj(rawDay.teacherAbsence) ? rawDay.teacherAbsence : null;

    days[dateKey] = {
      date: dateKey,
      createdAt: asString(rawDay.createdAt, base.app.createdAt),
      /**
       * Whole-day handoff notes - for a substitute, or for tomorrow-you.
       * Distinct from the per-student notes in `students[].notes`.
       */
      notes: asString(rawDay.notes),
      notesUpdatedAt: asNullableString(rawDay.notesUpdatedAt),
      /**
       * The TEACHER was out. Printed in the report header for the date, so a
       * sparse day carries its own explanation rather than reading as neglect.
       */
      teacherAbsence: rawAbsence
        ? {
            reason: asString(rawAbsence.reason),
            text: asString(rawAbsence.text),
            reportedAt: asNullableString(rawAbsence.reportedAt),
          }
        : null,
      seededFrom: isValidDateKey(rawDay.seededFrom) ? rawDay.seededFrom : null,
      seedMode: rawDay.seedMode === SEED_MODE.FULL ? SEED_MODE.FULL : SEED_MODE.STRUCTURE,
      /**
       * This day's structure was created in bulk back to the start of the year,
       * not by a teacher working that day.
       *
       * It is what lets the grid exist for every school day - so nothing has to
       * be created before it can be filled in - WITHOUT the mere existence of the
       * record asserting that nothing was delivered. An entry nobody has touched
       * on a backfilled day resolves as `no_record`, not `not_used`. The moment
       * the teacher records anything on that entry, it behaves like any other.
       */
      backfilled: asBool(rawDay.backfilled, false),
      sealed: asBool(rawDay.sealed, false),
      sealedAt: asNullableString(rawDay.sealedAt),
      sealedBy:
        rawDay.sealedBy === RESOLVED_BY.AUTO || rawDay.sealedBy === RESOLVED_BY.USER
          ? rawDay.sealedBy
          : null,
      amended: asBool(rawDay.amended, false),
      amendments: asArray(rawDay.amendments).filter(isObj),
    };
    days[dateKey].students = students;
  }

  if (coercedStatuses > 0) {
    note(`Reset ${coercedStatuses} unrecognised status value(s) to Unassigned.`);
  }
  if (droppedEntries > 0) {
    note(`Removed ${droppedEntries} record(s) referring to deleted students or accommodations.`);
  }

  doc.days = days;
  return { doc, repairs };
}

/**
 * The label to show for an assignment: catalog entries resolve through the
 * catalog, custom ones carry their own.
 */
export function assignmentLabel(assignment, catalogById) {
  if (!assignment) return '';
  if (assignment.source === 'custom') return assignment.label || 'Untitled accommodation';
  return catalogById.get(assignment.catalogId)?.label || 'Untitled accommodation';
}

/**
 * Resolves the effective per-assignment config, merging catalog defaults.
 *
 * Note `defaultStatus` / `defaultDetail` always come from the ASSIGNMENT, never
 * the catalog entry, in both branches. A standing default is a decision about one
 * student ("Marcus always has preferential seating"), not a property of the
 * accommodation itself - putting it on the catalog would silently apply it to
 * every student who shares that accommodation.
 */
export function assignmentConfig(assignment, catalogById) {
  if (!assignment) return null;
  if (assignment.source === 'custom') {
    return {
      label: assignment.label || 'Untitled accommodation',
      category: assignment.category || 'other',
      requiresDetail: Boolean(assignment.requiresDetail),
      detailPrompt: assignment.detailPrompt,
      bulkEligible: Boolean(assignment.bulkEligible),
      bulkActions: assignment.bulkActions || [],
      defaultStatus: assignment.defaultStatus ?? null,
      defaultDetail: assignment.defaultDetail || '',
    };
  }
  const c = catalogById.get(assignment.catalogId);
  return {
    label: c?.label || 'Untitled accommodation',
    category: c?.category || 'other',
    requiresDetail: Boolean(c?.requiresDetail),
    detailPrompt: c?.detailPrompt ?? null,
    bulkEligible: Boolean(c?.bulkEligible),
    bulkActions: c?.bulkActions || [],
    // From the assignment, not the catalog - see the note above.
    defaultStatus: assignment.defaultStatus ?? null,
    defaultDetail: assignment.defaultDetail || '',
  };
}

/** Is this assignment in force on the given date? */
export function isAssignmentActiveOn(assignment, dateKey) {
  if (!assignment) return false;
  if (assignment.activeFrom && dateKey < assignment.activeFrom) return false;
  if (assignment.activeTo && dateKey > assignment.activeTo) return false;
  return true;
}
