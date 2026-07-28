import { createEmptyDoc } from './schema.js';
import { addPeriod, addCatalogEntry } from './mutations.js';
import { addStudentWithAccommodations } from './importStudent.js';
import { allStarterItems } from './starterSets.js';
import { newTeacherId } from './ids.js';
import { isoTimestamp, todayKey } from './dates.js';
import { DEFAULT_CYCLE_END_TIME, DEFAULT_REMINDERS, PLAN_TYPES } from './constants.js';

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
 * Starter wordings carry a `requiresDetail` flag that the picker does not show.
 *
 * A student who gets "Text read aloud" needs a written detail each day, and that
 * obligation comes from the accommodation rather than from anything the teacher
 * chose in onboarding. Losing the flag here would silently drop it.
 */
function resolveStarterItem(label) {
  const match = allStarterItems().find((i) => i.label === label);
  return match || { label, category: 'other', requiresDetail: false };
}

/**
 * @param {object} answers
 * @param {string} answers.name
 * @param {string[]} answers.subjects
 * @param {string[]} answers.grades
 * @param {number[]} answers.periods  period numbers, e.g. [1, 3, 5]
 * @param {Record<number, string>} answers.periodNames  optional spoken names
 * @param {string} answers.endTime
 * @param {Record<string, boolean>} answers.reminders
 * @param {Array<{name: string, plan: string, accoms: string[]}>} answers.students
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
        planType: PLAN_TYPES.includes(student.plan) ? student.plan : 'IEP',
        // Onboarding does not ask which period each student is in; that is a
        // question with no good answer this early. Everyone starts in every
        // period the teacher named, and the roster screens narrow it later.
        periodIds: allPeriodIds,
        accommodations: (student.accoms || []).map(resolveStarterItem),
      },
      now
    );
    doc = next;
  }

  return doc;
}
