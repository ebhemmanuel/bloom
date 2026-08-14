import { createPortal } from 'react-dom';
import useDismissAnimation from '../../hooks/useDismissAnimation.js';

/**
 * Floating action notice.
 *
 * Fixed over the nav and centred on the window, rather than pushing into the
 * flow as a banner - a notice about an action you just took should not shove
 * the lanes you are reading down the page, and it should land where you are
 * already looking. See `.acc-toast`.
 *
 * Portalled to <body>, the same escape the context menus take. It is raised
 * from inside the board toolbar, and `.acc-app__main` carries a
 * `backdrop-filter`, which makes it the containing block for `position: fixed`
 * descendants - so a toast rendered in place measured its offset from the top
 * of the board rather than from the top of the window and hung 90px too low.
 *
 * It fades BOTH ways, and only fades: it covers the search while it is up, so a
 * toast that rose into place or dropped out of it would read as the nav itself
 * moving. `useDismissAnimation` holds it mounted for the length of the exit -
 * without it React unmounts on the click and the notice is simply gone, which
 * is the thing that made it feel broken.
 */
export default function Toast({ tone = 'ok', text, confirmLabel, onConfirm, onDismiss }) {
  const { leaving, dismiss, dismissThen } = useDismissAnimation(onDismiss);

  return createPortal(
    <div
      className={`acc-toast acc-toast--${tone} ${leaving ? 'acc-fade-leave' : 'acc-fade-enter'}`}
      role="status"
    >
      <span className="acc-toast__text">{text}</span>
      <span className="acc-toast__actions">
        {confirmLabel && onConfirm && (
          // Acts and leaves. `dismissThen` runs the action after the fade
          // rather than instead of it, so confirming does not cut where
          // dismissing eases.
          <button
            type="button"
            className="acc-btn acc-btn--small"
            onClick={dismissThen(() => {
              onDismiss();
              onConfirm();
            })}
          >
            {confirmLabel}
          </button>
        )}
        <button type="button" className="acc-btn acc-btn--small acc-btn--quiet" onClick={dismiss}>
          Dismiss
        </button>
      </span>
    </div>,
    document.body
  );
}
