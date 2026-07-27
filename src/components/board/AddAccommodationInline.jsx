import { useMemo, useState } from 'react';
import { useData } from '../../context/DataContext.jsx';
import {
  splitAccommodationList,
  suggestAccommodations,
  addAccommodationsToStudent,
} from '../../domain/importStudent.js';
import { ensureDay } from '../../domain/seed.js';

/**
 * Add an accommodation to one student, from inside their lane.
 *
 * Three inputs in one field, because a teacher's source varies mid-year:
 *   - type 2+ characters → suggestions from the catalog they already use
 *   - type anything else → a new accommodation, which joins the catalog so the
 *     next student can reuse the same wording
 *   - paste several (commas / tabs / newlines from a spreadsheet) → "Add all N"
 *
 * Everything added here is dated from the day in view FORWARD. Earlier days never
 * gain the card, so they cannot seal it as Not Used — the teacher must never be
 * documented as missing something that had not been assigned yet.
 */
export default function AddAccommodationInline({ studentId, dateKey }) {
  const { doc, mutate } = useData();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  const suggestions = useMemo(
    () => suggestAccommodations(doc, studentId, value),
    [doc, studentId, value]
  );

  // More than one entry in the box means it was pasted, not typed.
  const parsed = useMemo(() => splitAccommodationList(value), [value]);
  const isBulk = parsed.length > 1;

  const commit = (items) => {
    if (items.length === 0) return;
    mutate((d) => {
      const { doc: withAssignments } = addAccommodationsToStudent(d, studentId, items, {
        effectiveFrom: dateKey,
      });
      // Re-seed the day so the new cards appear immediately rather than tomorrow.
      return ensureDay(withAssignments, dateKey);
    });
    setValue('');
    setOpen(false);
  };

  if (!open) {
    return (
      <li className="acc-addacc">
        <button type="button" className="acc-addacc__trigger" onClick={() => setOpen(true)}>
          + Add accommodation
        </button>
      </li>
    );
  }

  return (
    <li className="acc-addacc acc-addacc--open acc-enter">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          commit(parsed);
        }}
      >
        <input
          className="acc-addacc__input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setValue('');
              setOpen(false);
            }
          }}
          placeholder="Type, or paste several at once"
          aria-label="Add an accommodation"
          autoFocus
        />

        {suggestions.length > 0 && !isBulk && (
          <ul className="acc-addacc__suggest">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() =>
                    commit([
                      { label: s.label, category: s.category, requiresDetail: s.requiresDetail },
                    ])
                  }
                >
                  {s.label}
                  {s.requiresDetail && <span className="acc-addacc__flag">needs detail</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="acc-addacc__actions">
          <button
            type="submit"
            className="acc-btn acc-btn--small acc-btn--primary"
            disabled={parsed.length === 0}
          >
            {isBulk ? `Add all ${parsed.length}` : 'Add'}
          </button>
          <button
            type="button"
            className="acc-btn acc-btn--small acc-btn--quiet"
            onClick={() => {
              setValue('');
              setOpen(false);
            }}
          >
            Cancel
          </button>
        </div>

        <p className="acc-addacc__hint">
          Records from {dateKey} forward — earlier days are untouched.
        </p>
      </form>
    </li>
  );
}
