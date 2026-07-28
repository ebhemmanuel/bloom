import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePopoverDismiss } from '../shell/AppHeader.jsx';
import Caret from '../shared/Caret.jsx';
import {
  addDays,
  toDateKey,
  parseDateKey,
  compareDateKeys,
  eachDateInRange,
  formatDateMedium,
  relativeDayLabel,
  isWeekend,
  todayKey,
} from '../../domain/dates.js';

const WEEK_HEADS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Calendar grid for a month, Monday-first, padded to whole weeks. */
function monthGrid(anchor) {
  const first = parseDateKey(`${anchor.slice(0, 7)}-01`);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const start = addDays(toDateKey(first), -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/**
 * Date control: a pill button that opens a calendar popover.
 *
 * One control, not three. It carried a day-stepping arrow either side once,
 * which put two single-purpose buttons permanently in the row to do what the
 * calendar already does in one click, and made the date read as a spinner
 * rather than as a thing you choose.
 *
 * Two modes. Day picks the board's date. Range picks a start and end for the
 * range report, and reports how many SCHOOL days that spans - a teacher asking
 * for "last week" means five days, not seven, and the difference matters on a
 * compliance denominator.
 */
export default function DatePicker({
  dateKey,
  onChange,
  onRangeChange,
  activeRange,
  nonInstructionalDates = [],
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('day');
  const [anchor, setAnchor] = useState(dateKey);
  const [range, setRange] = useState({ start: null, end: null });
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

  /**
   * The board dropped the range, so the calendar has to drop it too.
   *
   * The selection is held here rather than lifted, so clearing the toolbar chip
   * left the picker still painting the old span, still sitting in range mode,
   * and still offering to apply it. From the teacher's side the filter had been
   * cleared everywhere except the one control that sets it.
   */
  useEffect(() => {
    if (activeRange) return;
    setRange({ start: null, end: null });
    setMode('day');
  }, [activeRange]);

  const skip = useMemo(() => new Set(nonInstructionalDates), [nonInstructionalDates]);
  const today = todayKey();

  const isPickable = (key) => !isWeekend(key) && !skip.has(key);

  const pick = (key) => {
    if (!isPickable(key)) return;

    if (mode === 'day') {
      onChange(key);
      setOpen(false);
      return;
    }

    // Range: first click sets the start, second completes it. Clicking before
    // the current start restarts rather than producing an inverted range.
    setRange((prev) => {
      if (!prev.start || prev.end) return { start: key, end: null };
      if (compareDateKeys(key, prev.start) < 0) return { start: key, end: null };
      return { start: prev.start, end: key };
    });
  };

  const rangeDays = useMemo(() => {
    if (!range.start || !range.end) return [];
    return eachDateInRange(range.start, range.end).filter(isPickable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end, nonInstructionalDates]);

  const relative = relativeDayLabel(dateKey);
  const grid = monthGrid(anchor);
  const monthLabel = parseDateKey(anchor).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const inRange = (key) =>
    range.start &&
    range.end &&
    compareDateKeys(key, range.start) >= 0 &&
    compareDateKeys(key, range.end) <= 0;

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
          aria-label="Pick a date or range"
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
              <div className="acc-cal__head">
                <button
                  type="button"
                  className="acc-cal__nav"
                  onClick={() => setAnchor(addDays(`${anchor.slice(0, 7)}-01`, -1))}
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <span className="acc-cal__month">{monthLabel}</span>
                <button
                  type="button"
                  className="acc-cal__nav"
                  onClick={() => setAnchor(addDays(`${anchor.slice(0, 7)}-28`, 7))}
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>

              <div className="acc-cal__modes" role="group" aria-label="Pick mode">
                {['day', 'range'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`acc-cal__mode${mode === m ? ' acc-cal__mode--on' : ''}`}
                    aria-pressed={mode === m}
                    onClick={() => {
                      setMode(m);
                      setRange({ start: null, end: null });
                    }}
                  >
                    {m === 'day' ? 'Day' : 'Range'}
                  </button>
                ))}
              </div>

              <div className="acc-cal__grid" role="grid">
                {WEEK_HEADS.map((h, i) => (
                  <span key={`${h}${i}`} className="acc-cal__weekhead" aria-hidden="true">
                    {h}
                  </span>
                ))}

                {grid.map((key) => {
                  const outside = key.slice(0, 7) !== anchor.slice(0, 7);
                  const disabled = !isPickable(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={disabled}
                      onClick={() => pick(key)}
                      aria-label={formatDateMedium(key)}
                      className={[
                        'acc-cal__day',
                        outside && 'acc-cal__day--outside',
                        disabled && 'acc-cal__day--off',
                        key === today && 'acc-cal__day--today',
                        key === dateKey && mode === 'day' && 'acc-cal__day--current',
                        inRange(key) && 'acc-cal__day--inrange',
                        (key === range.start || key === range.end) && 'acc-cal__day--edge',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {Number(key.slice(8))}
                    </button>
                  );
                })}
              </div>

              {mode === 'range' && (
                <div className="acc-cal__range">
                  {range.start && range.end ? (
                    <>
                      <span className="acc-cal__rangelabel">
                        {formatDateMedium(range.start)} – {formatDateMedium(range.end)} ·{' '}
                        {rangeDays.length} school day{rangeDays.length === 1 ? '' : 's'}
                      </span>
                      {/*
                        Shows the span on the board rather than jumping to its
                        first day. "Go to first day" quietly threw the range
                        away, which made picking one feel like it did nothing.
                      */}
                      <button
                        type="button"
                        className="acc-btn acc-btn--small acc-btn--primary"
                        onClick={() => {
                          onRangeChange({ from: range.start, to: range.end });
                          setOpen(false);
                        }}
                      >
                        Show these days
                      </button>
                    </>
                  ) : (
                    <span className="acc-cal__rangelabel">
                      {range.start ? 'Now pick the end date.' : 'Pick a start date.'}
                    </span>
                  )}
                </div>
              )}
            </div>,
            document.body
          )}
      </div>
    </div>
  );
}
