import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ABSENCE_REASONS } from '../../domain/constants.js';
import { formatDateMedium } from '../../domain/dates.js';

/**
 * Right-click a student's name.
 *
 * Rename, mark them absent for the day, or unenrol them from this date onward.
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
  onToggleAbsent,
  onUnenrol,
}) {
  const [renaming, setRenaming] = useState(false);
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
        <p className="acc-ctx__title">{lane.displayName}</p>

        <div className="acc-ctx__group">
          <p className="acc-ctx__heading">Name</p>
          {renaming ? (
            <form
              className="acc-ctx__rename"
              onSubmit={(e) => {
                e.preventDefault();
                onRename(name);
                onClose();
              }}
            >
              <div className="acc-inputgroup">
                <input
                  className="acc-inputgroup__input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setRenaming(false)}
                  aria-label="New name"
                  autoFocus
                />
                <button type="submit" className="acc-inputgroup__action" disabled={!name.trim()}>
                  Save
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="acc-ctx__item"
              onClick={() => setRenaming(true)}
            >
              Rename…
            </button>
          )}
        </div>

        <div className="acc-ctx__group">
          <p className="acc-ctx__heading">Today</p>
          <button
            type="button"
            role="menuitem"
            className="acc-ctx__item"
            onClick={() => {
              onToggleAbsent();
              onClose();
            }}
          >
            {lane.absent ? 'Mark present' : 'Mark absent'}
          </button>
          {!lane.absent && (
            <div className="acc-ctx__counts">
              {ABSENCE_REASONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="acc-ctx__count"
                  onClick={() => {
                    onToggleAbsent(r.id);
                    onClose();
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="acc-ctx__group">
          <p className="acc-ctx__heading">Enrolment</p>
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
                Re-enrol
              </button>
              <p className="acc-ctx__note">
                Currently unenrolled from {formatDateMedium(unenrolledFrom)}.
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
                Unenrol from {formatDateMedium(dateKey)}
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
