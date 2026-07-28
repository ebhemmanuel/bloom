import { useEffect, useRef, useState } from 'react';

/**
 * Per-student, per-day notes - the LAST column of the swimlane.
 *
 * Notes belong to the student's day, not to any single accommodation, which is
 * why this is a lane cell and not a card field.
 *
 * Local state with a debounced commit: typing must never wait on the document
 * round-trip, and every keystroke must not become a disk write.
 */
export default function SwimlaneNotesCell({ studentName, value, disabled, onCommit }) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const timer = useRef(null);
  const latest = useRef(value);

  // Adopt external changes (date switch, undo) without clobbering active typing.
  useEffect(() => {
    if (value !== latest.current) {
      latest.current = value;
      setDraft(value);
    }
  }, [value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleChange = (event) => {
    const next = event.target.value;
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      latest.current = next;
      onCommit(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 1400);
    }, 500);
  };

  const flush = () => {
    clearTimeout(timer.current);
    if (draft !== latest.current) {
      latest.current = draft;
      onCommit(draft);
    }
  };

  return (
    <section className="acc-notes" aria-label={`Daily notes for ${studentName}`}>
      <header className="acc-notes__header">
        <span className="acc-subhead">Notes</span>
        <span
          className={`acc-notes__saved${saved ? ' acc-notes__saved--on' : ''}`}
          aria-live="polite"
        >
          {saved ? 'Saved' : ''}
        </span>
      </header>
      <textarea
        className="acc-notes__input"
        value={draft}
        disabled={disabled}
        onChange={handleChange}
        onBlur={flush}
        placeholder={disabled ? '' : 'Anything worth documenting about today?'}
        aria-label={`Daily notes for ${studentName}`}
        spellCheck
      />
    </section>
  );
}
