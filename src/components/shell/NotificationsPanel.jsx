import { usePopoverDismiss } from './AppHeader.jsx';
import useDismissAnimation from '../../hooks/useDismissAnimation.js';

/**
 * Notifications, opened from the bell.
 *
 * These are real, derived advisories — not a feed. Nothing here is invented or
 * fetched (there is no network); every item is computed from the document by
 * `deriveNotifications` and each one has something the teacher can act on.
 */
export default function NotificationsPanel({ notifications, onClose, onAct }) {
  const { leaving, dismiss, dismissThen } = useDismissAnimation(onClose);
  const ref = usePopoverDismiss(true, dismiss);

  return (
    <div
      className={`acc-popover acc-popover--notifications ${leaving ? 'acc-leave' : 'acc-enter'}`}
      ref={ref}
      role="dialog"
      aria-label="Notifications"
    >
      <header className="acc-popover__header">
        <span className="acc-subhead">Notifications</span>
        <button type="button" className="acc-popover__close" onClick={dismiss} aria-label="Close">
          ×
        </button>
      </header>

      <div className="acc-popover__body">
        {notifications.length === 0 ? (
          <p className="acc-popover__empty">Nothing needs your attention.</p>
        ) : (
          <ul className="acc-notifs">
            {notifications.map((n) => (
              <li key={n.id} className={`acc-notif acc-notif--${n.tone}`}>
                <p className="acc-notif__title">{n.title}</p>
                <p className="acc-notif__body">{n.body}</p>
                {n.action && (
                  <button
                    type="button"
                    className="acc-btn acc-btn--small"
                    onClick={dismissThen(() => {
                      onAct(n);
                      onClose();
                    })}
                  >
                    {n.action}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
