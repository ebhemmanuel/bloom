import { useMemo, useState } from 'react';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import useClock from '../../hooks/useClock.js';
import { useBoard } from '../../context/BoardContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { sealDay, reopenDay } from '../../domain/resolve.js';
import { todayKey } from '../../domain/dates.js';

/** 2:30pm, in minutes past midnight. See `visible`. */
const CLOSE_OUT_FROM = 14 * 60 + 30;

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
  const [asking, setAsking] = useState(false);
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
  }, [sealed, dateKey, now, cycleEndTime]);

  if (!visible) return null;

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
        className="acc-btn acc-fade-enter"
        onClick={() => setAsking(true)}
        // Re-opening is never blocked by the day being read-only: being read
        // only is the thing it undoes.
        disabled={sealed ? readOnly : readOnly || !hasRecord}
        title={
          sealed
            ? 'Makes the day editable again'
            : 'Seals the day; anything unassigned records as Not Used'
        }
      >
        {sealed ? 'Re-open Day' : 'Close out Day'}
      </button>

      {/*
        Confirmed in both directions.

        Sealing writes Not Used across every unassigned entry, which is a claim
        about what a child received, and re-opening reverts every one the
        close-out wrote. Neither belongs one stray click away, and that goes
        double now the control sits in the always-visible bar rather than two
        clicks inside a menu.

        The body says what it will DO rather than what it is called, because
        "close out day" does not tell a teacher that anything they have not
        touched is about to be recorded as not delivered.
      */}
      {asking && (
        <ConfirmDialog
          title={sealed ? 'Re-open this day?' : 'Close out this day?'}
          body={
            sealed
              ? 'Anything the close-out recorded as Not Used goes back to unassigned, so you can change it. What you marked yourself is left alone.'
              : 'Everything still unassigned will be recorded as Not Used, and the day becomes read-only.'
          }
          reassurance={
            sealed
              ? undefined
              : 'You can re-open it afterwards, and notes can still be added either way.'
          }
          confirmLabel={sealed ? 'Re-open it' : 'Close it out'}
          cancelLabel="Cancel"
          /*
            No `warn` tone. It paints the confirm button amber, which is the
            app's colour for "this destroys something" - and closing out is the
            ordinary end of an ordinary day, not a hazard. The dialog is here to
            make sure the click was meant, and the body already says exactly
            what will happen; dressing it as a warning would make the thing a
            teacher does every afternoon feel like a mistake.
          */
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            commit();
          }}
        />
      )}
    </>
  );
}
