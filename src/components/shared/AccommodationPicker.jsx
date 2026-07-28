import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../../context/DataContext.jsx';
import { splitAccommodationList, suggestAccommodations } from '../../domain/importStudent.js';

/**
 * One field for finding an accommodation or writing a new one.
 *
 * Three inputs in one box, because a teacher's source varies mid-year:
 * - type 2+ characters -> suggestions from the catalog they already use
 * - type anything else -> a new accommodation, which joins the catalog so the
 *     next student can reuse the same wording
 * - paste several (commas / tabs / newlines from a spreadsheet) -> "Add all N"
 *
 * Shared rather than copied. The lane and the student profile grew their own
 * versions of this: same domain calls underneath, but one was a rounded search
 * with a suggestion list and the other a plain rectangle that only offered
 * suggestions once you had already committed to typing. Two controls that do
 * the same job have to look the same, and the reliable way to guarantee that is
 * for them to be the same control.
 *
 * `onCommit(items)` receives the parsed list. What "added" means - which date it
 * runs from, whose board it lands on - belongs to the caller.
 */
export default function AccommodationPicker({
  studentId,
  value,
  onChange,
  onCommit,
  onCancel,
  disabled = false,
  autoFocus = false,
  placeholder = 'Type, or paste several at once',
  hint,
}) {
  const { doc } = useData();

  const suggestions = useMemo(
    () => (studentId ? suggestAccommodations(doc, studentId, value) : []),
    [doc, studentId, value]
  );

  // More than one entry in the box means it was pasted, not typed.
  const parsed = useMemo(() => splitAccommodationList(value), [value]);
  const isBulk = parsed.length > 1;

  const fieldRef = useRef(null);
  const [at, setAt] = useState(null);
  const showList = suggestions.length > 0 && !isBulk;

  /**
   * Where the list hangs, in viewport coordinates.
   *
   * Portalled to <body> and positioned rather than rendered in place, for two
   * reasons that both bite here. Rendered in flow it PUSHED the layout - the
   * hint, and in the profile the whole bottom row, moved down as you typed and
   * back up as you stopped, which is unusable when the thing you are aiming at
   * is a list item. And absolutely positioned it was clipped: the modal body
   * scrolls and the modal itself is `overflow: hidden`, so the list would have
   * been cut off at the panel edge.
   *
   * `position: fixed` alone would not have saved it either. The scrim behind
   * every dialog carries a `backdrop-filter`, which makes it a containing block
   * for fixed descendants - the same trap the calendar hit. The portal is the
   * way out, and it is the one this codebase already takes for the calendar and
   * the context menus.
   */
  useLayoutEffect(() => {
    if (!showList) {
      setAt(null);
      return;
    }
    const place = () => {
      const box = fieldRef.current?.getBoundingClientRect();
      if (!box) return;
      // Opens upward when there is not room beneath. The profile pins this
      // field to the foot of the modal, so downward is often no room at all.
      const below = window.innerHeight - box.bottom;
      const needed = Math.min(suggestions.length * 40 + 8, 220);
      const up = below < needed && box.top > below;
      setAt({
        left: Math.round(box.left),
        width: Math.round(box.width),
        top: up ? null : Math.round(box.bottom + 4),
        bottom: up ? Math.round(window.innerHeight - box.top + 4) : null,
      });
    };
    place();
    window.addEventListener('resize', place);
    // Capture: the modal body is the scroller, not the window.
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [showList, suggestions.length, value]);

  // A click anywhere else puts the list away without taking the text with it.
  useEffect(() => {
    if (!showList) return undefined;
    const onDown = (e) => {
      if (!fieldRef.current?.contains(e.target) && !e.target.closest?.('.acc-accpick__suggest')) {
        setAt(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showList]);

  return (
    <form
      className="acc-accpick"
      onSubmit={(e) => {
        e.preventDefault();
        onCommit(parsed);
      }}
    >
      {/*
        The app's attached input-and-action pair, not a field with a button
        floating under it. Every other "type something, then Save/Add" in Bloom
        is an `.acc-inputgroup` sharing one border, and this was the one place
        that had drifted - which also meant its Add could sit misaligned under
        the field it acted on.
      */}
      <div className="acc-inputgroup" ref={fieldRef}>
        <input
          className="acc-inputgroup__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && onCancel) {
              onChange('');
              onCancel();
            }
          }}
          placeholder={placeholder}
          aria-label="Find or add an accommodation"
          disabled={disabled}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus}
        />
        <button
          type="submit"
          className="acc-inputgroup__action"
          disabled={disabled || parsed.length === 0}
        >
          {isBulk ? `Add all ${parsed.length}` : 'Add'}
        </button>
      </div>

      {/* Only where there is something to back out OF - the lane's fold-out
          form. In the profile the field is simply always there. */}
      {onCancel && (
        <div className="acc-accpick__actions">
          <button
            type="button"
            className="acc-btn acc-btn--small acc-btn--quiet"
            onClick={() => {
              onChange('');
              onCancel();
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {hint && <p className="acc-accpick__hint">{hint}</p>}

      {/* Suppressed on a paste: a list of near-matches is noise when the
          teacher has already supplied every line they want. */}
      {showList &&
        at &&
        createPortal(
          <ul
            className="acc-accpick__suggest acc-enter"
            style={{
              '--acc-suggest-left': `${at.left}px`,
              '--acc-suggest-width': `${at.width}px`,
              ...(at.top === null
                ? { '--acc-suggest-bottom': `${at.bottom}px` }
                : { '--acc-suggest-top': `${at.top}px` }),
            }}
            data-drop={at.top === null ? 'up' : 'down'}
          >
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={disabled}
                  // `mousedown`, not click: the outside-click listener above
                  // fires first on mousedown and would unmount this row before
                  // a click could ever land on it.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onCommit([
                      { label: s.label, category: s.category, requiresDetail: s.requiresDetail },
                    ]);
                  }}
                >
                  {s.label}
                  {s.requiresDetail && <span className="acc-accpick__flag">needs detail</span>}
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </form>
  );
}
