import { useEffect, useRef, useState } from 'react';

/**
 * Roster search.
 *
 * Debounced 150ms so the board is not rebuilt on every keystroke. Note the
 * motion rule this participates in: filtered results must NOT re-cascade —
 * re-staggering 30 lanes on every keystroke reads as the app reloading. Lanes
 * that survive the filter simply stay put.
 */
export default function StudentSearch({ value, onChange, matchCount, hiddenCount }) {
  const [draft, setDraft] = useState(value);
  const timer = useRef(null);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const handleChange = (event) => {
    const next = event.target.value;
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next), 150);
  };

  const clear = () => {
    clearTimeout(timer.current);
    setDraft('');
    onChange('');
  };

  return (
    <div className="acc-search">
      <svg
        className="acc-search__icon"
        viewBox="0 0 16 16"
        width="15"
        height="15"
        aria-hidden="true"
      >
        <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10.4 10.4L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>

      <input
        type="search"
        className="acc-search__input"
        value={draft}
        onChange={handleChange}
        placeholder="Find a student…"
        aria-label="Find a student by name"
      />

      {draft && (
        <button
          type="button"
          className="acc-search__clear"
          onClick={clear}
          aria-label="Clear search"
        >
          ×
        </button>
      )}

      {value && (
        <span className="acc-search__count acc-numeric" aria-live="polite">
          {matchCount} shown{hiddenCount ? `, ${hiddenCount} hidden` : ''}
        </span>
      )}
    </div>
  );
}
