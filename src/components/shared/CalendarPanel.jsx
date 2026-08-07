import { useMemo } from 'react';
import {
  addDays,
  toDateKey,
  parseDateKey,
  formatDateMedium,
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
 * The month grid itself, with no opinion about what opens it.
 *
 * Lifted out of the board's date picker so every date in the app is chosen the
 * same way. It was the only real calendar here; enrolment dates were left on
 * the browser's own `<input type="date">`, which draws the operating system's
 * picker - a different grid, a different week start, a different everything,
 * inside a sheet that had been built to look like none of it.
 *
 * Which days are choosable is the CALLER's business. The board refuses weekends
 * and non-instructional dates because nothing can be recorded on them; an
 * enrolment date has no such rule, and a student whose first day is written on
 * a Saturday is a fact about a form, not an error.
 *
 * @param {object} props
 * @param {string} props.anchor  the month on show, as a date key
 * @param {string|null} props.value  the chosen day, if any
 * @param {(key: string) => boolean} [props.isDisabled]
 */
export default function CalendarPanel({ anchor, value, onAnchor, onPick, isDisabled }) {
  const grid = useMemo(() => monthGrid(anchor), [anchor]);
  const today = todayKey();

  const monthLabel = parseDateKey(anchor).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <div className="acc-cal__head">
        <button
          type="button"
          className="acc-cal__nav"
          onClick={() => onAnchor(addDays(`${anchor.slice(0, 7)}-01`, -1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="acc-cal__month">{monthLabel}</span>
        <button
          type="button"
          className="acc-cal__nav"
          onClick={() => onAnchor(addDays(`${anchor.slice(0, 7)}-28`, 7))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="acc-cal__grid" role="grid">
        {WEEK_HEADS.map((h, i) => (
          <span key={`${h}${i}`} className="acc-cal__weekhead" aria-hidden="true">
            {h}
          </span>
        ))}

        {grid.map((key) => {
          const outside = key.slice(0, 7) !== anchor.slice(0, 7);
          const disabled = isDisabled ? isDisabled(key) : false;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onPick(key)}
              aria-label={formatDateMedium(key)}
              className={[
                'acc-cal__day',
                outside && 'acc-cal__day--outside',
                disabled && 'acc-cal__day--off',
                key === today && 'acc-cal__day--today',
                key === value && 'acc-cal__day--current',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {Number(key.slice(8))}
            </button>
          );
        })}
      </div>
    </>
  );
}
