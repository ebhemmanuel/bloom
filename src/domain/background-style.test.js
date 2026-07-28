import { describe, it, expect } from 'vitest';
import { createEmptyDoc, normalizeDoc } from './schema.js';
import { DEFAULT_BACKGROUND_STYLE } from './constants.js';

const now = new Date(2026, 8, 16, 9, 0);

/**
 * The scene the app sits in front of. `calm` is the default because the
 * first-run handoff cascades the board in over whatever is already there - a
 * different backdrop underneath would change the room mid-transition.
 */
describe('backgroundStyle', () => {
  it('starts calm, the scene onboarding opens in', () => {
    expect(createEmptyDoc(now).settings.backgroundStyle).toBe('calm');
    expect(DEFAULT_BACKGROUND_STYLE).toBe('calm');
  });

  it('keeps a recognised choice', () => {
    const { doc } = normalizeDoc({ settings: { backgroundStyle: 'cycling' } }, now);
    expect(doc.settings.backgroundStyle).toBe('cycling');
  });

  it('falls back for anything it does not know', () => {
    for (const bad of ['neon', '', null, 7, undefined]) {
      const { doc } = normalizeDoc({ settings: { backgroundStyle: bad } }, now);
      expect(doc.settings.backgroundStyle).toBe('calm');
    }
  });

  /** A preference is not a repair. Reporting one would be noise on a screen
      that exists to surface damage to a compliance record. */
  it('says nothing about an unknown value', () => {
    const { repairs } = normalizeDoc({ settings: { backgroundStyle: 'neon' } }, now);
    expect(repairs.join(' ')).not.toMatch(/background/i);
  });
});
