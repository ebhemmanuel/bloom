import { useMemo, useState } from 'react';
import { usePopoverDismiss } from '../shell/AppHeader.jsx';
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
 * Two modes. Day picks the board's date. Range picks a start and end for the
 * range report, and reports how many SCHOOL days that spans - a teacher asked for
 * "last week" means five days, not seven, and the difference matters on a
 * compliance denominator.
 */
export default function DatePicker({ dateKey, onChange, nonInstructionalDates = [] }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('day');
  const [anchor, setAnchor] = useState(dateKey);
  const [range, setRange] = useState({ start: null, end: null });

  const ref = usePopoverDismiss(open, () => setOpen(false));
  const skip = useMemo(() => new Set(nonInstructionalDates), [nonInstructionalDates]);
  const today = todayKey();

  const isPickable = (key) => !isWeekend(key) && !skip.has(key);

  const nextSchoolDay = (from, direction) => {
    let next = addDays(from, direction);
    for (let i = 0; i < 14; i += 1) {
      if (isPickable(next)) break;
      next = addDays(next, direction);
    }
    return next;
  };

  const step = (direction) => onChange((current) => nextSchoolDay(current, direction));

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
      <button
        type="button"
        className="acc-datepicker__step"
        onClick={() => step(-1)}
        aria-label="Previous school day"
      >
        ‹
      </button>

      <div className="acc-datepicker__anchor">
        <button
          type="button"
          className={`acc-btn acc-datepicker__trigger${open ? ' acc-btn--on' : ''}`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Pick a date or range"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <rect
              x="2"
              y="3"
              width="12"
              height="11"
              rx="1.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <path d="M2 6.5h12" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M5.5 1.5v3M10.5 1.5v3"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
          {/*
            Just the date. A "Today"/"Tomorrow" prefix changes the label's width
            as you step through the week, which shoves every control to its right
            around - the row must not move while you are clicking through it.
          */}
          <strong>{formatDateMedium(dateKey)}</strong>
          <svg
            viewBox="0 0 16 16"
            width="12"
            height="12"
            aria-hidden="true"
            className="acc-datepicker__caret"
          >
            <path
              d="M4 6l4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {open && (
          <div className="acc-cal acc-enter" ref={ref} role="dialog" aria-label="Choose a date">
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
                    <button
                      type="button"
                      className="acc-btn acc-btn--small"
                      onClick={() => {
                        onChange(rangeDays[0] || range.start);
                        setOpen(false);
                      }}
                    >
                      Go to first day
                    </button>
                  </>
                ) : (
                  <span className="acc-cal__rangelabel">
                    {range.start ? 'Now pick the end date.' : 'Pick a start date.'}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        className="acc-datepicker__step"
        onClick={() => step(1)}
        aria-label="Next school day"
      >
        ›
      </button>
    </div>
  );
}
