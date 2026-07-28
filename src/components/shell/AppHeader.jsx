import { useEffect, useRef, useState } from 'react';
import { useData } from '../../context/DataContext.jsx';
import { PRODUCT_NAME } from '../../domain/schema.js';
import { initialsOf } from '../../domain/initials.js';
import MenuBar from './MenuBar.jsx';
import BloomMark from '../onboarding/BloomMark.jsx';
import useClock from '../../hooks/useClock.js';

function Icon({ path, size = 16 }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      {path}
    </svg>
  );
}

const NOTE_ICON = (
  <>
    <rect
      x="3"
      y="2.5"
      width="10"
      height="11"
      rx="1.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <path
      d="M5.5 6h5M5.5 8.5h5M5.5 11h3"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </>
);

const BELL_ICON = (
  <>
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
  </>
);

const SEARCH_ICON = (
  <>
    <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10.4 10.4 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </>
);

/**
 * Floating pill nav.
 *
 * Brand, then the verbs (File / Edit / About / Find), then the status cluster:
 * day notes, notifications, avatar, clock.
 *
 * Search is an icon rather than a field. It opens the same overlay Ctrl+Space
 * does - one search, one behaviour, reached two ways - instead of a second
 * always-visible box that did a narrower job in a worse place.
 */
export default function AppHeader({
  menus,
  notifications,
  openPanel,
  onOpenSettings,
  onOpenNotifications,
  onOpenDayNotes,
  onOpenSearch,
  hasDayNotes,
}) {
  const { doc } = useData();
  const teacher =
    doc.teachers.find((t) => t.id === doc.settings?.activeTeacherId) || doc.teachers[0];
  const unread = notifications.length;
  const now = useClock();

  return (
    <header className="acc-header">
      <div className="acc-header__brand">
        {/* The same mark onboarding ends on, so the logo the teacher just
            watched bloom is the one that stays with them. */}
        <BloomMark size={22} />
        <span className="acc-header__name">{PRODUCT_NAME}</span>
      </div>

      {/*
        Centred on the bar itself rather than between the two clusters, so the
        menus stay put as the brand and the icon row change width. They moved
        here to fill the middle the search field left when it became an icon.
      */}
      <div className="acc-header__menus">
        <MenuBar menus={menus} />

        {/*
          Find sits with File / Edit / About rather than in the icon row.
          Searching is something you go and do, like opening a menu; the cluster
          on the right is where the app reports back - notes waiting, alerts,
          who you are, what time it is.
        */}
        <button
          type="button"
          className="acc-header__icon"
          onClick={onOpenSearch}
          aria-label="Find a student or period"
          title="Find a student or period  ·  Ctrl+Space"
        >
          <Icon path={SEARCH_ICON} size={17} />
        </button>
      </div>

      <div className="acc-header__right">
        <button
          type="button"
          className={`acc-header__icon${openPanel === 'daynotes' ? ' acc-header__icon--on' : ''}`}
          onClick={onOpenDayNotes}
          aria-label="Day notes"
          aria-expanded={openPanel === 'daynotes'}
          title="Day notes"
        >
          <Icon path={NOTE_ICON} />
          {hasDayNotes && <span className="acc-header__pip" aria-hidden="true" />}
        </button>

        <button
          type="button"
          className={`acc-header__icon${openPanel === 'notifications' ? ' acc-header__icon--on' : ''}`}
          onClick={onOpenNotifications}
          aria-label={unread ? `Notifications, ${unread} to review` : 'Notifications'}
          aria-expanded={openPanel === 'notifications'}
        >
          <Icon path={BELL_ICON} size={17} />
          {unread > 0 && (
            <span className="acc-header__dot acc-numeric">{unread > 9 ? '9+' : unread}</span>
          )}
        </button>

        <button
          type="button"
          className={`acc-avatar${openPanel === 'settings' ? ' acc-avatar--on' : ''}`}
          onClick={onOpenSettings}
          aria-label={`Your details - ${teacher?.displayName || 'set up your name'}`}
          aria-expanded={openPanel === 'settings'}
          title={teacher?.displayName || 'Your details'}
        >
          {initialsOf(teacher?.displayName)}
        </button>

        {/*
          The wall clock, last. Useful here rather than decorative: the day
          closes itself at the end time in the profile, so "have I still got
          time to record this" is a real question with a real answer.

          It sits past the avatar because it is the only thing in this row that
          is not a control. Putting it among the buttons made it look like one.
        */}
        <time className="acc-header__clock acc-numeric" dateTime={now.toISOString()}>
          {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </time>
      </div>
    </header>
  );
}

/**
 * Dismiss-on-outside-click / Escape for the header popovers.
 *
 * `mousedown` rather than `click`: a drag that starts inside and ends outside
 * should not count as an outside click.
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
