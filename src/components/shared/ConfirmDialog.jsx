import { useEffect, useRef, useState } from 'react';
import Scrim from './Scrim.jsx';
import useDismissAnimation from '../../hooks/useDismissAnimation.js';
import useAutoHeight from '../../hooks/useAutoHeight.js';

/**
 * How long the outgoing contents take to clear before the new ones arrive.
 *
 * Shorter than the height ease on purpose: the box should already be on its way
 * to the new size while the old words are still going, so the two read as one
 * movement rather than a fade followed by a resize.
 */
const SWAP_MS = 160;

/**
 * A small "are you sure" for actions that change what happens on future days.
 *
 * `reassurance` is a required-by-convention second line. Every action that gets
 * this dialog is reversible, and saying so is what keeps the confirm from
 * reading as a warning about something dangerous.
 */
export default function ConfirmDialog({
  title,
  body,
  reassurance,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  align = 'start',
  lead = null,
  busy = false,
  /**
   * Whether confirming closes the dialog.
   *
   * False when the dialog goes on to say something else - a copy that reports
   * back when it has finished, rather than vanishing and leaving a toast to
   * explain the board. The box then stays mounted and only its contents change,
   * which is what makes it read as one dialog thinking rather than two dialogs
   * trading places.
   */
  dismissOnConfirm = true,
  /**
   * Names which state the dialog is in, when one dialog has several.
   *
   * Changing it crossfades the contents and eases the box to its new height
   * instead of swapping both in a single frame. Leave it undefined for a
   * dialog that only ever says one thing - nothing then costs anything.
   */
  step,
  onConfirm,
  onCancel,
  children,
}) {
  const confirmRef = useRef(null);
  // Confirming animates out too. A dialog whose cancel eases away but whose
  // confirm vanishes reads as the click having broken something.
  const { leaving, dismiss, dismissThen } = useDismissAnimation(onCancel);

  // The box eases between the heights of its steps. See the hook: a box sized
  // by its contents is `auto` at both ends, so there is nothing to transition
  // until the content is measured and published.
  const [outerRef, contentRef] = useAutoHeight('--acc-confirm-h');

  /**
   * Hold the outgoing step on screen while it fades.
   *
   * `step` and the props describing it change in the same render, so without a
   * snapshot the new words would appear instantly and only the fade would be
   * left to explain them. Keeping the last render's values means the old step
   * can leave as itself.
   */
  const view = { title, body, reassurance, confirmLabel, cancelLabel, tone, busy, lead, children };
  const shown = useRef(view);
  const [swapping, setSwapping] = useState(false);
  const lastStep = useRef(step);

  /*
    Derived during render, not from an effect.

    An effect runs after the frame is painted, so by the time it set `swapping`
    the new contents had already been on screen for a frame - and the fade then
    played over the NEW words, which read as them flickering out and popping
    back rather than as the old ones leaving. Updating state during render of
    the same component is the supported way to react to a changed prop, and it
    re-renders before anything is shown.
  */
  if (lastStep.current !== step) {
    lastStep.current = step;
    if (!swapping) setSwapping(true);
  } else if (!swapping) {
    shown.current = view;
  }

  const v = swapping ? shown.current : view;

  useEffect(() => {
    if (!swapping) return undefined;
    const t = setTimeout(() => setSwapping(false), SWAP_MS);
    return () => clearTimeout(t);
  }, [swapping]);

  useEffect(() => {
    if (v.busy) return undefined;
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dismiss, v.busy]);

  return (
    // While busy, clicking the scrim does nothing: the work is already under
    // way and there is nothing left to cancel.
    <Scrim leaving={leaving} onDismiss={busy ? () => {} : dismiss}>
      <div
        ref={outerRef}
        className={`acc-confirm${align === 'center' ? ' acc-confirm--center' : ''} ${
          leaving ? 'acc-leave' : 'acc-enter'
        }`}
        role="alertdialog"
        aria-modal="true"
        aria-label={v.title}
        aria-busy={v.busy || undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/*
          Free to take its natural height: that is what makes it measurable, and
          the shell above transitions to whatever it reports. The padding lives
          here rather than on the shell so the measurement is the whole box and
          the eased height never clips its own edges.
        */}
        <div
          ref={contentRef}
          className={`acc-confirm__measure${swapping ? ' acc-confirm__measure--swapping' : ''}`}
        >
          <h2 className="acc-confirm__title">{v.title}</h2>
          {v.body && <p className="acc-confirm__body">{v.body}</p>}
          {/* Directly under the title, OUTSIDE any bordered block: the action the
              dialog exists to offer, not one of the fields it is asking about. */}
          {v.lead}
          {/*
            Something to answer, not only something to agree to. The confirm that
            holds a half-described student back is the right place to finish
            describing them, rather than sending the teacher away to a screen and
            back.
          */}
          {v.children && <div className="acc-confirm__extra">{v.children}</div>}

          {v.reassurance && <p className="acc-confirm__reassurance">{v.reassurance}</p>}

          {/*
            Working: no buttons at all.

            A disabled Cancel would be a control that answers nothing, and a live
            one would offer to stop something already written. The bar is the
            only thing that moves, so the wait reads as progress rather than as a
            screen that has frozen.

            Otherwise: `confirmLabel: null` makes this an acknowledgement rather
            than a question. Offering a Confirm that only closes the dialog would
            imply the action was still available.
          */}
          {v.busy ? (
            <div className="acc-confirm__working" role="status" aria-live="polite">
              <span className="acc-confirm__bar" aria-hidden="true" />
            </div>
          ) : (
            <div
              className={`acc-confirm__actions${v.confirmLabel ? '' : ' acc-confirm__actions--single'}`}
            >
              <button
                ref={v.confirmLabel ? undefined : confirmRef}
                type="button"
                className={`acc-btn${v.confirmLabel ? ' acc-btn--quiet' : ' acc-btn--primary'}`}
                onClick={dismiss}
              >
                {v.cancelLabel}
              </button>
              {v.confirmLabel && (
                <button
                  ref={confirmRef}
                  type="button"
                  className={`acc-btn acc-btn--primary${v.tone === 'warn' ? ' acc-btn--warn' : ''}${v.tone === 'danger' ? ' acc-btn--danger' : ''}`}
                  onClick={dismissOnConfirm ? dismissThen(onConfirm) : onConfirm}
                >
                  {v.confirmLabel}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Scrim>
  );
}
