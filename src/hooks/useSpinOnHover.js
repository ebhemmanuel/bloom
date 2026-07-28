import { useCallback, useState } from 'react';

/**
 * One turn of the Bloom mark, triggered by pointing at it.
 *
 * Hovering STARTS a turn; it does not hold one. The mark completes a single
 * revolution, overshoots, rocks back through five diminishing points and stops.
 * Taking the pointer away does not shorten or extend it - once started it plays
 * out, which is what makes it feel like something with weight rather than
 * something being switched on and off.
 *
 * All of that is one CSS animation, so this hook does almost nothing: it arms
 * the class and takes it off at `animationend`. No angle measuring, because
 * the turn always ends where it began and the settle is expressed relative to
 * that, not to wherever a pointer happened to leave.
 *
 * Re-arming is ignored while a turn is running - hovering, leaving and hovering
 * again should not stack turns or restart one mid-flight.
 */
export default function useSpinOnHover() {
  const [turning, setTurning] = useState(false);

  const onMouseEnter = useCallback(() => setTurning(true), []);
  const onAnimationEnd = useCallback((e) => {
    // Only the mark's own turn. The lockup also carries the screen's entrance
    // animation, and that finishing must not disarm this one.
    if (e.animationName.includes('mark-turn')) setTurning(false);
  }, []);

  return {
    turning,
    spinProps: { onMouseEnter, onAnimationEnd },
  };
}
