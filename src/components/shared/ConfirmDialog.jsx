import { useEffect, useRef } from 'react';
import Scrim from './Scrim.jsx';

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
}) {
  const confirmRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <Scrim onDismiss={onCancel}>
      <div
        className="acc-confirm acc-enter"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="acc-confirm__title">{title}</h2>
        <p className="acc-confirm__body">{body}</p>
        {reassurance && <p className="acc-confirm__reassurance">{reassurance}</p>}

        <div className="acc-confirm__actions">
          <button type="button" className="acc-btn acc-btn--quiet" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`acc-btn acc-btn--primary${tone === 'warn' ? ' acc-btn--warn' : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Scrim>
  );
}
