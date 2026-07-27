import { createEmptyDoc } from './schema.js';
import { STATUS, SEED_MODE } from './constants.js';
import { isoTimestamp } from './dates.js';

/**
 * Fixture builder for domain tests. Keeps the test files about behaviour rather
 * than about assembling nested objects.
 *
 * Ids are fixed and readable so failures point somewhere obvious.
 */

export const T = {
  teacher: 'tch_1',
  p1: 'per_1', // meets Mon-Fri
  p3: 'per_3', // meets Mon/Wed/Fri only
  jordan: 'stu_jordan',
  priya: 'stu_priya',
  catExtTime: 'cat_ext_time',
  catReadAloud: 'cat_read_aloud',
  asgJordanExtTime: 'asg_j_ext',
  asgJordanReadAloud: 'asg_j_read',
  asgJordanCustom: 'asg_j_custom',
  asgPriyaExtTime: 'asg_p_ext',
};

export function makeDoc(overrides = {}) {
  const now = new Date(2026, 8, 16, 9, 0);
  const doc = createEmptyDoc(now);

  doc.settings.activeTeacherId = T.teacher;
  doc.settings.cycleEndTime = '16:00';
  doc.settings.lastKnownDate = '2026-09-16';

  doc.teachers = [
    {
      id: T.teacher,
      displayName: 'Ms. Rivera',
      subjects: ['Math'],
      gradeLevels: ['7', '8'],
      school: 'Northside Middle',
      room: '214',
      createdAt: isoTimestamp(now),
    },
  ];

  doc.periods = [
    {
      id: T.p1,
      teacherId: T.teacher,
      name: 'Period 1 — Algebra I',
      shortName: 'P1',
      sortOrder: 1,
      meetingDays: ['MO', 'TU', 'WE', 'TH', 'FR'],
      archivedAt: null,
    },
    {
      id: T.p3,
      teacherId: T.teacher,
      name: 'Period 3 — Geometry',
      shortName: 'P3',
      sortOrder: 3,
      meetingDays: ['MO', 'WE', 'FR'],
      archivedAt: null,
    },
  ];

  doc.students = [
    {
      id: T.jordan,
      teacherId: T.teacher,
      firstName: 'Jordan',
      lastName: 'Alvarez',
      displayName: 'Jordan A.',
      periodIds: [T.p1],
      planType: 'IEP',
      planRef: 'IEP-2026-0071',
      caseManager: 'D. Okafor',
      sortOrder: 1,
      active: true,
      archivedAt: null,
      createdAt: isoTimestamp(now),
    },
    {
      id: T.priya,
      teacherId: T.teacher,
      firstName: 'Priya',
      lastName: 'Raman',
      displayName: 'Priya R.',
      periodIds: [T.p3], // Mon/Wed/Fri only — used to exercise not_applicable
      planType: '504',
      planRef: '504-2026-0088',
      caseManager: 'D. Okafor',
      sortOrder: 2,
      active: true,
      archivedAt: null,
      createdAt: isoTimestamp(now),
    },
  ];

  doc.catalog = [
    {
      id: T.catExtTime,
      label: 'Extended time (1.5x) on assessments',
      category: 'timing',
      requiresDetail: false,
      detailPrompt: null,
      bulkEligible: true,
      bulkActions: ['mark_used'],
      archived: false,
      createdAt: isoTimestamp(now),
    },
    {
      id: T.catReadAloud,
      label: 'Text read aloud',
      category: 'presentation',
      requiresDetail: true,
      detailPrompt: 'What was read aloud, and by whom?',
      // Opts OUT of bulk on purpose: "read aloud to 28 students identically" is
      // not a claim a teacher should be able to make in one click.
      bulkEligible: false,
      bulkActions: [],
      archived: false,
      createdAt: isoTimestamp(now),
    },
  ];

  doc.assignments = [
    assignment(T.asgJordanExtTime, T.jordan, { catalogId: T.catExtTime, sortOrder: 10 }),
    assignment(T.asgJordanReadAloud, T.jordan, { catalogId: T.catReadAloud, sortOrder: 20 }),
    {
      id: T.asgJordanCustom,
      studentId: T.jordan,
      source: 'custom',
      catalogId: null,
      label: 'Sensory break pass — up to 2 per period',
      category: 'behavior',
      requiresDetail: true,
      detailPrompt: 'How many breaks, and roughly when?',
      bulkEligible: false,
      bulkActions: [],
      sortOrder: 30,
      activeFrom: '2026-09-08',
      activeTo: null,
      createdAt: isoTimestamp(now),
    },
    assignment(T.asgPriyaExtTime, T.priya, { catalogId: T.catExtTime, sortOrder: 10 }),
  ];

  return { ...doc, ...overrides };
}

function assignment(id, studentId, { catalogId, sortOrder }) {
  return {
    id,
    studentId,
    source: 'catalog',
    catalogId,
    label: null,
    category: null,
    requiresDetail: null,
    detailPrompt: null,
    bulkEligible: null,
    bulkActions: null,
    sortOrder,
    activeFrom: '2026-08-24',
    activeTo: null,
    createdAt: '2026-08-24T08:00:00.000-04:00',
  };
}

/**
 * Attach a day record. `entries` maps assignmentId → status or
 * { status, detail }. Anything omitted defaults to unassigned.
 */
export function withDay(doc, dateKey, spec = {}) {
  const students = {};

  for (const student of doc.students) {
    const studentSpec = spec[student.id];
    if (studentSpec === undefined && spec.__onlySpecified) continue;

    const entries = {};
    for (const a of doc.assignments.filter((x) => x.studentId === student.id)) {
      const raw = studentSpec?.entries?.[a.id];
      const status = typeof raw === 'string' ? raw : raw?.status || STATUS.UNASSIGNED;
      entries[a.id] = {
        status,
        detail: (typeof raw === 'object' && raw?.detail) || '',
        useCount: (typeof raw === 'object' && raw?.useCount) || 1,
        labelSnapshot: a.source === 'custom' ? a.label : 'snapshot',
        resolvedBy: status === STATUS.UNASSIGNED ? null : 'user',
        resolvedAt: null,
        updatedAt: status === STATUS.UNASSIGNED ? null : '2026-09-15T10:00:00.000-04:00',
      };
    }

    students[student.id] = {
      absent: Boolean(studentSpec?.absent),
      absenceReason: studentSpec?.absenceReason || null,
      notes: studentSpec?.notes || '',
      notesUpdatedAt: null,
      entries,
    };
  }

  return {
    ...doc,
    days: {
      ...doc.days,
      [dateKey]: {
        date: dateKey,
        createdAt: `${dateKey}T07:50:00.000-04:00`,
        seededFrom: null,
        seedMode: SEED_MODE.STRUCTURE,
        sealed: Boolean(spec.__sealed),
        sealedAt: spec.__sealed ? `${dateKey}T16:00:00.000-04:00` : null,
        sealedBy: spec.__sealed ? 'auto' : null,
        amended: false,
        amendments: [],
        students,
      },
    },
  };
}

/** Recursively freeze, so a test fails loudly if a "pure" function mutates. */
export function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  for (const value of Object.values(obj)) deepFreeze(value);
  return obj;
}
