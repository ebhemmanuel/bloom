import { useCallback, useState } from 'react';
import { PLAN_TYPES } from '../../../domain/constants.js';
import { STARTER_SETS, itemsForSet, allStarterItems } from '../../../domain/starterSets.js';
import { initialsOf } from '../../../domain/initials.js';
import { splitStudentNames, readPastedNames } from '../../../domain/importStudent.js';
import Caret from '../../shared/Caret.jsx';
import { usePopoverDismiss } from '../../shell/AppHeader.jsx';

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

// The same map the board and the sheets use, so a plan reads identically here.
const PLAN_CLASS = { IEP: 'iep', 504: '504', Other: 'other' };

export function RosterStep({
  students,
  periods,
  periodNames,
  onAdd,
  onRemove,
  onEdit,
  onTogglePeriod,
  onBack,
  onBoard,
}) {
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('IEP');
  const [planOpen, setPlanOpen] = useState(false);
  const closePlan = useCallback(() => setPlanOpen(false), []);
  const planRef = usePopoverDismiss(planOpen, closePlan);

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

  /**
   * Continue takes the field with it.
   *
   * There is no Add button any more: a name typed and left sitting there was
   * the one way to lose work on this screen, and a button whose whole job is
   * "yes, I meant the thing I just typed" is a question nobody needs asked.
   * Enter still adds, for the teacher entering a list one at a time.
   */
  const continueOn = () => {
    add();
    onBoard();
  };

  return (
    <div className="acc-ob__screen acc-ob__screen--card">
      <div className="acc-sheet__dialog acc-sheet__dialog--wide">
        <div className="acc-sheet__body">
          <div className="acc-sheet__view">
            <div className="acc-sheet__pane">
              <div className="acc-sheet__intro acc-sheet__intro--center">
                <h1 className="acc-sheet__title">Who are you supporting?</h1>
                {/* The break is authored rather than left to the measure: the
                    first sentence says what to type and the second says how
                    much, and they are easier to take in a line each. */}
                <p className="acc-sheet__sub">
                  Names or initials, whatever you&rsquo;d write on a sticky note.
                  <br />
                  Add one, add all, or stop anytime.
                </p>
              </div>

              {/*
                The add-student sheet's own control, on the same question: one
                bordered group holding the name and the plan, with the plan
                wearing its pill colours and opening the app's menu rather than
                three chips of its own. Setup and the sheet ask this the same
                way now.
              */}
              <div className="acc-wiz__field">
                <div className="acc-wiz__namegroup">
                  <input
                    className="acc-wiz__nameinput"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        add();
                      }
                    }}
                    /*
                        Straight from the clipboard, before the single-line
                        field can turn every newline into a space. A pasted
                        roster is added on the spot; there is nothing to
                        confirm when the names are right there.
                      */
                    onPaste={(e) => {
                      const names = readPastedNames(e);
                      if (!names) return;
                      e.preventDefault();
                      names.forEach((n) => onAdd(n, plan));
                      setName('');
                    }}
                    placeholder="J. Alvarez, or JA, or Student 4"
                    aria-label="Student name"
                    autoFocus
                  />

                  <span
                    className={`acc-wiz__planwrap acc-wiz__planwrap--${PLAN_CLASS[plan] || 'other'}`}
                    ref={planRef}
                  >
                    <button
                      type="button"
                      className="acc-wiz__plan"
                      onClick={() => setPlanOpen((o) => !o)}
                      aria-haspopup="menu"
                      aria-expanded={planOpen}
                      aria-label={`Plan type: ${plan}`}
                      title="Plan type"
                    >
                      {plan}
                      <Caret up={planOpen} />
                    </button>

                    {planOpen && (
                      <div className="acc-wiz__planmenu acc-enter" role="menu">
                        {PLAN_TYPES.map((p) => (
                          <button
                            key={p}
                            type="button"
                            role="menuitemradio"
                            aria-checked={p === plan}
                            className={`acc-wiz__planrow${p === plan ? ' acc-wiz__planrow--on' : ''}`}
                            onClick={() => {
                              setPlan(p);
                              setPlanOpen(false);
                            }}
                          >
                            <span className="acc-wiz__plancheck">{p === plan ? '✓' : ''}</span>
                            {p}
                          </button>
                        ))}
                      </div>
                    )}
                  </span>
                </div>

                <span className="acc-wiz__hint acc-wiz__hint--center">
                  Press Enter to add another, or just continue - whatever is in the field comes with
                  you. Paste a whole list, separated by commas or one per line, to add several at
                  once.
                </span>
              </div>

              {/*
                Says what the split found before it happens. Recovering names
                from a run of spaces is a judgement call, so the teacher gets to
                see the call and correct the field rather than discover it in
                the list afterwards.
              */}
              {parsed.length > 1 && (
                <div className="acc-preview acc-wiz__preview acc-wiz__preview--center">
                  <p className="acc-preview__summary">{parsed.length} students, added together</p>
                  <div className="acc-wiz__chips">
                    {parsed.map((n) => (
                      <span key={n} className="acc-chip acc-chip--on">
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {students.length > 0 && (
                <div className="acc-ob__roster">
                  {students.map((s, i) => (
                    <div key={s.id} className="acc-ob__student acc-fade-enter">
                      <span
                        className={`acc-ob__avatar acc-ob__avatar--${AVATARS[i % AVATARS.length]}`}
                      >
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

                      <button
                        type="button"
                        className="acc-ob__outline"
                        onClick={() => onEdit(s.id)}
                      >
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
            </div>
          </div>
        </div>

        {/* The same row every other step wears: Back on the left, the one line
            of guidance centred, the primary on the right. */}
        <footer className="acc-sheet__foot">
          <div className="acc-sheet__footside">
            <button type="button" className="acc-btn acc-btn--quiet" onClick={onBack}>
              Back
            </button>
          </div>
          <span className="acc-sheet__tip">
            Paste a whole column straight from your roster, they all come in at once.
          </span>
          {/* Continue, whether or not anybody was named. This screen is
              optional, and a button that says Skip makes leaving it empty feel
              like giving up on something rather than answering it. */}
          <button type="button" className="acc-btn acc-btn--primary" onClick={continueOn}>
            Continue
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
      <div className="acc-sheet__dialog acc-sheet__dialog--wide">
        <div className="acc-sheet__body">
          <div className="acc-sheet__view">
            <div className="acc-sheet__pane acc-sheet__pane--wide">
              <div className="acc-sheet__intro">
                <h1 className="acc-sheet__title">What does {student.name} receive?</h1>
                <p className="acc-sheet__sub">
                  Start from the common wordings below. The plan&rsquo;s exact language wins, edit
                  anything later to match it.
                </p>
              </div>

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
                        {count > 0 && (
                          <span className="acc-ob__count acc-numeric">{count} selected</span>
                        )}
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
            </div>
          </div>
        </div>

        <footer className="acc-sheet__foot">
          <div className="acc-sheet__footside" />
          <span className="acc-sheet__tip acc-numeric">
            {chosen.length === 0
              ? "Nothing chosen yet, that's fine"
              : `${chosen.length} support${chosen.length === 1 ? '' : 's'} chosen`}
          </span>
          <button type="button" className="acc-btn acc-btn--primary" onClick={onDone}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
