import { useEffect, useRef, useState } from 'react';
import { useData } from '../../context/DataContext.jsx';

/**
 * Initials for the avatar. "Ms. Rivera" → R, "Jordan Alvarez" → JA.
 *
 * A leading honorific is dropped WITH its trailing period — otherwise "Ms."
 * leaves a bare "." behind and the avatar reads ".R". Only word-initial letters
 * are used, so punctuation can never reach the avatar.
 */
export function initialsOf(name) {
  const parts = String(name || '')
    .replace(/^\s*(mr|mrs|ms|miss|dr|mx|prof)\.?\s+/i, '')
    .split(/[\s.]+/)
    // Keep only fragments that actually start with a letter.
    .map((p) => p.match(/\p{L}/u)?.[0])
    .filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].toUpperCase();
  return (parts[0] + parts[parts.length - 1]).toUpperCase();
}

function BellIcon() {
  return (
    <svg viewBox="0 0 16 16" width="17" height="17" aria-hidden="true">
      <path
        d="M8 2a3.6 3.6 0 0 0-3.6 3.6v2.1L3.2 9.9h9.6l-1.2-2.2V5.6A3.6 3.6 0 0 0 8 2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 11.7a1.6 1.6 0 0 0 3 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Top navigation: product name at the left, notifications and the teacher's
 * avatar at the right. Clicking the avatar opens their own details.
 */
export default function AppHeader({
  notifications,
  onOpenSettings,
  onOpenNotifications,
  openPanel,
}) {
  const { doc } = useData();
  const teacher =
    doc.teachers.find((t) => t.id === doc.settings?.activeTeacherId) || doc.teachers[0];
  const unread = notifications.length;

  return (
    <header className="acc-header">
      <div className="acc-header__brand">
        <span className="acc-header__mark" aria-hidden="true" />
        <span className="acc-header__name">Accommodations Tracker</span>
      </div>

      <div className="acc-header__right">
        <button
          type="button"
          className={`acc-header__icon${openPanel === 'notifications' ? ' acc-header__icon--on' : ''}`}
          onClick={onOpenNotifications}
          aria-label={unread ? `Notifications, ${unread} to review` : 'Notifications'}
          aria-expanded={openPanel === 'notifications'}
        >
          <BellIcon />
          {unread > 0 && (
            <span className="acc-header__dot acc-numeric">{unread > 9 ? '9+' : unread}</span>
          )}
        </button>

        <button
          type="button"
          className={`acc-avatar${openPanel === 'settings' ? ' acc-avatar--on' : ''}`}
          onClick={onOpenSettings}
          aria-label={`Your details — ${teacher?.displayName || 'set up your name'}`}
          aria-expanded={openPanel === 'settings'}
          title={teacher?.displayName || 'Your details'}
        >
          {initialsOf(teacher?.displayName)}
        </button>
      </div>
    </header>
  );
}

/**
 * Dismiss-on-outside-click / Escape for the header popovers.
 * Shared so both panels behave identically.
 */
export function usePopoverDismiss(open, onClose) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };

    // `mousedown` rather than `click`: a click that starts inside and ends
    // outside should not count as an outside click.
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return ref;
}

export function useHeaderPanel() {
  const [openPanel, setOpenPanel] = useState(null);
  const toggle = (name) => setOpenPanel((cur) => (cur === name ? null : name));
  return { openPanel, toggle, close: () => setOpenPanel(null) };
}
