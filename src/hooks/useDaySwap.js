import { useEffect, useRef, useState } from 'react';

/**
 * The date-change crossfade. DESIGN_REQUIREMENTS §5.4: "Changing date
 * crossfades the lane bodies (200ms), it does not re-cascade the board."
 *
 * Without this, a date change was the one screen change in the app that CUT:
 * the model swapped under the lanes in a single frame. This hook holds the
 * outgoing day on screen long enough to fade it, then hands the new one over
 * to fade in.

 * The rows cascade in both directions, on the same keyframes a full-screen
 * scene uses - a teacher stepping to another day is watching the same board be
 * replaced, and it reads as the same kind of event. The stagger and the curve
 * live in _app-shell.scss; this hook only owns how long each phase lasts.
 *
 * Same-day changes (a status drop, a note, an added card) pass straight
 * through untouched: only the DATE moving is bridged.
 *
 * Two BARE days in a row - neither with a record, or either a weekend - swap
 * with no transition at all. Nothing on screen differs between them, so there
 * is nothing to carry from one to the other.
 *
 * `rangeActive` says the range view is the visible surface. Picking a date
 * from it clears the range and moves the date in one commit, and the day
 * board was not on screen - there is nothing of it to fade out, and fading
 * the stale day it last showed would flash the wrong content. It swaps
 * instantly and lets the incoming fade carry the transition.
 */

/*
  Must cover the CASCADE in _app-shell.scss, not just one row's duration.

  These were 160 and 200, sized for a flat crossfade of the whole wrapper. The
  day now leaves and arrives row by row, so the phase has to outlast the last
  row: its delay plus its own animation. Cut short, the class came off
  mid-flight and the tail of the board snapped into place - which read as the
  cascade not happening at all.

  The ladder runs notice, tools, rows - see `$day-*` in _app-shell.scss - so
  the last thing to move is the eighth row, and its delay stacks on top of the
  rung the rows start from.

    out: 90 + 7 x 35 + 260 = 595
    in:  130 + 7 x 45 + 420 = 865

  Kept as tight as the ladder allows. Every millisecond of the out phase is one
  where the toolbar is faded and the board refuses clicks.

  Rounded up so a slow frame cannot clip the last row. The out phase is the
  shorter of the two on purpose: it holds `pointer-events: none`, so every
  millisecond of it is a millisecond the board cannot be clicked.
*/
export const OUT_MS = 620;
const IN_MS = 900;

/**
 * A day with nothing on it: no record started, or no obligation at all.
 *
 * Two of these in a row look identical - the same heading, the same paragraph,
 * the same button - so there is nothing for a transition to carry. Only the
 * heading can differ, and it fades itself when it does. See EmptyState.
 */
const isBare = (m) => Boolean(m) && (!m.hasRecord || m.noClassToday);

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

    /*
      Starting a record is not an ordinary edit: it is the board arriving.

      "Start a record for this day" changes the document without changing the
      date, so it took the pass-through above and the whole board - toolbar,
      lanes, notes column - replaced a centred paragraph in a single frame. It
      was the last cut left on this screen, and the one that lands on a
      deliberate button press rather than on a date step.

      Handing the model over immediately and playing only the IN phase, so the
      board cascades in the way it does after a date change. No OUT phase: what
      it replaces is an empty state with nothing to carry, and 620ms of fading
      that out before anything appeared would make the button feel unresponsive.

      Bare to real only. Nothing runs when a record is already there, so status
      drops, notes and added cards still pass through untouched.
    */
    if (isBare(shown.model) && !isBare(model)) {
      setPhase('in');
    }
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

    /*
      Both days bare: swap without a transition.

      Animating here moved a heading, a paragraph and a button none of which had
      changed - stepping from one future day with no record to another is a
      change of date and nothing else. The date is not even on this screen
      except in the weekend heading, which fades on its own when the words
      differ.

      Any transition involving a real board still plays: that is when something
      actually leaves and something else arrives.
    */
    if (isBare(shown.model) && isBare(latest.current.model)) {
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
