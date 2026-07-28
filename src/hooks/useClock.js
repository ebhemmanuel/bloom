import { useEffect, useState } from 'react';

/**
 * The wall clock, to the minute.
 *
 * Aligned to the minute boundary rather than ticking every second: the display
 * only shows minutes, so a per-second timer would re-render sixty times for
 * fifty-nine identical frames, and the change would still land up to a second
 * late. The first timeout waits out the remainder of the current minute, then it
 * settles onto a steady interval.
 *
 * Worth having on this particular app because the day closes itself at
 * `cycleEndTime`. A teacher deciding whether to record one more thing before the
 * board seals is asking what time it is.
 */
export default function useClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let interval = null;

    const align = setTimeout(
      () => {
        setNow(new Date());
        interval = setInterval(() => setNow(new Date()), 60_000);
      },
      // Time left in this minute, plus a hair so we land just after the tick
      // rather than just before it and show the old minute again.
      60_000 - (Date.now() % 60_000) + 50
    );

    return () => {
      clearTimeout(align);
      if (interval) clearInterval(interval);
    };
  }, []);

  return now;
}
