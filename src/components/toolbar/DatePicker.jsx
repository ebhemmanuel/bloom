import { useMemo } from 'react';
import { addDays, formatDateMedium, relativeDayLabel, isWeekend } from '../../domain/dates.js';

/**
 * Date stepper plus a native date input.
 *
 * Native `<input type="date">` on purpose: it is fully offline, keyboard
 * accessible, localised by the OS, and costs no dependency. A hand-rolled
 * calendar would be worse on all four counts.
 *
 * The arrows skip weekends and non-instructional dates, because stepping through
 * four empty days to reach Monday is the kind of small friction that makes a
 * daily tool tiring.
 */
export default function DatePicker({ dateKey, onChange, nonInstructionalDates = [] }) {
  const skip = useMemo(() => new Set(nonInstructionalDates), [nonInstructionalDates]);

  const nextSchoolDay = (from, direction) => {
    let next = addDays(from, direction);
    for (let i = 0; i < 14; i += 1) {
      if (!isWeekend(next) && !skip.has(next)) break;
      next = addDays(next, direction);
    }
    return next;
  };

  // Pass an updater, not a computed value. Two rapid clicks would otherwise both
  // read the same stale `dateKey` prop and land on the same day — and teachers do
  // hold down the arrow to walk back through a week.
  const step = (direction) => onChange((current) => nextSchoolDay(current, direction));

  const relative = relativeDayLabel(dateKey);

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

      <div className="acc-datepicker__center">
        <input
          type="date"
          className="acc-datepicker__input"
          value={dateKey}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          aria-label="Board date"
        />
        <span className="acc-datepicker__label">
          {relative ? <strong>{relative}</strong> : formatDateMedium(dateKey)}
        </span>
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
