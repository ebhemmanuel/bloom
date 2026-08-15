import { useEffect, useRef, useState } from 'react';

/**
 * Per-student, per-day notes - the LAST column of the swimlane.
 *
 * Notes belong to the student's day, not to any single accommodation, which is
 * why this is a lane cell and not a card field.
 *
 * One field that keeps giving itself back, over a stack of what has already
 * been written. It was a single textarea filling the whole cell, which made one
 * tall empty box out of a column that sits beside four columns of cards - and a
 * teacher adding a second thought at lunchtime had to find the end of the first
 * and decide how to separate them. Each thought is its own card now, the field
 * returns above the stack after every one, and the column reads like the ones
 * next to it.
 *
 * STORAGE IS UNCHANGED. `students[id].notes` is still one string; the entries
 * are its lines. Nothing new is persisted, nothing in the schema moves, and a
 * record written before this still opens - its text simply arrives as however
 * many lines it always had.
 */

/** The stored string to entries. Blank lines are separators, not notes. */
function toEntries(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** And back. Chronological, oldest first - the order a report reads them in. */
function toText(entries) {
  return entries.join('\n');
}

export default function SwimlaneNotesCell({ studentName, value, disabled, onCommit }) {
  const entries = toEntries(value);

  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef(null);

  useEffect(() => () => clearTimeout(savedTimer.current), []);

  // A date change lands a different day's notes in the same cell. Anything half
  // typed belonged to the day that just left.
  useEffect(() => {
    setDraft('');
    setEditing(null);
  }, [value]);

  const flash = () => {
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1400);
  };

  const write = (next) => {
    onCommit(toText(next));
    flash();
  };

  /** Append, so the stored order stays chronological. Newest renders first. */
  const addNote = () => {
    const text = draft.trim();
    if (!text) {
      setDraft('');
      return;
    }
    write([...entries, text]);
    setDraft('');
  };

  /*
    Clearing a card's text removes it.

    A note is part of a compliance record, so it has to stay correctable - the
    single textarea this replaces could be edited freely, and a stack that only
    ever appends would have made a typo permanent. Emptying is how one goes.
  */
  const commitEdit = (index) => {
    const text = editDraft.trim();
    setEditing(null);
    if (text === entries[index]) return;
    const next = entries.slice();
    if (text) next[index] = text;
    else next.splice(index, 1);
    write(next);
  };

  // Enter files the note; Shift+Enter is a line break inside one.
  const onFieldKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      addNote();
    }
  };

  const onEditKeyDown = (index) => (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      commitEdit(index);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setEditing(null);
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

      {/*
        The field sits ABOVE the stack, so the thing you do next is the thing
        under your cursor and the newest note is the one nearest it. Hidden
        entirely when the cell is locked rather than shown refusing: on an
        absent student there is no note to add.
      */}
      {!disabled && (
        <textarea
          className="acc-notes__field"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onFieldKeyDown}
          onBlur={addNote}
          placeholder="Anything worth documenting about today?"
          aria-label={`Add a note for ${studentName}`}
          rows={2}
          spellCheck
        />
      )}

      {entries.length > 0 && (
        <ul className="acc-notes__list">
          {/*
            Newest first on screen, oldest first in the file. The stack reads
            down from the field you just used; a printed report reads the day in
            the order it happened.
          */}
          {entries
            .map((text, index) => ({ text, index }))
            .reverse()
            .map(({ text, index }) =>
              editing === index ? (
                <li className="acc-notes__item" key={`edit-${index}`}>
                  {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                  <textarea
                    className="acc-notes__field acc-notes__field--editing"
                    value={editDraft}
                    onChange={(event) => setEditDraft(event.target.value)}
                    onKeyDown={onEditKeyDown(index)}
                    onBlur={() => commitEdit(index)}
                    aria-label={`Edit note for ${studentName}`}
                    rows={2}
                    autoFocus
                    spellCheck
                  />
                </li>
              ) : (
                <li className="acc-notes__item" key={`note-${index}-${text}`}>
                  {disabled ? (
                    <p className="acc-notes__card acc-notes__card--static">{text}</p>
                  ) : (
                    <button
                      type="button"
                      className="acc-notes__card"
                      onClick={() => {
                        setEditDraft(text);
                        setEditing(index);
                      }}
                      title="Edit this note"
                    >
                      {text}
                    </button>
                  )}
                </li>
              )
            )}
        </ul>
      )}
    </section>
  );
}
