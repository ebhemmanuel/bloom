import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePopoverDismiss } from '../shell/AppHeader.jsx';
import Caret from '../shared/Caret.jsx';
import CalendarPanel from '../shared/CalendarPanel.jsx';
import { formatDateMedium, isWeekend } from '../../domain/dates.js';

/**
 * Date control: a pill button that opens a calendar popover.
 *
 * One control, not three. It carried a day-stepping arrow either side once,
 * which put two single-purpose buttons permanently in the row to do what the
 * calendar already does in one click, and made the date read as a spinner
 * rather than as a thing you choose.
 *
 * One thing to pick, too: a day. It offered a Day/Range switch above the grid,
 * which made every visit to the calendar start with a question about which kind
 * of date you meant - for a control whose whole job is "show me this day".
 * Reports over a span are asked for where they are produced, in Print report.
 */
export default function DatePicker({ dateKey, onChange, nonInstructionalDates = [] }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(dateKey);
  const [at, setAt] = useState({ top: 0, right: 0 });

  const ref = usePopoverDismiss(open, () => setOpen(false));
  const triggerRef = useRef(null);

  /**
   * Where the calendar goes, in viewport coordinates.
   *
   * Measured from the trigger each time it opens rather than positioned
   * relatively, because the calendar is portalled out of the toolbar to escape
   * the board's clipping.
   *
   * Anchored by its RIGHT edge, published as a distance from the viewport's
   * right so the width of the calendar never enters into it. The trigger now
   * lives at the end of the nav, and hanging it off the left meant a 308px panel
   * running past the window; clamping that back left it not lined up with
   * anything at all.
   */
  const place = () => {
    const box = triggerRef.current?.getBoundingClientRect();
    if (!box) return;
    setAt({
      top: Math.min(box.bottom + 6, window.innerHeight - 380),
      right: Math.max(8, window.innerWidth - box.right),
    });
  };

  // A scroll or a resize moves the trigger out from under it, so close rather
  // than let the calendar float somewhere it no longer belongs.
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const skip = useMemo(() => new Set(nonInstructionalDates), [nonInstructionalDates]);

  const isPickable = (key) => !isWeekend(key) && !skip.has(key);

  const pick = (key) => {
    if (!isPickable(key)) return;
    onChange(key);
    setOpen(false);
  };

  return (
    <div className="acc-datepicker">
      <div className="acc-datepicker__anchor">
        <button
          type="button"
          ref={triggerRef}
          className={`acc-datepicker__trigger${open ? ' acc-datepicker__trigger--on' : ''}`}
          onClick={() => {
            // Always open on the month you are actually on. The anchor only
            // seeded from `dateKey` at mount, so after browsing to April and
            // closing, the next open still started in April.
            if (!open) {
              place();
              setAnchor(dateKey);
            }
            setOpen((o) => !o);
          }}
          aria-expanded={open}
          aria-label="Pick a date"
        >
          {/*
            Just the date. A "Today"/"Tomorrow" prefix changes the label's width
            as you step through the week, which shoves every control to its right
            around - the row must not move while you are clicking through it.
          */}
          <Caret up={open} />
          <span className="acc-datepicker__label">{formatDateMedium(dateKey)}</span>
        </button>

        {open &&
          createPortal(
            <div
              className="acc-cal acc-enter"
              ref={ref}
              role="dialog"
              aria-label="Choose a date"
              style={{ '--acc-cal-top': `${at.top}px`, '--acc-cal-right': `${at.right}px` }}
            >
              <CalendarPanel
                anchor={anchor}
                value={dateKey}
                onAnchor={setAnchor}
                onPick={pick}
                // The board cannot record on a weekend or a date the teacher
                // marked non-instructional, so neither can be chosen here.
                isDisabled={(key) => !isPickable(key)}
              />
            </div>,
            document.body
          )}
      </div>
    </div>
  );
}
