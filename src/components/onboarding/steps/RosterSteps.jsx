import { useCallback, useState } from 'react';
import { PLAN_TYPES } from '../../../domain/constants.js';
import { STARTER_SETS, itemsForSet, allStarterItems } from '../../../domain/starterSets.js';
import { initialsOf } from '../../../domain/initials.js';
import {
  splitStudentNames,
  readPastedNames,
  resolveAccommodationList,
} from '../../../domain/importStudent.js';
import Caret from '../../shared/Caret.jsx';
import { usePopoverDismiss } from '../../shell/AppHeader.jsx';
import AccommodationChooser from '../../manage/AccommodationChooser.jsx';

/**
 * The optional half of setup: who you support, and what they get.
 *
 * It IS the add-student flow, run once against the answers rather than against
 * a document that does not exist yet: who, class details, accommodations,
 * review. The same screens, the same controls, the same order - so the thing a
 * teacher learns here is the thing they use all year, and Next means Next on
 * both.
 *
 * Optional on purpose. A teacher can reach a working board without naming a
 * single student, and the review says so in its own words rather than hiding
 * the exit behind a small link.
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
  onApplyToAll,
  onBack,
  onBoard,
}) {
  const [step, setStep] = useState(0);

  const [name, setName] = useState('');
  const [plan, setPlan] = useState('IEP');
  const [planOpen, setPlanOpen] = useState(false);
  const closePlan = useCallback(() => setPlanOpen(false), []);
  const planRef = usePopoverDismiss(planOpen, closePlan);

  // Class details and accommodations are asked once and answered for everyone
  // named, exactly as the add-student sheet asks them.
  const [sharedPeriods, setSharedPeriods] = useState([]);
  const [mode, setMode] = useState(null);
  const [paste, setPaste] = useState('');
  const [picked, setPicked] = useState([]);
  const [openSet, setOpenSet] = useState(null);

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

  // No catalog exists yet during setup, so everything pasted is new. The
  // preview still earns its place: it shows what the splitter made of the text.
  const parsedAccoms = resolveAccommodationList(paste, []);

  const staged = (() => {
    const seen = new Set(parsedAccoms.items.map((i) => i.label.toLowerCase()));
    return [...parsedAccoms.items, ...picked.filter((p) => !seen.has(p.label.toLowerCase()))];
  })();

  const togglePick = (item) => {
    setPicked((prev) =>
      prev.some((p) => p.label === item.label)
        ? prev.filter((p) => p.label !== item.label)
        : [...prev, item]
    );
  };

  const toggleSetAll = (setId) => {
    const items = itemsForSet(setId);
    const allPicked = items.every((i) => picked.some((p) => p.label === i.label));
    setPicked((prev) => {
      const without = prev.filter((p) => !items.some((i) => i.label === p.label));
      return allPicked ? without : [...without, ...items];
    });
  };

  const roster = students.length;

  /**
   * Next takes the field with it.
   *
   * A name typed and left sitting there was the one way to lose work on this
   * screen, and a button asking "yes, I meant the thing I just typed" is a
   * question nobody needs. Enter still adds, for a list entered one at a time.
   */
  const next = () => {
    if (step === 0) add();
    if (step < 3) {
      setStep(step + 1);
      return;
    }

    /*
      The confirm. Everything chosen on the two shared screens is UNIONED onto
      each student rather than assigned over them, so a per-student choice made
      from the list survives the shared answer.
    */
    onApplyToAll({
      periods: sharedPeriods,
      accoms: staged.map((s) => s.label),
    });
    onBoard();
  };

  const back = () => (step === 0 ? onBack() : setStep(step - 1));

  const tips = [
    'Press Enter to add another, or just carry on - whatever is in the field comes with you.',
    'Answered once, for everyone you just named. All of it is editable per student later.',
    staged.length > 0
      ? `${staged.length} accommodation${staged.length === 1 ? '' : 's'} ready`
      : 'You can skip this and add accommodations any time from the board.',
    'This writes the record and opens your board.',
  ];

  const nextLabel =
    step < 3 ? 'Next' : roster === 0 ? 'Open my board' : `Add ${roster} and open my board`;

  return (
    <div className="acc-ob__screen acc-ob__screen--card">
      <div className="acc-sheet__dialog acc-sheet__dialog--wide">
        <div className="acc-sheet__body">
          {/* Keyed by step so the entrance replays on every move, as the sheet
              does. */}
          <div className="acc-sheet__view" key={step}>
            {step === 0 ? (
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
                  wearing its pill colours and opening the app's menu rather
                  than three chips of its own.
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
                        roster is added on the spot; there is nothing to confirm
                        when the names are right there.
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
                    Paste a whole list, separated by commas or one per line, to add several at once.
                  </span>
                </div>

                {/*
                  Says what the split found before it happens. Recovering names
                  from a run of spaces is a judgement call, so the teacher gets
                  to see the call and correct the field rather than discover it
                  in the list afterwards.
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
                          Which class they are in, per student. The next screen
                          answers it for everyone at once; this is for the one
                          who is only in P3.
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
            ) : step === 1 ? (
              <div className="acc-sheet__pane acc-sheet__pane--wide">
                <div className="acc-sheet__intro acc-sheet__intro--center">
                  <h1 className="acc-sheet__title">Class details</h1>
                  <p className="acc-sheet__sub acc-sheet__sub--balance">
                    Which of your periods these students sit in. Leave it blank and they are in all
                    of them, which is the right answer more often than not on day one.
                  </p>
                </div>

                <div className="acc-wiz__field acc-wiz__field--center">
                  <span className="acc-wiz__label">Which periods?</span>
                  <div className="acc-wiz__chips acc-wiz__chips--center">
                    {periods.map((n) => {
                      const on = sharedPeriods.includes(n);
                      return (
                        <button
                          key={n}
                          type="button"
                          className={`acc-chip acc-chip--lg${on ? ' acc-chip--on' : ''}`}
                          aria-pressed={on}
                          title={periodNames[n] || `Period ${n}`}
                          onClick={() =>
                            setSharedPeriods((prev) =>
                              prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
                            )
                          }
                        >
                          P{n}
                        </button>
                      );
                    })}
                    {periods.length === 0 && (
                      <span className="acc-wiz__hint">
                        You did not name any periods, so there is nothing to pick here.
                      </span>
                    )}
                  </div>
                  <span className="acc-wiz__hint acc-wiz__hint--center">
                    Added to everyone you just named, on top of anything set per student.
                  </span>
                </div>
              </div>
            ) : step === 2 ? (
              <div className="acc-sheet__pane acc-sheet__pane--wide">
                <div className="acc-sheet__intro acc-sheet__intro--center">
                  <h1 className="acc-sheet__title">How do you want to add their accommodations?</h1>
                  <p className="acc-sheet__sub acc-sheet__sub--balance">
                    The plan&rsquo;s wording is what counts - edit anything later to match what it
                    actually says.
                  </p>
                </div>

                {/* The sheet's own chooser, unchanged: paste the plan, or tick a
                    starter set. See AccommodationChooser. */}
                <AccommodationChooser
                  mode={mode}
                  onMode={setMode}
                  paste={paste}
                  onPaste={setPaste}
                  parsed={parsedAccoms}
                  picked={picked}
                  onTogglePick={togglePick}
                  onToggleSet={toggleSetAll}
                  openSet={openSet}
                  onOpenSet={setOpenSet}
                />
              </div>
            ) : (
              <div className="acc-sheet__pane">
                <div className="acc-sheet__intro acc-sheet__intro--center">
                  <h1 className="acc-sheet__title">
                    {roster === 0
                      ? 'Ready when you are'
                      : `Ready to add ${roster} student${roster === 1 ? '' : 's'}`}
                  </h1>
                  <p className="acc-sheet__sub acc-sheet__sub--balance">
                    {roster === 0
                      ? 'Nobody named yet, which is fine - your board opens empty and you can add students from it whenever you like.'
                      : 'This is how the record will look. Every part of it stays editable from the board.'}
                  </p>
                </div>

                {roster > 0 && (
                  <div className="acc-wiz__card">
                    <div className="acc-wiz__cardhead">
                      <span className="acc-wiz__disc" aria-hidden="true">
                        {roster}
                      </span>
                      <div className="acc-wiz__identity">
                        <div className="acc-wiz__nameline">
                          <span className="acc-wiz__cardname">
                            {roster} student{roster === 1 ? '' : 's'}
                          </span>
                        </div>
                        <span className="acc-wiz__meta">
                          {sharedPeriods.length
                            ? sharedPeriods.map((n) => `P${n}`).join(', ')
                            : 'All your periods'}
                          {' · '}
                          Start of year
                        </span>
                      </div>
                      <div className="acc-wiz__edit">
                        <span className="acc-wiz__editlabel">Edit</span>
                        <button
                          type="button"
                          className="acc-wiz__editlink"
                          onClick={() => setStep(0)}
                        >
                          Names
                        </button>
                        <span className="acc-wiz__editdot" aria-hidden="true" />
                        <button
                          type="button"
                          className="acc-wiz__editlink"
                          onClick={() => setStep(1)}
                        >
                          Details
                        </button>
                      </div>
                    </div>

                    <div className="acc-wiz__chips acc-wiz__chips--card">
                      {students.map((s) => (
                        <span key={s.id} className="acc-chip acc-chip--on">
                          {s.name}
                        </span>
                      ))}
                    </div>

                    <div className="acc-wiz__accoms">
                      <div className="acc-wiz__accomhead">
                        <span className="acc-wiz__label">
                          {staged.length
                            ? `${staged.length} accommodation${staged.length === 1 ? '' : 's'} each`
                            : 'Accommodations'}
                        </span>
                        <button
                          type="button"
                          className="acc-wiz__editlink acc-wiz__editlink--end"
                          onClick={() => setStep(2)}
                        >
                          Edit
                        </button>
                      </div>

                      {staged.length > 0 ? (
                        <div className="acc-wiz__chips">
                          {staged.map((s) => (
                            <span key={s.label} className="acc-wiz__accom">
                              {s.label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="acc-wiz__empty">
                          None yet - add them any time from the board.
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* The same row every other step wears: Back on the left, the one line
            of guidance centred, the primary on the right. */}
        <footer className="acc-sheet__foot">
          <div className="acc-sheet__footside">
            <button type="button" className="acc-btn acc-btn--quiet" onClick={back}>
              Back
            </button>
          </div>
          <span className="acc-sheet__tip">{tips[step]}</span>
          <button type="button" className="acc-btn acc-btn--primary" onClick={next}>
            {nextLabel}
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
