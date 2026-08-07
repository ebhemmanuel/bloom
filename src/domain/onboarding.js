import { createEmptyDoc } from './schema.js';
import { addPeriod, addCatalogEntry } from './mutations.js';
import { addStudentWithAccommodations } from './importStudent.js';
import { resolveStarterItem } from './starterSets.js';
import { newTeacherId } from './ids.js';
import { isoTimestamp, todayKey } from './dates.js';
import {
  DEFAULT_CYCLE_END_TIME,
  DEFAULT_LOW_PERFORMANCE,
  DEFAULT_REMINDERS,
  normalizePlanType,
} from './constants.js';

/**
 * Turn everything onboarding collected into a document, in one pure step.
 *
 * Onboarding holds all of its answers locally and commits once, at the end. That
 * is not a style preference: a teacher who backs out of setup halfway, or closes
 * the laptop on the periods screen, should leave nothing behind. A half-written
 * profile on a compliance file is worse than no file, because the next launch
 * would skip onboarding and open a board built on it.
 *
 * Pure, and takes `now` explicitly, so the whole shape of a first run is
 * testable without React or Electron.
 */

/**
 * @param {object} answers
 * @param {string} answers.name
 * @param {string[]} answers.subjects
 * @param {string[]} answers.grades
 * @param {number[]} answers.periods  period numbers, e.g. [1, 3, 5]
 * @param {Record<number, string>} answers.periodNames  optional spoken names
 * @param {string} answers.endTime
 * @param {Record<string, boolean>} answers.reminders
 * @param {Array<{name: string, plan: string, periods: number[], enrolledFrom: string|null, accoms: string[]}>} answers.students
 * @param {string|null} answers.termStart
 */
export function buildOnboardedDoc(answers = {}, now = new Date()) {
  const {
    name = '',
    subjects = [],
    grades = [],
    periods = [],
    periodNames = {},
    endTime = DEFAULT_CYCLE_END_TIME,
    reminders = DEFAULT_REMINDERS,
    students = [],
    termStart = null,
  } = answers;

  let doc = createEmptyDoc(now);
  const stamp = isoTimestamp(now);
  const teacherId = newTeacherId();

  doc.teachers = [
    {
      id: teacherId,
      displayName: name.trim() || 'Teacher',
      subjects: [...subjects],
      gradeLevels: [...grades],
      school: '',
      room: '',
      createdAt: stamp,
    },
  ];

  doc.settings = {
    ...doc.settings,
    activeTeacherId: teacherId,
    onboardingCompletedAt: stamp,
    lastKnownDate: todayKey(now),
    cycleEndTime: endTime || DEFAULT_CYCLE_END_TIME,
    /*
      Setup hands the board over with the motion already off.

      Nothing about this machine is known at this point except that a district
      chose it, and the safe assumption about an unknown machine is the slow
      one. A first board that stutters reads as a broken app; a first board that
      is merely instant reads as a fast one. Appearance turns it back on.
    */
    lowPerformance: DEFAULT_LOW_PERFORMANCE,
    reminders: { ...DEFAULT_REMINDERS, ...reminders },
  };

  // The start of the year is what the backfill measures from, so a teacher
  // setting up in November opens to their year rather than to one empty day.
  doc.schoolCalendar = { ...doc.schoolCalendar, termStart: termStart || todayKey(now) };

  // Periods first: students reference them by id, so they have to exist before
  // the roster is built.
  const periodIdByNumber = {};
  for (const n of [...periods].sort((a, b) => a - b)) {
    const spoken = String(periodNames[n] || '').trim();
    const before = doc.periods.length;
    doc = addPeriod(doc, { name: spoken || `Period ${n}`, shortName: `P${n}` });
    if (doc.periods.length > before) periodIdByNumber[n] = doc.periods[doc.periods.length - 1].id;
  }

  const allPeriodIds = Object.values(periodIdByNumber);

  /** Chosen periods, or every one of them when the teacher did not narrow it. */
  const pickPeriods = (chosen) => {
    const ids = (chosen || []).map((n) => periodIdByNumber[n]).filter(Boolean);
    return ids.length ? ids : allPeriodIds;
  };

  /**
   * One preset to start from, whether or not any student was added.
   *
   * A teacher who skips the roster lands on a board with an empty preset list,
   * and the first thing they meet is a blank page rather than an example. This
   * is the most common accommodation there is and the least likely to be wrong
   * for anyone, so it seeds the catalog as a shape to copy rather than as a
   * recommendation. Nothing is assigned to any student by it.
   */
  const SEED_PRESET = 'Preferential seating (front, near instruction)';
  if (!doc.catalog.some((c) => c.label === SEED_PRESET)) {
    doc = addCatalogEntry(doc, resolveStarterItem(SEED_PRESET), now);
  }

  for (const student of students) {
    const label = String(student.name || '').trim();
    if (!label) continue;

    const { doc: next } = addStudentWithAccommodations(
      doc,
      {
        displayName: label,
        planType: normalizePlanType(student.plan),
        /**
         * Which classes they are in, if the teacher said.
         *
         * Everyone used to land in every period on the grounds that this was
         * too early to ask. But nothing downstream ever asked either, so a
         * roster built here could not be sorted or filtered by period without
         * going student by student through a screen that did not exist. Asking
         * on the roster row is cheap; leaving it unanswerable was not.
         *
         * Blank still means all of them. A teacher who does not answer has said
         * "they are in my class", and dropping them out of every period would
         * hide them from a filtered board entirely.
         */
        periodIds: pickPeriods(student.periods),
        /*
          Setup is where a whole roster arrives at once, and not all of it
          arrived on the same day. A student who joined in November is recorded
          from November, so the days before read "not applicable - enrolled"
          rather than counting against a class they were not in yet.
        */
        enrolledFrom: student.enrolledFrom || null,
        accommodations: (student.accoms || []).map(resolveStarterItem),
      },
      now
    );
    doc = next;
  }

  return doc;
}

/**
 * Which of the two setup screens the app owes the user, if either.
 *
 * Pure, and separate from App so it can be tested: getting this wrong strands a
 * teacher on the first run, which is the one moment they cannot work around.
 *
 * The DOCUMENT decides whether setup is finished, never the load status.
 * `loadStatus` is a snapshot of how the app booted and is never revisited, so a
 * boot with no pointer file kept reporting `needs-location` after the location
 * had been chosen and the document written - and the gate, reading it, kept
 * rendering onboarding on top of a finished setup. Onboarding's last phase is
 * the outro, so what a teacher saw was "One moment..." forever.
 *
 * `needsLocation` only says whether the flow should INCLUDE the folder step. It
 * cannot, by itself, hold anyone in onboarding.
 */
export function setupStage(doc, loadStatus) {
  const onboarded = Boolean(doc?.settings?.onboardingCompletedAt);
  const noPointer = loadStatus === 'needs-location' || loadStatus === 'needs-onboarding-location';

  return {
    showOnboarding: !onboarded,
    needsLocation: noPointer && !onboarded,
  };
}
