import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import useClock from '../../hooks/useClock.js';
import { useBoard } from '../../context/BoardContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { sealDay, reopenDay } from '../../domain/resolve.js';
import { todayKey } from '../../domain/dates.js';

/** 2:30pm, in minutes past midnight. See `visible`. */
const CLOSE_OUT_FROM = 14 * 60 + 30;

/** `.acc-fade-enter`, which runs at `--acc-dur-normal`. */
const FADE_IN_MS = 260;

/** `.acc-fade-leave`, at `--acc-dur-fast` - departures are quicker than arrivals. */
const FADE_OUT_MS = 160;

/** "16:00" to 960. Null for anything unparseable, so callers can fall back. */
function minutesOf(hhmm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Commit the day, beside the date that says which day it is.
 *
 * It lives in the header rather than the board's toolbar for the same reason
 * the date picker does: closing out is about the DAY, not about how the lanes
 * are arranged, and the two questions belong next to each other. It was a menu
 * item inside an unlabelled three-dot control before that, which is a strange
 * place for the one thing a teacher is meant to do before they go home.
 *
 * Self-contained on purpose. Nothing about sealing needs the board's state, so
 * reading the date and the document straight from context is shorter than
 * threading a handler from Board up through App into the header, and there is
 * no second copy of the seal logic to drift.
 */
export default function CloseOutDayButton() {
  const { doc, mutate, readOnly } = useData();
  const { dateKey } = useBoard();
  const now = useClock();

  const day = doc.days?.[dateKey];
  const sealed = Boolean(day?.sealed);
  const hasRecord = Boolean(day);
  const cycleEndTime = doc.settings?.cycleEndTime;

  /**
   * When the button is offered at all.
   *
   * Not greyed out all morning: a control that is present and refusing from 8am
   * teaches people to stop seeing it, and the one moment it matters is the end
   * of the day. So it fades in when closing out is actually the next thing to
   * do.
   *
   *   - A past day is finished by definition, so it is always offered.
   *   - A sealed day always offers the way back, whatever the clock says.
   *     Re-opening is how a mistake gets fixed and must never be unreachable.
   *   - A future day has nothing to close.
   *   - Today: from CLOSE_OUT_FROM.
   */
  const visible = useMemo(() => {
    if (sealed) return true;

    /*
      Nothing to close on a day that never started.

      It was offered on every past date, which put a live-looking button over
      "No record for this day" - and closing out is precisely the act that turns
      unassigned entries into Not Used. On a day with no record there is nothing
      to turn, and the distinction it would blur is the one this app exists to
      protect: `no_record` says nobody wrote anything down, `not_used` says the
      accommodation was not delivered. See sealDay, which refuses these too.

      It was disabled rather than hidden before, which is the thing the comment
      below argues against: a control that is permanently present and
      permanently refusing is one people stop seeing.
    */
    if (!hasRecord) return false;

    const today = todayKey(now);
    if (dateKey < today) return true;
    if (dateKey > today) return false;

    /*
      2:30pm, or `cycleEndTime` if a teacher set one earlier than that.

      The clamp matters: the day auto-seals at cycleEndTime, so a teacher whose
      day ends at 1pm would watch the board seal itself every afternoon without
      the button ever having appeared, and would never find the control that
      does it deliberately.
    */
    const cutoff = Math.min(CLOSE_OUT_FROM, minutesOf(cycleEndTime) ?? CLOSE_OUT_FROM);
    return now.getHours() * 60 + now.getMinutes() >= cutoff;
  }, [sealed, hasRecord, dateKey, now, cycleEndTime]);

  /*
    Held on screen long enough to leave, the way the sealed notice is.

    `if (!visible) return null` on its own only ever cut. Stepping onto a day
    with no record took the button out of the document in the same frame the new
    date arrived, and stepping back put it there fully formed - the one control
    in the bar that appears and disappears as you browse was the one thing that
    did it without a transition.

    Laid out before paint for the same reason as the notice: a plain effect
    would paint one frame of the un-adjusted state, which is the cut it is
    supposed to remove.
  */
  const [held, setHeld] = useState(visible);
  const [phase, setPhase] = useState(null);
  const wasVisible = useRef(visible);
  const fadeTimer = useRef(null);

  useLayoutEffect(() => {
    if (wasVisible.current === visible) return undefined;
    wasVisible.current = visible;
    clearTimeout(fadeTimer.current);

    if (visible) {
      setHeld(true);
      setPhase('in');
      fadeTimer.current = setTimeout(() => setPhase(null), FADE_IN_MS);
      return undefined;
    }

    setPhase('out');
    fadeTimer.current = setTimeout(() => {
      setHeld(false);
      setPhase(null);
    }, FADE_OUT_MS);
    return undefined;
  }, [visible]);

  useEffect(() => () => clearTimeout(fadeTimer.current), []);

  /*
    The label a leaving button keeps.

    It reads `sealed` from whichever day is now in view, so a button fading out
    because you stepped off a closed day would have flipped from Re-open Day to
    Close out Day halfway through its own exit - changing what it says on the
    way out of a day it no longer belongs to. Frozen at the last day it was
    actually offered on.
  */
  const lastSealed = useRef(sealed);
  if (visible) lastSealed.current = sealed;
  const saysSealed = visible ? sealed : lastSealed.current;

  if (!visible && !held) return null;

  const commit = () => {
    mutate((d) =>
      d.days?.[dateKey]?.sealed
        ? reopenDay(d, dateKey, new Date())
        : sealDay(d, dateKey, new Date(), 'user')
    );
  };

  return (
    <>
      <button
        type="button"
        /*
          A plain pill, like the date beside it and every other control in the
          bar. It was --primary purple for a while, which put the loudest thing
          on the screen in the corner of a nav that is otherwise all quiet
          controls, and made an ordinary end-of-day action look like a warning.

          Weight comes from being the only labelled verb up here, not from fill.
        */
        className={`acc-btn${phase === 'in' ? ' acc-fade-enter' : ''}${
          phase === 'out' ? ' acc-fade-leave' : ''
        }`}
        /*
          Straight through, both ways.

          This had a confirm dialog in each direction. Closing out is what a
          teacher does at the end of every day, and re-opening is how they undo
          it - the two are each other's escape hatch, so a dialog in front of
          either was guarding an action that the other button reverses in one
          click. Neither destroys anything a teacher cannot immediately put back.
        */
        onClick={commit}
        /*
          Only the document-level lock disables it now: a file written by a
          newer version of Bloom is read-only whatever the day says.

          The `!hasRecord` case used to live here and is handled by `visible`
          above - the button is not rendered at all on a day with nothing in it,
          rather than rendered and refusing.
        */
        // `!visible` covers the exit: for the moment it is still on screen
        // fading out, it belongs to a day it is no longer offered on.
        disabled={readOnly || !visible}
        title={
          saysSealed
            ? 'Makes the day editable again'
            : 'Seals the day; anything unassigned records as Not Used'
        }
      >
        {saysSealed ? 'Re-open Day' : 'Close out Day'}
      </button>
    </>
  );
}
