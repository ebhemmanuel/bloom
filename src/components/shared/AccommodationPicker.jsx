import { useMemo } from 'react';
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

  return (
    <form
      className="acc-accpick"
      onSubmit={(e) => {
        e.preventDefault();
        onCommit(parsed);
      }}
    >
      <input
        className="acc-accpick__input"
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

      {/* Suppressed on a paste: a list of near-matches is noise when the
          teacher has already supplied every line they want. */}
      {suggestions.length > 0 && !isBulk && (
        <ul className="acc-accpick__suggest">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  onCommit([
                    { label: s.label, category: s.category, requiresDetail: s.requiresDetail },
                  ])
                }
              >
                {s.label}
                {s.requiresDetail && <span className="acc-accpick__flag">needs detail</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="acc-accpick__actions">
        <button
          type="submit"
          className="acc-btn acc-btn--small acc-btn--primary"
          disabled={disabled || parsed.length === 0}
        >
          {isBulk ? `Add all ${parsed.length}` : 'Add'}
        </button>
        {onCancel && (
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
        )}
      </div>

      {hint && <p className="acc-accpick__hint">{hint}</p>}
    </form>
  );
}
