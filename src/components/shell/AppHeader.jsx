import { useEffect, useRef, useState } from 'react';
import { PRODUCT_NAME } from '../../domain/schema.js';
import { useData } from '../../context/DataContext.jsx';
import { useBoard } from '../../context/BoardContext.jsx';
import MenuBar from './MenuBar.jsx';
import BloomMark from '../onboarding/BloomMark.jsx';
import DatePicker from '../toolbar/DatePicker.jsx';
import useClock from '../../hooks/useClock.js';
import useSpinOnHover from '../../hooks/useSpinOnHover.js';

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
 * Brand, then everything you can press - File / Edit / Notes / About, Find and
 * the alert bell - then, at the far end, the two things that are only state:
 * which day you are recording and what time it is.
 *
 * The notes icon and the avatar used to sit on the right as well. Both were
 * glyphs standing in for a word, and both are now named where they belong:
 * Notes in the bar, Settings under File.
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
  onOpenAbout,
}) {
  const { doc } = useData();
  const { dateKey, setDateKey } = useBoard();
  // Only warnings light the bell. The info items (nothing recorded yet, days
  // not closed out) are ambient status for when the panel is opened - a badge
  // that stays lit over them all day reads as a problem that never was.
  const unread = notifications.filter((n) => n.tone === 'warn').length;
  // The mark turns under the pointer and finishes the turn on the way out.
  const { turning, spinProps } = useSpinOnHover();
  const now = useClock();

  return (
    <header className="acc-header">
      {/*
        The brand and the menus, together at the left end.

        File and Edit used to be centred on the bar. They are the app's own
        menus, so they belong with the app's own name: a teacher looking for
        them looks top left, the way they do in everything else on the machine,
        and the middle of the bar is left to the search.
      */}
      <div className="acc-header__left">
        {/*
          The lockup opens About, the way a product's own name usually does.

          A button rather than a div: it was inert, and an inert logo beside two
          live menus is the one thing in the bar a teacher might try to click
          and get nothing from. The bar only exists on the board, so there is no
          state where this leads somewhere it already is.
        */}
        <button
          type="button"
          className={`acc-header__brand${turning ? ' acc-spin' : ''}`}
          onClick={onOpenAbout}
          aria-label={`About ${PRODUCT_NAME}`}
          title={`About ${PRODUCT_NAME}`}
          {...spinProps}
        >
          {/* The same mark onboarding ends on, so the logo the teacher just
              watched bloom is the one that stays with them. */}
          <BloomMark size={22} />
          <span className="acc-header__name">{PRODUCT_NAME}</span>
        </button>

        <MenuBar menus={menus} />
      </div>

      {/*
        Find a student, as a field rather than a glyph.

        It was an icon that opened the palette, which is the fast way for anyone
        who already knows the palette exists - and nobody does. A box that says
        "Find a student" is the only version of this a teacher discovers without
        being told. Clicking it still opens the same overlay, so there is one
        search with one behaviour, reached two ways.
      */}
      {/*
        A div, not a button, because the bell lives inside it and a button
        cannot contain another one. The field itself is the button; the bell is
        its neighbour, sharing the same pill.
      */}
      <div className="acc-header__search">
        <button
          type="button"
          className="acc-header__searchmain"
          onClick={onOpenSearch}
          aria-label="Find a student or period"
          title="Find a student or period  ·  Ctrl+Space"
        >
          <Icon path={SEARCH_ICON} size={15} />
          <span className="acc-header__search-label">Find a student…</span>
        </button>

        {/*
          The bell, at the far end of the search rather than out beside the
          date. Both are ways of asking the app what is going on, and one pill
          holding the pair keeps the middle of the bar to a single object
          instead of a field and a floating glyph. Drawn at the magnifier's
          weight and colour so neither reads as louder than the other.
        */}
        <button
          type="button"
          className={`acc-header__bell${openPanel === 'notifications' ? ' acc-header__bell--on' : ''}`}
          onClick={onOpenNotifications}
          aria-label={unread ? `Notifications, ${unread} to review` : 'Notifications'}
          aria-expanded={openPanel === 'notifications'}
        >
          <Icon path={BELL_ICON} size={15} />
          {unread > 0 && (
            <span className="acc-header__dot acc-numeric">{unread > 9 ? '9+' : unread}</span>
          )}
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
          nonInstructionalDates={doc.schoolCalendar?.nonInstructionalDates || []}
        />

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
