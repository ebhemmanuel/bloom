import { useState } from 'react';
import { PLAN_TYPES } from '../../../domain/constants.js';
import { STARTER_SETS, itemsForSet, allStarterItems } from '../../../domain/starterSets.js';
import { initialsOf } from '../../../domain/initials.js';
import { splitStudentNames, readPastedNames } from '../../../domain/importStudent.js';

/**
 * The optional half of onboarding: who you support, and what they get.
 *
 * Optional on purpose. A teacher can reach a working board without naming a
 * single student, and the roster screen says so in its own button rather than
 * hiding the exit behind a small link.
 */

/**
 * Avatar colours cycle rather than hash from the name.
 *
 * A hash would be prettier in theory and unreadable in practice: two students
 * added in a row can collide, and the teacher reads these as a list, where
 * "different from its neighbour" is the only property that helps.
 */
const AVATARS = ['a', 'b', 'c', 'd', 'e'];

export function RosterStep({
  students,
  periods,
  periodNames,
  onAdd,
  onRemove,
  onEdit,
  onTogglePeriod,
  onBoard,
}) {
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('IEP');

  const parsed = splitStudentNames(name);
  const ready = parsed.length > 0;

  /**
   * One field, one or many.
   *
   * Typing a name adds a student. Pasting a column out of a spreadsheet adds all
   * of them, because that is what a teacher setting up in September actually
   * has in front of them.
   */
  const add = () => {
    if (!ready) return;
    parsed.forEach((n) => onAdd(n, plan));
    setName('');
  };

  return (
    <div className="acc-ob__screen acc-ob__screen--card">
      <div className="acc-ob__card acc-ob__card--lg">
        <header className="acc-ob__head">
          <p className="acc-ob__eyebrow">Your students</p>
          <h2 className="acc-ob__question">Who are you supporting?</h2>
          <p className="acc-ob__note">
            Names or initials, whatever you&rsquo;d write on a sticky note. Add one, add all, or
            stop anytime.
          </p>
        </header>

        <div className="acc-ob__addrow">
          <input
            className="acc-ob__input acc-ob__input--sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            /*
              Straight from the clipboard, before the single-line field can turn
              every newline into a space. A pasted roster is added on the spot;
              there is nothing to confirm when the names are right there.
            */
            onPaste={(e) => {
              const names = readPastedNames(e);
              if (!names) return;
              e.preventDefault();
              names.forEach((n) => onAdd(n, plan));
              setName('');
            }}
            placeholder="e.g. J.M. or Jordan M."
            aria-label="Student name"
          />
          <div className="acc-ob__plans">
            {PLAN_TYPES.map((p) => (
              <button
                key={p}
                type="button"
                className={`acc-ob__chip acc-ob__chip--plan${plan === p ? ' acc-ob__chip--on' : ''}`}
                onClick={() => setPlan(p)}
                aria-pressed={plan === p}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`acc-ob__next${ready ? '' : ' acc-ob__next--waiting'}`}
            onClick={add}
            disabled={!ready}
          >
            {parsed.length > 1 ? `Add ${parsed.length}` : 'Add'}
          </button>
        </div>

        {/*
          Says what the split found before it happens. Recovering names from a
          run of spaces is a judgement call, so the teacher gets to see the call
          and correct the field rather than discover it in the list afterwards.
        */}
        {parsed.length > 1 && (
          <div className="acc-ob__chips acc-fade-enter">
            {parsed.map((n) => (
              <span key={n} className="acc-ob__chip acc-ob__chip--on">
                {n}
              </span>
            ))}
          </div>
        )}

        {students.length > 0 && (
          <div className="acc-ob__roster">
            {students.map((s, i) => (
              <div key={s.id} className="acc-ob__student acc-fade-enter">
                <span className={`acc-ob__avatar acc-ob__avatar--${AVATARS[i % AVATARS.length]}`}>
                  {initialsOf(s.name)}
                </span>
                <span className="acc-ob__student-text">
                  <span className="acc-ob__student-line">
                    <span className="acc-ob__student-name">{s.name}</span>
                    <span className={`acc-ob__plan acc-ob__plan--${s.plan.toLowerCase()}`}>
                      {s.plan}
                    </span>
                  </span>
                  <span className="acc-ob__student-meta">
                    {s.accoms.length === 0
                      ? 'No supports chosen yet'
                      : `${s.accoms.length} support${s.accoms.length === 1 ? '' : 's'}`}
                  </span>
                </span>
                {/*
                  Which class they are in, answered where the name is typed.
                  
                  It used to be unanswerable anywhere: everyone landed in every
                  period and no later screen asked, so a roster could not be
                  filtered or grouped by period at all. Optional on purpose -
                  leaving it blank still means "all of them", because a teacher
                  entering names at speed should not have to stop for a
                  timetable they may not have to hand yet.
                */}
                {periods.length > 0 && (
                  <span className="acc-ob__student-periods">
                    {periods.map((n) => {
                      const on = (s.periods || []).includes(n);
                      return (
                        <button
                          key={n}
                          type="button"
                          className={`acc-ob__pchip${on ? ' acc-ob__pchip--on' : ''}`}
                          aria-pressed={on}
                          title={`${periodNames[n] || `Period ${n}`}${on ? ' - click to remove' : ''}`}
                          onClick={() => onTogglePeriod(s.id, n)}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </span>
                )}

                <button type="button" className="acc-ob__outline" onClick={() => onEdit(s.id)}>
                  Choose supports
                </button>
                <button
                  type="button"
                  className="acc-ob__remove"
                  onClick={() => onRemove(s.id)}
                  aria-label={`Remove ${s.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <footer className="acc-ob__foot">
          <p className="acc-ob__hint">
            Paste a whole column straight from your roster, they all come in at once.
          </p>
          <button type="button" className="acc-ob__next" onClick={onBoard}>
            {students.length > 0 ? 'Open my board' : 'Skip for now'}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function SupportsStep({ student, onToggle, onAddCustom, onDone }) {
  const [open, setOpen] = useState(STARTER_SETS[0].id);
  const [draft, setDraft] = useState('');

  const chosen = student.accoms;
  const starterLabels = allStarterItems().map((i) => i.label);
  const custom = chosen.filter((a) => !starterLabels.includes(a));

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    onAddCustom(value);
    setDraft('');
  };

  return (
    <div className="acc-ob__screen acc-ob__screen--card">
      <div className="acc-ob__card acc-ob__card--xl">
        <header className="acc-ob__head">
          <p className="acc-ob__eyebrow">Supports · {student.name}</p>
          <h2 className="acc-ob__question">What does {student.name} receive?</h2>
          <p className="acc-ob__note">
            Start from the common wordings below. The plan&rsquo;s exact language wins, edit
            anything later to match it.
          </p>
        </header>

        <div className="acc-ob__groups">
          {STARTER_SETS.map((set) => {
            const items = itemsForSet(set.id);
            const count = items.filter((i) => chosen.includes(i.label)).length;
            const isOpen = open === set.id;

            return (
              <div key={set.id} className="acc-ob__accordion">
                <button
                  type="button"
                  className="acc-ob__accordion-head"
                  onClick={() => setOpen(isOpen ? null : set.id)}
                  aria-expanded={isOpen}
                >
                  <span className="acc-ob__accordion-text">
                    <span className="acc-ob__accordion-label">{set.label}</span>
                    <span className="acc-ob__accordion-hint">{set.hint}</span>
                  </span>
                  {count > 0 && <span className="acc-ob__count acc-numeric">{count} selected</span>}
                  <span
                    className={`acc-ob__chevron${isOpen ? ' acc-ob__chevron--open' : ''}`}
                    aria-hidden="true"
                  >
                    ▾
                  </span>
                </button>

                {isOpen && (
                  <div className="acc-ob__accordion-body acc-fade-enter">
                    {items.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        className={`acc-ob__chip acc-ob__chip--item${
                          chosen.includes(item.label) ? ' acc-ob__chip--on' : ''
                        }`}
                        onClick={() => onToggle(item.label)}
                        aria-pressed={chosen.includes(item.label)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="acc-ob__chips acc-ob__chips--custom">
          {custom.map((label) => (
            <button
              key={label}
              type="button"
              className="acc-ob__chip acc-ob__chip--on acc-ob__chip--item"
              onClick={() => onToggle(label)}
              aria-label={`Remove ${label}`}
            >
              {label} ×
            </button>
          ))}
          <input
            className="acc-ob__chip-input acc-ob__chip-input--wide"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Something specific to this student…"
            aria-label="Add a custom accommodation"
          />
        </div>

        <footer className="acc-ob__foot">
          <p className="acc-ob__hint acc-numeric">
            {chosen.length === 0
              ? "Nothing chosen yet, that's fine"
              : `${chosen.length} support${chosen.length === 1 ? '' : 's'} chosen`}
          </p>
          <button type="button" className="acc-ob__next" onClick={onDone}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
