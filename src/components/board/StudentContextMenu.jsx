import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDateMedium } from '../../domain/dates.js';
import { PencilIcon, PrintIcon } from '../shared/RowIcons.jsx';

/**
 * Right-click a student's name.
 *
 * Rename, mark them absent for the day, or disenroll them from this date onward.
 *
 * Portalled to <body> for the same reason the card menu is: the board card
 * carries `backdrop-filter`, which makes it a containing block for
 * `position: fixed`, so a menu rendered in place would be positioned against the
 * board instead of the viewport.
 */
export default function StudentContextMenu({
  lane,
  dateKey,
  unenrolledFrom,
  x,
  y,
  onClose,
  onRename,
  onUnenrol,
  onCopyPrevious,
  onEditProfile,
  onPrint,
}) {
  const [name, setName] = useState(lane.displayName);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - 276);
  const top = Math.min(y, window.innerHeight - 300);

  return createPortal(
    <>
      <div
        className="acc-ctx__overlay"
        onMouseDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="acc-ctx acc-ctx--enter"
        role="menu"
        aria-label={`Actions for ${lane.displayName}`}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ '--acc-ctx-left': `${left}px`, '--acc-ctx-top': `${top}px` }}
      >
        {/*
          The student themselves: their name, editable in place, and the two
          things you can do to their record rather than to today.

          All three used to be menu items under a "Profile" heading, which made
          a section out of a name. Renaming is one field, so it IS the field -
          the same trick the roster rows use, where a typo is fixed where it is
          noticed. Edit and Print are icons beside it because they leave this
          menu entirely, and a row of two glyphs at the end of the title reads
          as "about this student" without spending three lines saying so.

          The groups below keep their headings: they are about the DAY rather
          than the student, and each one changes what is recorded.
        */}
        <div className="acc-ctx__title">
          <input
            className="acc-ctx__name"
            value={name}
            /*
              Written as it is typed, exactly as a roster row's name is - not
              held until blur or a Save button. There is nothing to stage: a
              name is a correction to who somebody is, no day record carries it,
              and the lane behind the menu updates as you go so you can see what
              you are getting.

              An empty field is allowed on screen but never written: clearing it
              to retype is normal, and a nameless student is not.
            */
            onChange={(e) => {
              setName(e.target.value);
              if (e.target.value.trim()) onRename(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onClose();
              if (e.key === 'Escape') {
                setName(lane.displayName);
                onRename(lane.displayName);
              }
            }}
            aria-label={`Name for ${lane.displayName}`}
          />

          <button
            type="button"
            className="acc-ctx__icon"
            onClick={() => {
              onEditProfile();
              onClose();
            }}
            title="Edit their profile"
            aria-label={`Edit ${lane.displayName}`}
          >
            <PencilIcon />
          </button>

          <button
            type="button"
            className="acc-ctx__icon"
            onClick={() => {
              onPrint();
              onClose();
            }}
            title="Print their record"
            aria-label={`Print ${lane.displayName}'s record`}
          >
            <PrintIcon />
          </button>
        </div>

        {/*
          No headings on the groups below.

          Each holds one action whose own label already says what it is: "Copy
          Marcus B.'s last recorded day" does not need FROM THEIR LAST DAY over
          it. The rules between the groups still separate them, which is all the
          grouping was for.

          No Mark absent here either. It is a button on the lane's own header,
          pinned at the far right of the row this menu was opened from, so
          repeating it put the same switch two clicks apart on the same student
          - and only the one in the menu came with excused / unexcused / partial
          underneath it, which is a distinction nothing in this app computes.

          The granular copy stays: the toolbar's version is all or nothing,
          which is the wrong shape when a day was routine for most of the class
          and not for one student.
        */}
        <div className="acc-ctx__group">
          <button
            type="button"
            role="menuitem"
            className="acc-ctx__item"
            onClick={() => {
              onCopyPrevious();
              onClose();
            }}
          >
            Copy {lane.displayName}&rsquo;s last recorded day
          </button>
        </div>

        <div className="acc-ctx__group">
          {unenrolledFrom ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="acc-ctx__item"
                onClick={() => {
                  onUnenrol(null);
                  onClose();
                }}
              >
                Re-enroll
              </button>
              <p className="acc-ctx__note">
                Currently disenrolled from {formatDateMedium(unenrolledFrom)}.
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                className="acc-ctx__item acc-ctx__item--danger"
                onClick={() => {
                  onUnenrol(dateKey);
                  onClose();
                }}
              >
                Disenroll from {formatDateMedium(dateKey)}
              </button>
              <p className="acc-ctx__note">
                They stop appearing from this date on. Every earlier day keeps their record exactly
                as it is - nothing is deleted.
              </p>
            </>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
