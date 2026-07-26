import { createEmptyDoc } from './schema.js';
import { isoTimestamp, todayKey } from './dates.js';
import { CATEGORIES } from './constants.js';

/**
 * A realistic starter classroom.
 *
 * Used by the "try it with sample data" path so the board can be evaluated
 * without typing a roster first, and as a fixture while onboarding is built.
 * The names are invented; nothing here is a real student.
 */

const CATALOG = [
  ['Extended time (1.5x) on assessments', 'timing', false, true],
  ['Preferential seating (front, near instruction)', 'setting', false, true],
  ['Text read aloud', 'presentation', true, false],
  ['Small-group testing', 'setting', false, true],
  ['Frequent breaks', 'environment', false, true],
  ['Copy of teacher notes / guided notes', 'presentation', false, true],
  ['Calculator permitted', 'response', false, true],
  ['Reduced-item assignments', 'response', true, false],
  ['Check for understanding / restate directions', 'presentation', false, true],
];

const STUDENTS = [
  ['Jordan', 'Alvarez', 'IEP', [0, 2, 5]],
  ['Priya', 'Raman', '504', [0, 1, 6]],
  ['Marcus', 'Bell', 'IEP', [0, 3, 4, 8]],
  ['Sofía', 'Núñez', '504', [1, 6]],
  ['Devon', 'Pierce', 'IEP', [0, 2, 3, 7]],
  ['Amelia', 'Chu', '504', [4, 8]],
  ['Tobias', 'Okafor', 'IEP', [0, 1, 5, 6]],
  ['Hana', 'Yamada', '504', [2, 8]],
];

export function createSampleDoc(now = new Date()) {
  const stamp = isoTimestamp(now);
  const doc = createEmptyDoc(now);

  doc.teachers = [
    {
      id: 'tch_sample',
      displayName: 'Ms. Rivera',
      subjects: ['Mathematics'],
      gradeLevels: ['7', '8'],
      school: 'Northside Middle School',
      room: '214',
      createdAt: stamp,
    },
  ];
  doc.settings.activeTeacherId = 'tch_sample';
  doc.settings.onboardingCompletedAt = stamp;

  doc.periods = [
    {
      id: 'per_1',
      shortName: 'P1',
      name: 'Period 1 — Algebra I',
      meetingDays: ['MO', 'TU', 'WE', 'TH', 'FR'],
    },
    { id: 'per_3', shortName: 'P3', name: 'Period 3 — Geometry', meetingDays: ['MO', 'WE', 'FR'] },
    { id: 'per_5', shortName: 'P5', name: 'Period 5 — Pre-Algebra', meetingDays: ['TU', 'TH'] },
  ].map((p, i) => ({
    ...p,
    teacherId: 'tch_sample',
    sortOrder: i + 1,
    archivedAt: null,
  }));

  doc.catalog = CATALOG.map(([label, category, requiresDetail, bulkEligible], i) => ({
    id: `cat_${i}`,
    label,
    category: CATEGORIES.some((c) => c.id === category) ? category : 'other',
    requiresDetail,
    detailPrompt: requiresDetail ? 'What was provided, and how?' : null,
    // Accommodations requiring a narrative opt out of bulk: "read aloud to 28
    // students identically" is not a claim a teacher should make in one click.
    bulkEligible,
    bulkActions: bulkEligible ? ['mark_used'] : [],
    archived: false,
    createdAt: stamp,
  }));

  const periodIdsFor = (i) => {
    if (i % 3 === 0) return ['per_1'];
    if (i % 3 === 1) return ['per_1', 'per_3'];
    return ['per_5'];
  };

  doc.students = STUDENTS.map(([firstName, lastName, planType], i) => ({
    id: `stu_${i}`,
    teacherId: 'tch_sample',
    firstName,
    lastName,
    displayName: `${firstName} ${lastName.charAt(0)}.`,
    periodIds: periodIdsFor(i),
    planType,
    planRef: `${planType}-2026-${String(1000 + i)}`,
    caseManager: 'D. Okafor',
    sortOrder: i,
    active: true,
    archivedAt: null,
    createdAt: stamp,
  }));

  doc.assignments = [];
  STUDENTS.forEach(([, , , catalogIndexes], studentIndex) => {
    catalogIndexes.forEach((catIndex, n) => {
      doc.assignments.push({
        id: `asg_${studentIndex}_${catIndex}`,
        studentId: `stu_${studentIndex}`,
        source: 'catalog',
        catalogId: `cat_${catIndex}`,
        label: null,
        category: null,
        requiresDetail: null,
        detailPrompt: null,
        bulkEligible: null,
        bulkActions: null,
        sortOrder: (n + 1) * 10,
        activeFrom: null,
        activeTo: null,
        createdAt: stamp,
      });
    });
  });

  // One student gets a custom one-off, to exercise that path.
  doc.assignments.push({
    id: 'asg_custom_0',
    studentId: 'stu_0',
    source: 'custom',
    catalogId: null,
    label: 'Sensory break pass — up to 2 per class period',
    category: 'behavior',
    requiresDetail: true,
    detailPrompt: 'How many breaks, and roughly when?',
    bulkEligible: false,
    bulkActions: [],
    sortOrder: 99,
    activeFrom: null,
    activeTo: null,
    createdAt: stamp,
  });

  doc.settings.lastKnownDate = todayKey(now);
  return doc;
}
