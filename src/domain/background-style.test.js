import { describe, it, expect } from 'vitest';
import { createEmptyDoc, normalizeDoc } from './schema.js';
import { DEFAULT_BACKGROUND_STYLE } from './constants.js';

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
