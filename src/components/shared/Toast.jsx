/**
 * Floating action notice.
 *
 * Anchored just outside the board container and expanding upward, rather than
 * pushing into the flow as a banner - a notice about an action you just took
 * should not shove the lanes you are reading down the page.
 */
export default function Toast({ tone = 'ok', text, confirmLabel, onConfirm, onDismiss }) {
  return (
    <div className={`acc-toast acc-toast--${tone} acc-enter`} role="status">
      <span className="acc-toast__text">{text}</span>
      <span className="acc-toast__actions">
        {confirmLabel && onConfirm && (
          <button
            type="button"
            className="acc-btn acc-btn--small"
            onClick={() => {
              onDismiss();
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        )}
        <button type="button" className="acc-btn acc-btn--small acc-btn--quiet" onClick={onDismiss}>
          Dismiss
        </button>
      </span>
    </div>
  );
}
