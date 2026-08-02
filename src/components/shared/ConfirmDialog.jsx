import { useEffect, useRef } from 'react';
import Scrim from './Scrim.jsx';
import useDismissAnimation from '../../hooks/useDismissAnimation.js';

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
  onConfirm,
  onCancel,
  children,
}) {
  const confirmRef = useRef(null);
  // Confirming animates out too. A dialog whose cancel eases away but whose
  // confirm vanishes reads as the click having broken something.
  const { leaving, dismiss, dismissThen } = useDismissAnimation(onCancel);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dismiss]);

  return (
    <Scrim leaving={leaving} onDismiss={dismiss}>
      <div
        className={`acc-confirm ${leaving ? 'acc-leave' : 'acc-enter'}`}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="acc-confirm__title">{title}</h2>
        <p className="acc-confirm__body">{body}</p>
        {/*
          Something to answer, not only something to agree to. The confirm that
          holds a half-described student back is the right place to finish
          describing them, rather than sending the teacher away to a screen and
          back.
        */}
        {children && <div className="acc-confirm__extra">{children}</div>}

        {reassurance && <p className="acc-confirm__reassurance">{reassurance}</p>}

        {/*
          `confirmLabel: null` makes this an acknowledgement rather than a
          question - used when the answer to what you clicked is "that is not
          possible, and here is why". Offering a Confirm button that only closes
          the dialog would imply the action was still available.
        */}
        <div className="acc-confirm__actions">
          <button
            ref={confirmLabel ? undefined : confirmRef}
            type="button"
            className={`acc-btn${confirmLabel ? ' acc-btn--quiet' : ' acc-btn--primary'}`}
            onClick={dismiss}
          >
            {cancelLabel}
          </button>
          {confirmLabel && (
            <button
              ref={confirmRef}
              type="button"
              className={`acc-btn acc-btn--primary${tone === 'warn' ? ' acc-btn--warn' : ''}${tone === 'danger' ? ' acc-btn--danger' : ''}`}
              onClick={dismissThen(onConfirm)}
            >
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </Scrim>
  );
}
