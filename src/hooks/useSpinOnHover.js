import { useCallback, useState } from 'react';

/**
 * Turn the Bloom mark while it is pointed at, and let it finish the turn.
 *
 * Stopping on `mouseleave` would freeze the mark at whatever angle it happened
 * to be at, which leaves a logo sitting crooked. Instead the pointer leaving
 * only asks it to stop, and the next `animationiteration` - one full 360, the
 * same place it started - actually takes it off. It always comes to rest
 * square.
 *
 * The animation is CSS. This decides only when it is allowed to end, which is
 * the one thing a keyframe cannot say.
 *
 * Used on the brand lockup, in the pill nav and at the top of About. Not on the
 * big mark at the centre of About: that one turns on its own from 4600ms, which
 * is the handoff's idle pinwheel and has nothing to do with the pointer.
 */
export default function useSpinOnHover() {
  const [spinning, setSpinning] = useState(false);
  const [settling, setSettling] = useState(false);

  const onMouseEnter = useCallback(() => {
    setSettling(false);
    setSpinning(true);
  }, []);

  const onMouseLeave = useCallback(() => {
    setSpinning(false);
    setSettling(true);
  }, []);

  const onAnimationIteration = useCallback(() => {
    setSettling((wasSettling) => (spinning ? wasSettling : false));
  }, [spinning]);

  return {
    turning: spinning || settling,
    spinProps: { onMouseEnter, onMouseLeave, onAnimationIteration },
  };
}
