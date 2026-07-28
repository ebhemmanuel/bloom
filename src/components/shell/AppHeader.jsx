import { useEffect, useRef, useState } from 'react';
import { PRODUCT_NAME } from '../../domain/schema.js';
import { useData } from '../../context/DataContext.jsx';
import { useBoard } from '../../context/BoardContext.jsx';
import MenuBar from './MenuBar.jsx';
import BloomMark from '../onboarding/BloomMark.jsx';
import DatePicker from '../toolbar/DatePicker.jsx';
import useClock from '../../hooks/useClock.js';

function Icon({ path, size = 16 }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      {path}
    </svg>
  );
}

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
 * Brand, then the things you do - File / Edit / Notes / About / Find - then the
 * two things that are only ever reported to you: alerts and the time.
 *
 * The notes icon and the avatar used to sit on the right as well. Both were
 * glyphs standing in for a word, and both are now named where they belong:
 * Notes in the bar, Settings under File. That leaves the right-hand side to
 * mean one thing rather than three.
 *
 * Search is an icon rather than a field. It opens the same overlay Ctrl+Space
 * does - one search, one behaviour, reached two ways - instead of a second
 * always-visible box that did a narrower job in a worse place.
 */
export default function AppHeader({
  menus,
  notifications,
  openPanel,
  onOpenNotifications,
  onOpenSearch,
}) {
  const { doc } = useData();
  const { dateKey, setDateKey, range, setRange } = useBoard();
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
        menus stay put as the brand and the icon row change width. Both of those
        are pinned to their ends, which is what leaves the middle free.
      */}
      <div className="acc-header__menus">
        <MenuBar menus={menus} />

        {/*
          Find sits with the menus rather than in the icon row. Searching is
          something you go and do, like opening a menu; the cluster on the right
          is only what the app reports back.
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
        {/*
          Which day you are recording, in the bar rather than in the board's own
          toolbar. It governs everything below it - the lanes, the notes dialog,
          what a copy copies - so it belongs with the app's chrome and not among
          the controls that only arrange the lanes.
        */}
        <DatePicker
          dateKey={dateKey}
          onChange={setDateKey}
          onRangeChange={setRange}
          activeRange={range}
          nonInstructionalDates={doc.schoolCalendar?.nonInstructionalDates || []}
        />

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

        {/*
          The wall clock, last. Useful here rather than decorative: the day
          closes itself at the end time in the profile, so "have I still got
          time to record this" is a real question with a real answer.

          Last, behind a hairline, because it is the one thing in this row that
          is not a control. Standing among the buttons made it look like one.
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
