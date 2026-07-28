import { describe, it, expect } from 'vitest';
import { setupStage } from './onboarding.js';

const onboarded = { settings: { onboardingCompletedAt: '2026-07-27T09:00:00.000-04:00' } };
const fresh = { settings: {} };

describe('setupStage', () => {
  it('shows onboarding when there is no document at all', () => {
    expect(setupStage(null, 'ready').showOnboarding).toBe(true);
    expect(setupStage(undefined, 'ready').showOnboarding).toBe(true);
  });

  it('shows onboarding until the document says it is finished', () => {
    expect(setupStage(fresh, 'ready').showOnboarding).toBe(true);
    expect(setupStage(onboarded, 'ready').showOnboarding).toBe(false);
  });

  it('folds the folder step in when the app booted without a pointer', () => {
    expect(setupStage(fresh, 'needs-location').needsLocation).toBe(true);
    expect(setupStage(fresh, 'needs-onboarding-location').needsLocation).toBe(true);
    expect(setupStage(fresh, 'ready').needsLocation).toBe(false);
  });

  /**
   * The reported bug. A boot with no pointer reports `needs-location` forever -
   * it is a snapshot of how the app started, not live state - so holding it in
   * the gate meant finishing setup never released it, and onboarding stayed up
   * on its last phase: "One moment..." with nothing behind it.
   */
  it('releases the gate once setup is done, even on a boot that had no pointer', () => {
    const stage = setupStage(onboarded, 'needs-location');
    expect(stage.showOnboarding).toBe(false);
    expect(stage.needsLocation).toBe(false);
  });

  it('does the same for the onboarding-and-location boot', () => {
    expect(setupStage(onboarded, 'needs-onboarding-location').showOnboarding).toBe(false);
  });
});
