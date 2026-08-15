import { useState } from 'react';
import { usePopoverDismiss } from '../shell/AppHeader.jsx';
import { useData } from '../../context/DataContext.jsx';
import { renamePeriod, addPeriod } from '../../domain/mutations.js';
import useSlotWords from '../../hooks/useSlotWords.js';
import { BLOCK_WORDS } from '../../domain/vocabulary.js';
import Caret from '../shared/Caret.jsx';

/**
 * Period filter as a dropdown rather than a chip row.
 *
 * A teacher with six or seven periods produced a chip row that wrapped and
 * pushed the lanes down the page; a dropdown keeps the toolbar to one line
 * whatever the timetable looks like.
 *
 * Right-clicking a row renames the period, which propagates everywhere the label
 * appears - lane headers, this filter, the add-student form.
 */
export default function PeriodFilter({ periods, selected, onChange }) {
  // "Period" or "block", from the grades this teacher said they work with.
  // Presentation only - see domain/vocabulary.js.
  const words = useSlotWords();
  const blocks = words === BLOCK_WORDS;
  const { mutate, readOnly } = useData();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState('');
  // Named so the create form can say what it did - see `visible` below.
  const [justAdded, setJustAdded] = useState(null);

  const ref = usePopoverDismiss(open, () => {
    setOpen(false);
    setRenaming(null);
  });

  // Deliberately NOT hidden when there are no periods: this popover is one of
  // the places they can be created, so hiding it would make the empty state
  // permanent.

  /**
   * Periods worth filtering by: the ones somebody is actually in.
   *
   * Filtering to a period with nobody in it produces an empty board, which is
   * not an answer to any question a teacher has. Periods accumulate - a
   * timetable gets rebuilt, a class is not taught this term - and a list of
   * them that includes the empty ones is a list you have to know the timetable
   * to read.
   *
   * A SELECTED period stays listed even when it empties out. Otherwise removing
   * the last student from the period you are filtered to would hide the only
   * control that could clear it, and the board would sit empty with no way back
   * - the same trap the date range had.
   */
  const visible = periods.filter((p) => p.studentCount > 0 || selected.includes(p.id));

  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((p) => p !== id) : [...selected, id]);

  const label =
    periods.length === 0
      ? words.Many
      : selected.length === 0
        ? words.all
        : selected.length === 1
          ? periods.find((p) => p.id === selected[0])?.shortName || `1 ${words.one}`
          : `${selected.length} ${words.many}`;

  const commitRename = (period) => {
    const next = draft.trim();
    mutate((d) => renamePeriod(d, period.id, next));
    setRenaming(null);
  };

  /**
   * Lit while narrowed, not merely while open.
   *
   * The trigger only marked itself when the menu was showing, so a board
   * filtered down to one period looked exactly like a board showing everyone -
   * the label changed, but "P1" and "All periods" are the same shape of quiet
   * grey text and neither announces itself as a state you are inside.
   */
  const filtering = selected.length > 0;

  return (
    <div className="acc-periods" ref={ref}>
      <button
        type="button"
        className={`acc-btn${open ? ' acc-btn--on' : ''}${filtering ? ' acc-btn--active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={
          filtering ? `Showing only some ${words.many}. Click to change.` : `Filter by ${words.one}`
        }
      >
        {label}
        <Caret up={open} />
      </button>

      {open && (
        <div className="acc-periods__menu acc-enter" role="menu">
          {visible.length > 0 && (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={selected.length === 0}
              className={`acc-periods__row${selected.length === 0 ? ' acc-periods__row--on' : ''}`}
              onClick={() => onChange([])}
            >
              <span className="acc-periods__check">{selected.length === 0 ? '✓' : ''}</span>
              {words.all}
            </button>
          )}

          {visible.map((p) =>
            renaming === p.id ? (
              <form
                key={p.id}
                className="acc-periods__rename"
                onSubmit={(e) => {
                  e.preventDefault();
                  commitRename(p);
                }}
              >
                <div className="acc-inputgroup">
                  <input
                    className="acc-inputgroup__input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)}
                    placeholder={p.shortName}
                    aria-label={`Rename ${p.shortName}`}
                    autoFocus
                  />
                  <button type="submit" className="acc-inputgroup__action">
                    Save
                  </button>
                </div>
              </form>
            ) : (
              <button
                key={p.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={selected.includes(p.id)}
                className={`acc-periods__row${selected.includes(p.id) ? ' acc-periods__row--on' : ''}`}
                onClick={() => toggle(p.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (readOnly) return;
                  setDraft(p.name === p.shortName ? '' : p.name);
                  setRenaming(p.id);
                }}
                title="Right-click to rename"
              >
                {/*
                  The code IS the tick.

                  A renamed period loses the only thing tying it to the rest of
                  the app: chips on a lane say P1, the print header says P1, and
                  a row reading only "1st grade" leaves the teacher to work out
                  which of those it is. So the code sits in front - but in the
                  tick's own gutter, not a column of its own, or every name is
                  indented past it and the labels stop starting where "All
                  periods" starts.

                  One mark rather than two in the same space: the code turns
                  accent when the period is on. A tick beside it would be a
                  second thing saying the same thing, and the gutter is 22px.
                */}
                <span
                  className={`acc-periods__code${
                    selected.includes(p.id) ? ' acc-periods__code--on' : ''
                  }`}
                  aria-hidden="true"
                >
                  {p.shortName}
                </span>
                <span className="acc-periods__label">{p.name}</span>
                <span className="acc-periods__count acc-numeric">{p.studentCount}</span>
              </button>
            )
          )}

          {/*
            Periods are created here rather than in a settings screen, because
            this popover is where a teacher is already thinking about them - and
            because without it there is no way to create one at all.
          */}
          {!readOnly && (
            <form
              className="acc-periods__add"
              onSubmit={(e) => {
                e.preventDefault();
                const name = adding.trim();
                if (!name) return;
                mutate((d) => addPeriod(d, { name }));
                setJustAdded(name);
                setAdding('');
              }}
            >
              <div className="acc-inputgroup">
                <input
                  className="acc-inputgroup__input"
                  value={adding}
                  onChange={(e) => setAdding(e.target.value)}
                  placeholder={`Add a ${words.one}…`}
                  aria-label={`Add a ${words.one}`}
                />
                <button type="submit" className="acc-inputgroup__action" disabled={!adding.trim()}>
                  Add
                </button>
              </div>
            </form>
          )}

          {/*
            A period nobody is in yet will not appear in the list above, so
            adding one has to say so out loud. Without this the form would look
            broken: you type a name, press Add, and nothing changes.
          */}
          {justAdded && (
            <p className="acc-periods__added acc-enter">
              Added {justAdded}. Put students in it from their profile - right-click a name on the
              board.
            </p>
          )}

          <p className="acc-periods__hint">
            {visible.length
              ? `Right-click a ${words.one} to rename it. ${words.Many} nobody is in are not listed.`
              : blocks
                ? 'Add as many as you teach - “Literacy block”, “Math block”, “Specials”.'
                : 'Add as many as you teach - “Period 3”, “Block B”, “Homeroom”.'}
          </p>
        </div>
      )}
    </div>
  );
}
