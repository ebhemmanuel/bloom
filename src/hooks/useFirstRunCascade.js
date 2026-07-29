import { useEffect, useRef, useState } from 'react';

/**
 * The board's half of the outro handoff.
 *
 * Onboarding's last screen leaves in a cascade, the aurora holds for a beat, and
 * then the board arrives in a cascade of its own. The aim is one continuous
 * gesture: the board should look like it grew out of the scene the outro left
 * behind, rather than like a route change that happened to follow it.
 *
 * Three rules from the spec, each of which is the reason for a branch below:
 *
 * - It plays ONCE, on the run that just finished onboarding. A teacher opening
 *   the app for the fortieth time wants their board, not a performance.
 * - It is interruptible. Any click or key press jumps to the end rather than
 *   cancelling, because someone who is already reaching for a card has told you
 *   they are done watching.
 * - Reduced motion skips it entirely and takes a single opacity fade.
 *
 * Returns the class the board root should carry, or an empty string when the
 * board should simply be there.
 */
export default function useFirstRunCascade(active, onDone) {
  const [state, setState] = useState(() => (active ? 'beat' : 'idle'));

  /**
   * Held in a ref so the effect depends only on `active`.
   *
   * `onDone` comes from context and gets a new identity every time the document
   * changes, which on a live board is constantly. Depending on it directly
   * restarted the effect and cleared its timers before they could fire, so the
   * cascade sat on its opening frame with the whole board at opacity 0.
   */
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!active) return undefined;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setState('fade');
      const timer = setTimeout(() => {
        setState('idle');
        done.current?.();
      }, 200);
      return () => clearTimeout(timer);
    }

    // The beat. Empty aurora, no board yet, while the field eases back to
    // centre. Not trimmed below 250ms: it is what separates the two cascades.
    const start = setTimeout(() => setState('running'), 280);
    /**
     * The beat, plus the whole cascade.
     *
     * This ran for 900ms, which was shorter than the cascade it was covering:
     * the board's last row does not land until 1870ms (160ms of surface lead,
     * the toolbar at 80, twelve lanes 90 apart, 550 each - see
     * `cascade-rows`). Ending early dropped the board back to its resting
     * state mid-flight and the remaining rows snapped into place.
     */
    const end = setTimeout(() => {
      setState('idle');
      done.current?.();
    }, 280 + 1900);

    const finishNow = () => {
      clearTimeout(start);
      clearTimeout(end);
      setState('idle');
      done.current?.();
    };

    // Jump to the end, never cancel: cancelling mid-cascade would leave half the
    // board at opacity 0.
    window.addEventListener('pointerdown', finishNow, { once: true });
    window.addEventListener('keydown', finishNow, { once: true });

    return () => {
      clearTimeout(start);
      clearTimeout(end);
      window.removeEventListener('pointerdown', finishNow);
      window.removeEventListener('keydown', finishNow);
    };
  }, [active]);

  if (state === 'beat') return 'acc-firstrun acc-firstrun--held';
  if (state === 'running') return 'acc-firstrun acc-firstrun--in';
  if (state === 'fade') return 'acc-firstrun acc-firstrun--fade';
  return '';
}
