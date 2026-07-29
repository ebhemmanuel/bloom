import { useEffect, useRef, useState } from 'react';

/**
 * The date-change crossfade. DESIGN_REQUIREMENTS §5.4: "Changing date
 * crossfades the lane bodies (200ms), it does not re-cascade the board."
 *
 * Without this, a date change was the one screen change in the app that CUT:
 * the model swapped under the lanes in a single frame. This hook holds the
 * outgoing day on screen long enough to fade it, then hands the new one over
 * to fade in. No stagger in either direction - lanes hold their places and
 * only the contents change, per the §4.4 budget rule.
 *
 * Same-day changes (a status drop, a note, an added card) pass straight
 * through untouched: only the DATE moving is bridged.
 *
 * `rangeActive` says the range view is the visible surface. Picking a date
 * from it clears the range and moves the date in one commit, and the day
 * board was not on screen - there is nothing of it to fade out, and fading
 * the stale day it last showed would flash the wrong content. It swaps
 * instantly and lets the incoming fade carry the transition.
 */

// Must match the .acc-board__day--out / --in durations in _app-shell.scss.
const OUT_MS = 160;
const IN_MS = 200;

export default function useDaySwap(dateKey, model, rangeActive) {
  // What the timer should hand over when it fires, however many times the
  // inputs have moved since it was set.
  const latest = useRef({ dateKey, model });
  latest.current = { dateKey, model };

  const [shown, setShown] = useState({ dateKey, model });
  const [phase, setPhase] = useState('idle');

  // Same-day document edits flow straight through. Render-phase sync rather
  // than an effect, so the frame that carries the edit never shows stale data.
  if (shown.dateKey === dateKey && shown.model !== model) {
    setShown({ dateKey, model });
  }

  const shownDate = useRef(shown.dateKey);
  shownDate.current = shown.dateKey;

  // Whether the range view was on screen at the end of the PREVIOUS commit.
  // Recorded by the effect declared below the swap effect, deliberately: when
  // a range clear and a date change land together, the swap effect must still
  // see the range as having been what the teacher was looking at.
  const wasRange = useRef(rangeActive);

  useEffect(() => {
    if (dateKey === shownDate.current) return undefined;

    if (wasRange.current) {
      setShown({ ...latest.current });
      setPhase('idle');
      return undefined;
    }

    setPhase('out');
    const swap = setTimeout(() => {
      setShown({ ...latest.current });
      setPhase('in');
    }, OUT_MS);
    // Stepping again mid-fade restarts the timer; the board stays faded and
    // lands once on wherever the stepping stopped.
    return () => clearTimeout(swap);
  }, [dateKey]);

  useEffect(() => {
    wasRange.current = rangeActive;
  });

  // Shed the entrance class once it has played, so the wrapper rests with no
  // animation on it at all - see the [data-board-cascade='rest'] history for
  // what a permanently-held animation frame costs.
  useEffect(() => {
    if (phase !== 'in') return undefined;
    const settle = setTimeout(() => setPhase('idle'), IN_MS + 40);
    return () => clearTimeout(settle);
  }, [phase]);

  return { dateKey: shown.dateKey, model: shown.model, phase };
}
