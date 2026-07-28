import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../../context/DataContext.jsx';
import { useBoard } from '../../context/BoardContext.jsx';

import { normalizeSearch, studentSearchTerms } from '../../domain/selectors.js';
import useDismissAnimation from '../../hooks/useDismissAnimation.js';
import useAutoHeight from '../../hooks/useAutoHeight.js';

// The same map the board and the student profile use, so a plan reads
// identically wherever it appears.
const PLAN_CLASS = { IEP: 'iep', 504: '504', Other: 'other' };

/**
 * Ctrl+Space: jump to a student.
 *
 * A frosted sheet over the whole app rather than a dropdown - on a board of
 * thirty lanes the fastest way to reach one student is to stop looking at the
 * other twenty-nine, so the overlay deliberately obscures what is behind it.
 *
 * Selecting a student filters the board to them and clears when dismissed, so
 * this is navigation rather than a filter the teacher has to remember to undo.
 *
 * Mounted only while open - App renders it conditionally rather than passing an
 * `open` prop. Unmounting is what resets the dismiss animation, so the sheet can
 * be closed on its second opening as well as its first.
 */
export default function CommandPalette({ onClose }) {
  const { doc } = useData();
  const { setSearch, setPeriodIds, setDateKey, dateKey } = useBoard();

  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  // The sheet eases between heights as results filter, rather than snapping.
  const [sheetRef, contentRef] = useAutoHeight('--acc-palette-h');

  /**
   * Dismissal mirrors the entrance rather than cutting.
   *
   * The sheet is a full-screen frosted overlay; snapping it out of existence
   * reads as a glitch, where fading it back reads as putting something down.
   */
  const { leaving, dismiss } = useDismissAnimation(onClose);

  useEffect(() => {
    // Focus after paint so the sheet is up before the caret lands in it.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  /**
   * Students and periods in one list.
   *
   * A teacher navigating mid-lesson thinks in whichever unit is in front of them
   * - "where's Priya" or "pull up period 3" - so making them choose a mode first
   * would be asking them to translate their own question before asking it.
   * Periods sort above students, since a period is a bigger jump.
   */
  const results = useMemo(() => {
    const q = normalizeSearch(query);

    const counts = new Map();
    for (const s of doc.students) {
      if (!s.active || s.archivedAt) continue;
      for (const pid of s.periodIds || []) counts.set(pid, (counts.get(pid) || 0) + 1);
    }

    const periods = doc.periods
      .filter((p) => !p.archivedAt)
      .filter((p) => !q || normalizeSearch(`${p.name} ${p.shortName}`).includes(q))
      .map((p) => ({
        kind: 'period',
        id: p.id,
        label: p.name,
        meta: `${counts.get(p.id) || 0} student${(counts.get(p.id) || 0) === 1 ? '' : 's'}`,
      }));

    const students = doc.students
      .filter((s) => s.active && !s.archivedAt)
      .filter((s) => !q || studentSearchTerms(s).some((t) => t.includes(q)))
      .map((s) => ({
        kind: 'student',
        id: s.id,
        label: s.displayName,
        // The plan is a TAG, not a sentence: it is the same fact the board
        // shows on a pill, and one fact should not be two shapes.
        plan: s.planType,
        meta: s.unenrolledFrom ? 'unenrolled' : '',
      }));

    return [...periods, ...students].slice(0, 9);
  }, [doc.students, doc.periods, query]);

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, results.length - 1)));
  }, [results.length]);

  const choose = (item) => {
    if (!item) return;

    if (item.kind === 'period') {
      // Filtering by period is a wider view, so the name search has to clear or
      // the two would fight and show nothing.
      setPeriodIds([item.id]);
      setSearch('');
    } else {
      setPeriodIds([]);
      setSearch(item.label);
    }

    setDateKey(dateKey);
    dismiss();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      dismiss();
      return;
    }
    // Ctrl+Space closes as well as opens, and it has to fade out the same way
    // Escape does - which is why the global shortcut below only ever opens.
    if (e.code === 'Space' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      dismiss();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (c + 1) % Math.max(1, results.length));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (c - 1 + results.length) % Math.max(1, results.length));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[cursor]);
    }
  };

  return createPortal(
    <div
      className={`acc-palette ${leaving ? 'acc-palette--leaving' : 'acc-fade-enter'}`}
      onMouseDown={dismiss}
      role="presentation"
    >
      <div
        ref={sheetRef}
        className={`acc-palette__sheet ${leaving ? 'acc-palette__sheet--leaving' : 'acc-enter'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Find a student"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Measured, so the sheet can transition to its content's height. */}
        <div className="acc-palette__content" ref={contentRef}>
          <div className="acc-palette__field">
            <svg viewBox="0 0 16 16" width="17" height="17" aria-hidden="true">
              <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M10.4 10.4L14 14"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <input
              ref={inputRef}
              className="acc-palette__input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Jump to a student or period…"
              aria-label="Jump to a student or period"
            />
            <kbd className="acc-palette__kbd">Esc</kbd>
          </div>

          {results.length > 0 ? (
            // Cascade on the opening list only. Re-staggering on every keystroke
            // is the re-cascade-on-search the motion budget rules out, and next to
            // a sheet that is already resizing it reads as the list flinching.
            <ul className={`acc-palette__results${query ? '' : ' acc-cascade'}`} role="listbox">
              {results.map((item, i) => (
                <li key={`${item.kind}:${item.id}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === cursor}
                    className={`acc-palette__result${i === cursor ? ' acc-palette__result--on' : ''}`}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => choose(item)}
                  >
                    <span className={`acc-palette__kind acc-palette__kind--${item.kind}`}>
                      {item.kind === 'period' ? 'Period' : 'Student'}
                    </span>
                    <span className="acc-palette__name">{item.label}</span>
                    {/* Pushed to the far end: the name is what you are reading
                        down, and a count or a plan sitting hard against it
                        lands in a different place on every row. */}
                    {item.plan && (
                      <span
                        className={`acc-pill acc-pill--${PLAN_CLASS[item.plan] || 'other'} acc-palette__plan`}
                      >
                        {item.plan}
                      </span>
                    )}
                    {item.meta && <span className="acc-palette__meta">{item.meta}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="acc-palette__none">
              {doc.students.length === 0 ? 'No students yet.' : 'Nothing matches.'}
            </p>
          )}

          <p className="acc-palette__hint">
            Students and periods · ↑↓ to move · Enter to open · Esc to close
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Ctrl/Cmd+Space anywhere in the app.
 *
 * Opens only. Closing belongs to the palette itself, which animates its exit;
 * a toggle here would unmount it mid-fade, so the same keystroke would open
 * gently and close with a cut.
 */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return { open, setOpen, close: () => setOpen(false) };
}
