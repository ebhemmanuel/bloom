import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Must match `--acc-dur-fast`, which is what `.acc-leave` and the `--leaving`
 * modifiers animate for. If the two drift apart the panel either disappears
 * mid-animation or sits invisible for a beat after it finishes.
 */
export const EXIT_MS = 160;

/**
 * Hold a panel on screen long enough for it to leave the way it arrived.
 *
 * React unmounts the instant its condition goes false, which cuts a panel out of
 * existence — and a thing that appears by easing in and disappears by vanishing
 * reads as two different objects. This keeps the component mounted for the
 * length of its exit animation, then calls `onClose` for real.
 *
 * Returns `leaving` for the class name and `dismiss` to use in place of
 * `onClose` everywhere the panel can be closed — its own button, click-outside,
 * and Escape. Any path still calling `onClose` directly skips the animation.
 *
 * `dismissThen(fn)` is for the buttons that act rather than cancel: a confirm
 * that cuts where its own cancel fades reads as the dialog breaking under the
 * click. It runs `fn` and nothing else — deliberately not `onClose` as well,
 * because for some dialogs (the detail popover) cancelling actively reverts
 * what the action just did.
 */
export default function useDismissAnimation(onClose, ms = EXIT_MS) {
  const [leaving, setLeaving] = useState(false);
  const timer = useRef(null);
  // A ref, not the state value: two fast clicks land in the same render, so
  // reading state would queue a second timer and close twice.
  const started = useRef(false);

  useEffect(() => () => clearTimeout(timer.current), []);

  const run = useCallback(
    (done) => {
      if (started.current) return;
      started.current = true;
      setLeaving(true);
      timer.current = setTimeout(done, ms);
    },
    [ms]
  );

  const dismiss = useCallback(() => run(onClose), [run, onClose]);
  const dismissThen = useCallback((fn) => () => run(fn), [run]);

  return { leaving, dismiss, dismissThen };
}
