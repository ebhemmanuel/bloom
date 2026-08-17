import { describe, it, expect } from 'vitest';
import { buildOnboardedDoc } from './onboarding.js';
import { effectiveStatus } from './resolve.js';
import { assignmentConfig } from './schema.js';
import { DEFAULT_CYCLE_END_TIME } from './constants.js';

const now = new Date(2026, 8, 16, 9, 0);

const answers = {
  name: 'Ms. Rivera',
  subjects: ['Mathematics', 'Science'],
  grades: ['7', '8'],
  periods: [1, 3],
  periodNames: { 3: '3rd Block' },
  endTime: '15:30',
  reminders: { morning: true, details: false, weekly: false },
  students: [
    { id: 'a', name: 'Jordan A.', plan: 'IEP', accoms: ['Text read aloud', 'Frequent breaks'] },
    { id: 'b', name: 'Priya R.', plan: '504', accoms: [] },
  ],
  termStart: '2026-09-01',
};

describe('buildOnboardedDoc', () => {
  it('writes the teacher profile and marks onboarding done', () => {
    const doc = buildOnboardedDoc(answers, now);
    const teacher = doc.teachers[0];
    expect(teacher.displayName).toBe('Ms. Rivera');
    expect(teacher.subjects).toEqual(['Mathematics', 'Science']);
    expect(doc.settings.activeTeacherId).toBe(teacher.id);
    expect(doc.settings.onboardingCompletedAt).toBeTruthy();
  });

  it('keeps the chosen day end and the reminder opt-ins', () => {
    const doc = buildOnboardedDoc(answers, now);
    expect(doc.settings.cycleEndTime).toBe('15:30');
    expect(doc.settings.reminders).toEqual({ morning: true, details: false, weekly: false });
  });

  it('hands the board over with low performance mode already on', () => {
    // The one setting that defaults ON. Nothing is known about the machine at
    // this point except that a district chose it.
    const doc = buildOnboardedDoc(answers, now);
    expect(doc.settings.lowPerformance).toBe(true);
  });

  it('honours the switch on the review screen', () => {
    // A teacher on a machine that can afford the motion turns it off at the end
    // of setup, and that choice has to survive the handover intact.
    const doc = buildOnboardedDoc({ ...answers, lowPerformance: false }, now);
    expect(doc.settings.lowPerformance).toBe(false);
  });

  it('leaves every reminder off when none were chosen', () => {
    // Onboarding promises "these stay off unless you turn them on", and a
    // default that drifted on would make that copy a lie.
    const doc = buildOnboardedDoc({ ...answers, reminders: undefined }, now);
    expect(Object.values(doc.settings.reminders).every((v) => v === false)).toBe(true);
  });

  it('creates a period per selection, keeping the spoken name', () => {
    const doc = buildOnboardedDoc(answers, now);
    expect(doc.periods).toHaveLength(2);
    expect(doc.periods.map((p) => p.shortName)).toEqual(['P1', 'P3']);
    // Named ones keep what the teacher calls them; unnamed fall back.
    expect(doc.periods[1].name).toBe('3rd Block');
    expect(doc.periods[0].name).toBe('Period 1');
  });

  it('records the term start, so the year is laid out behind them', () => {
    const doc = buildOnboardedDoc(answers, now);
    expect(doc.schoolCalendar.termStart).toBe('2026-09-01');
  });

  it('adds each student with their supports', () => {
    const doc = buildOnboardedDoc(answers, now);
    expect(doc.students.map((s) => s.displayName)).toEqual(['Jordan A.', 'Priya R.']);
    expect(doc.students[0].planType).toBe('IEP');
    expect(doc.students[1].planType).toBe('504');

    const jordan = doc.students[0];
    expect(doc.assignments.filter((a) => a.studentId === jordan.id)).toHaveLength(2);
  });

  it('carries requiresDetail through from the starter wording', () => {
    // "Text read aloud" needs a written detail each day. That obligation comes
    // from the accommodation, not from anything chosen in onboarding, so losing
    // it here would silently drop a requirement from the record.
    const doc = buildOnboardedDoc(answers, now);
    const byId = new Map(doc.catalog.map((c) => [c.id, c]));
    const jordan = doc.students[0];
    const cfgs = doc.assignments
      .filter((a) => a.studentId === jordan.id)
      .map((a) => assignmentConfig(a, byId));

    expect(cfgs.find((c) => c.label === 'Text read aloud').requiresDetail).toBe(true);
    expect(cfgs.find((c) => c.label === 'Frequent breaks').requiresDetail).toBe(false);
  });

  it('reuses one catalog entry when two students share a wording', () => {
    const doc = buildOnboardedDoc(
      {
        ...answers,
        students: [
          { id: 'a', name: 'A', plan: 'IEP', accoms: ['Frequent breaks'] },
          { id: 'b', name: 'B', plan: 'IEP', accoms: ['Frequent breaks'] },
        ],
      },
      now
    );
    expect(doc.catalog.filter((c) => c.label === 'Frequent breaks')).toHaveLength(1);
    expect(doc.assignments).toHaveLength(2);
  });

  it('records a student who joined partway through, even before the term it stamps', () => {
    /*
      A teacher setting up in February types their whole roster in one sitting,
      and not all of it arrived on the same day. Being entered today is not a
      claim about when they joined, so the date survives the build - including
      one that predates the record's own start, which is a fact about the file
      rather than about the student.
    */
    const doc = buildOnboardedDoc(
      {
        ...answers,
        students: [
          { id: 'a', name: 'Late Arrival', plan: 'IEP', accoms: [], enrolledFrom: '2026-11-03' },
          { id: 'b', name: 'From The Start', plan: 'IEP', accoms: [] },
        ],
      },
      now
    );

    expect(doc.students[0].enrolledFrom).toBe('2026-11-03');
    // Unanswered stays unanswered: null is "here since the year opened".
    expect(doc.students[1].enrolledFrom).toBeNull();
  });

  it('puts every student in every period the teacher named', () => {
    const doc = buildOnboardedDoc(answers, now);
    const ids = doc.periods.map((p) => p.id);
    expect(doc.students[0].periodIds).toEqual(ids);
  });

  it('seeds one generic preset, so the list is never empty', () => {
    // A teacher who skips the roster would otherwise land on a blank preset
    // list, meeting an empty page instead of an example to copy.
    const doc = buildOnboardedDoc({ name: 'Jordan' }, now);
    expect(doc.catalog.map((c) => c.label)).toEqual([
      'Preferential seating (front, near instruction)',
    ]);
  });

  it('assigns the seeded preset to nobody', () => {
    // It is a shape to copy, not a recommendation. Attaching it to students
    // would be the app deciding what a plan says.
    const doc = buildOnboardedDoc({ name: 'Jordan' }, now);
    expect(doc.assignments).toHaveLength(0);
  });

  it('does not duplicate the seed when a student already has it', () => {
    const doc = buildOnboardedDoc(
      {
        ...answers,
        students: [
          {
            id: 'a',
            name: 'A',
            plan: 'IEP',
            accoms: ['Preferential seating (front, near instruction)'],
          },
        ],
      },
      now
    );
    expect(
      doc.catalog.filter((c) => c.label === 'Preferential seating (front, near instruction)')
    ).toHaveLength(1);
  });

  it('survives a teacher who answered nothing but their name', () => {
    const doc = buildOnboardedDoc({ name: 'Jordan' }, now);
    expect(doc.teachers[0].displayName).toBe('Jordan');
    expect(doc.periods).toHaveLength(0);
    expect(doc.students).toHaveLength(0);
    expect(doc.settings.cycleEndTime).toBe(DEFAULT_CYCLE_END_TIME);
    expect(doc.settings.onboardingCompletedAt).toBeTruthy();
  });

  it('produces a document nothing has been recorded in yet', () => {
    // The board must open honest. A fresh setup has no day records, so every
    // accommodation reads as no_record rather than as anything having happened.
    const doc = buildOnboardedDoc(answers, now);
    const jordan = doc.students[0];
    const asg = doc.assignments.find((a) => a.studentId === jordan.id);
    expect(effectiveStatus(doc, '2026-09-16', jordan.id, asg.id, now)).toBe('no_record');
    expect(Object.keys(doc.days)).toHaveLength(0);
  });

  it('skips a blank student row rather than creating "Unnamed student"', () => {
    const doc = buildOnboardedDoc(
      { ...answers, students: [{ id: 'a', name: '   ', plan: 'IEP', accoms: [] }] },
      now
    );
    expect(doc.students).toHaveLength(0);
  });
});
