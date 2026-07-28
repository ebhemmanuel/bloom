import AmbientScene from '../shared/AmbientScene.jsx';

/**
 * The scene every onboarding screen sits in front of.
 *
 * Now the shared one. Setup, the board and About all draw the same sheet, the
 * same blooms and the same motes, so the handoff from one to the next changes
 * what is on screen without changing where you are.
 *
 * It kept its own copy until the About handoff made that copy wrong: the values
 * there are the standard, and two implementations of one scene is how they came
 * to differ in the first place.
 *
 * `phase` is still accepted so callers need not change, but the parallax it
 * used to drive is gone - the standard scene does not shift per screen, and a
 * background that moved only during setup was the drift being described.
 */
export default function OnboardingAmbient() {
  return <AmbientScene />;
}
