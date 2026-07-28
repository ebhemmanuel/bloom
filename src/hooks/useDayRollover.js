import { useEffect, useRef } from 'react';
import { todayKey } from '../domain/dates.js';

/** Often enough that the board is never more than a minute behind the clock. */
const TICK_MS = 30_000;

/**
 * Fire once when the calendar date changes under a running app.
 *
 * A teacher leaves this open on a classroom machine for weeks. Everything that
 * prepares a day - laying out its record, moving the board onto it - ran at
 * load and nowhere else, so the morning after the app was left open they
 * arrived at yesterday's board and an empty state asking them to start a
 * record. Closing and reopening fixed it, which is not something anyone should
 * have to know.
 *
 * A polled tick rather than one timer set for midnight: a `setTimeout` sized to
 * the gap is wrong the moment the machine sleeps through it, and sleeping
 * through midnight is the normal case here, not the exceptional one. Focus and
 * visibility are watched for the same reason - a laptop shut at 4pm and opened
 * at 8am fires no timers in between, but it does fire those.
 *
 * `onRollover(today, previous)` is held in a ref so the effect depends on
 * nothing and cannot be restarted by a caller that rebuilds its handler each
 * render.
 */
export default function useDayRollover(onRollover) {
  const seen = useRef(todayKey());
  const handler = useRef(onRollover);
  handler.current = onRollover;

  useEffect(() => {
    const check = () => {
      const today = todayKey();
      if (today === seen.current) return;
      const previous = seen.current;
      // Written before the callback runs: whatever the handler does, this tick
      // must not be able to fire twice for the same date.
      seen.current = today;
      handler.current?.(today, previous);
    };

    const id = setInterval(check, TICK_MS);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);

    return () => {
      clearInterval(id);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
}
