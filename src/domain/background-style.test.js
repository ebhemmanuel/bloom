import { describe, it, expect } from 'vitest';
import { createEmptyDoc, normalizeDoc } from './schema.js';
import { DEFAULT_BACKGROUND_STYLE, DEFAULT_LOW_PERFORMANCE, PLAN_LABEL_MAX } from './constants.js';

const now = new Date(2026, 8, 16, 9, 0);

/**
 * The scene the app sits in front of. `aurora` is the standard set by
 * design_handoff_about_bloom and is what setup, the board and About all draw,
 * so moving between them never changes the room.
 */
describe('backgroundStyle', () => {
  it('starts on the standard scene', () => {
    expect(createEmptyDoc(now).settings.backgroundStyle).toBe('aurora');
    expect(DEFAULT_BACKGROUND_STYLE).toBe('aurora');
  });

  it('keeps a recognised choice', () => {
    const { doc } = normalizeDoc({ settings: { backgroundStyle: 'calm' } }, now);
    expect(doc.settings.backgroundStyle).toBe('calm');
  });

  /**
   * `cycling` was the id for the aurora sheet before it became the standard.
   * Migrated rather than dropped, so anyone who chose it keeps the scene they
   * picked instead of being quietly moved off it.
   */
  it('migrates the retired id to the scene it named', () => {
    const { doc } = normalizeDoc({ settings: { backgroundStyle: 'cycling' } }, now);
    expect(doc.settings.backgroundStyle).toBe('aurora');
  });

  it('falls back for anything it does not know', () => {
    for (const bad of ['neon', '', null, 7, undefined]) {
      const { doc } = normalizeDoc({ settings: { backgroundStyle: bad } }, now);
      expect(doc.settings.backgroundStyle).toBe('aurora');
    }
  });

  /** A preference is not a repair. Reporting one would be noise on a screen
      that exists to surface damage to a compliance record. */
  it('says nothing about an unknown value', () => {
    const { repairs } = normalizeDoc({ settings: { backgroundStyle: 'neon' } }, now);
    expect(repairs.join(' ')).not.toMatch(/background/i);
  });
});

/**
 * The plan type is a label, not a code from a controlled vocabulary.
 *
 * It used to be coerced to "IEP" when it was not one of three, which on a
 * compliance record is the worst possible repair: it does not drop a label it
 * cannot read, it asserts a different plan than the one the student is on.
 */
describe('planType', () => {
  it('keeps a wording of the teacher’s own', () => {
    const { doc } = normalizeDoc(
      { students: [{ id: 's1', displayName: 'A', planType: 'Behaviour plan' }] },
      now
    );
    expect(doc.students[0].planType).toBe('Behaviour plan');
  });

  it('falls back only when there is nothing there', () => {
    for (const bad of ['', '   ', null, undefined]) {
      const { doc } = normalizeDoc(
        { students: [{ id: 's1', displayName: 'A', planType: bad }] },
        now
      );
      expect(doc.students[0].planType).toBe('IEP');
    }
  });

  /**
   * A hand-edited file that wrote 504 as a number meant "504", and reading it
   * as one is a repair. This is the case the old rule got wrong in the most
   * expensive direction: it did not know the number, so it wrote "IEP".
   */
  it('reads a number as the label it was meant to be', () => {
    const { doc } = normalizeDoc(
      { students: [{ id: 's1', displayName: 'A', planType: 504 }] },
      now
    );
    expect(doc.students[0].planType).toBe('504');
  });

  it('caps a wording that would not fit a lane header', () => {
    const { doc } = normalizeDoc(
      { students: [{ id: 's1', displayName: 'A', planType: 'x'.repeat(80) }] },
      now
    );
    expect(doc.students[0].planType).toHaveLength(PLAN_LABEL_MAX);
  });
});

/**
 * The one setting that defaults ON.
 *
 * Every other opt-in here starts false because turning something on for
 * somebody is a small imposition. This one is the reverse: leaving it off for
 * somebody on a slow machine is the bigger one, and they are the person least
 * equipped to work out why the app feels broken.
 */
describe('lowPerformance', () => {
  it('starts on', () => {
    expect(createEmptyDoc(now).settings.lowPerformance).toBe(true);
    expect(DEFAULT_LOW_PERFORMANCE).toBe(true);
  });

  it('stays on for a file written before it existed', () => {
    // Absent means on, unlike every other opt-in. Nothing is known about the
    // machine that wrote it, and the safe guess about an unknown machine is
    // the slow one.
    const { doc } = normalizeDoc({ settings: {} }, now);
    expect(doc.settings.lowPerformance).toBe(true);
  });

  it('keeps a teacher who turned it off, turned off', () => {
    const { doc } = normalizeDoc({ settings: { lowPerformance: false } }, now);
    expect(doc.settings.lowPerformance).toBe(false);
  });

  it('is a preference, not a repair', () => {
    const { repairs } = normalizeDoc({ settings: { lowPerformance: 'nope' } }, now);
    expect(repairs.join(' ')).not.toMatch(/performance/i);
  });
});
