import { useCallback, useEffect, useMemo, useState } from 'react';
import AmbientScene from '../shared/AmbientScene.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useBoard } from '../../context/BoardContext.jsx';
import {
  resolveAccommodationList,
  addStudentWithAccommodations,
  splitStudentNames,
  readPastedNames,
} from '../../domain/importStudent.js';
import { addPeriod } from '../../domain/mutations.js';
import { itemsForSet, STARTER_SETS } from '../../domain/starterSets.js';
import { PLAN_TYPES } from '../../domain/constants.js';
import { periodOptions } from '../../domain/selectors.js';
import { ensureDay, backfillDays, backfillRange } from '../../domain/seed.js';
import { todayKey, formatDateMedium } from '../../domain/dates.js';

/**
 * Add a student, as four short questions rather than one long form.
 *
 * Built to `design_handoff_add_student_wizard/`: Who, Class details,
 * Accommodations, Review, inside a fixed 900x660 frame so the steps swap
 * without the window resizing under the pointer.
 *
 * It is NOT a dialog on a scrim. Opening it cascades the board away and lands
 * here, exactly as About does, so the two full-screen destinations in the app
 * arrive the same way. See `openScene` in App.jsx and `.acc-wiz` in the
 * stylesheet.
 *
 * Only a name gates progression. The old form refused to submit without at
 * least one accommodation, which meant a teacher writing down a roster in
 * September had to invent something to type; the review step now shows an
 * honest empty state and the board can carry it from there.
 */

const STEP_NAMES = ['Who', 'Class details', 'Accommodations', 'Review'];
const PLAN_CLASS = { IEP: 'iep', 504: '504', Other: 'other' };

/** First letters of up to two words, which is what a disc has room for. */
function initialsFor(name) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function AddStudentWizard({ onClose, background, leaving = false }) {
  const { doc, mutate } = useData();
  const { dateKey } = useBoard();
  const periods = useMemo(() => periodOptions(doc), [doc]);

  const [step, setStep] = useState(0);
  const [done, setDone] = useState(null);

  const [name, setName] = useState('');
  const [plan, setPlan] = useState('IEP');
  const [periodIds, setPeriodIds] = useState([]);
  const [addingPeriod, setAddingPeriod] = useState(false);
  const [newPeriod, setNewPeriod] = useState('');
  // Blank means "here since the start of the year", which is the common case and
  // the one that needs no explaining on a report.
  const [enrolledFrom, setEnrolledFrom] = useState('');
  const [mode, setMode] = useState(null);
  const [paste, setPaste] = useState('');
  const [picked, setPicked] = useState([]);
  const [openSet, setOpenSet] = useState(null);

  const names = useMemo(() => splitStudentNames(name), [name]);
  const isMulti = names.length > 1;

  const parsed = useMemo(() => resolveAccommodationList(paste, doc.catalog), [paste, doc.catalog]);

  // Starter picks the paste already covers are dropped, so taking both routes
  // cannot double up.
  const combined = useMemo(() => {
    const seen = new Set(parsed.items.map((i) => i.label.toLowerCase()));
    return [...parsed.items, ...picked.filter((p) => !seen.has(p.label.toLowerCase()))];
  }, [parsed.items, picked]);

  const chosenPeriods = useMemo(
    () => periods.filter((p) => periodIds.includes(p.id)),
    [periods, periodIds]
  );

  const nextDisabled = step === 0 && names.length === 0;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const reset = useCallback(() => {
    setStep(0);
    setDone(null);
    setName('');
    setPlan('IEP');
    setPeriodIds([]);
    setAddingPeriod(false);
    setNewPeriod('');
    setEnrolledFrom('');
    setMode(null);
    setPaste('');
    setPicked([]);
    setOpenSet(null);
  }, []);

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

  const createPeriod = () => {
    const label = newPeriod.trim();
    if (!label) return;
    mutate((d) => {
      const next = addPeriod(d, { name: label });
      const created = next.periods[next.periods.length - 1];
      // Selected straight away: naming a period here is only ever in service of
      // putting this student in it.
      setPeriodIds((prev) => [...prev, created.id]);
      return next;
    });
    setNewPeriod('');
    setAddingPeriod(false);
  };

  /**
   * The existing domain flow, unchanged.
   *
   * Every student gets the same setup, then the year behind them is laid out and
   * today is seeded - without that last step a student appears on the board with
   * no entries in the day record, and every card silently refuses to move.
   */
  const submit = () => {
    let report = null;
    mutate((d) => {
      let next = d;
      for (const student of names) {
        const outcome = addStudentWithAccommodations(next, {
          displayName: student,
          planType: plan,
          periodIds,
          enrolledFrom: enrolledFrom || null,
          accommodations: combined,
        });
        next = outcome.doc;
        report = outcome.report;
      }

      const range = backfillRange(next);
      const filled = range
        ? backfillDays(next, {
            from: enrolledFrom && enrolledFrom > range.from ? enrolledFrom : range.from,
            to: range.to,
          }).doc
        : next;

      return ensureDay(filled, dateKey);
    });

    setDone({ names: [...names], count: report ? report.added : 0 });
  };

  const goNext = () => {
    if (nextDisabled) return;
    if (step === 3) submit();
    else setStep(step + 1);
  };

  const statusText = [
    isMulti
      ? `${names.length} students will be added together.`
      : 'Only a name is needed to continue.',
    'Skip anything you do not know yet.',
    combined.length > 0
      ? `${combined.length} accommodation${combined.length === 1 ? '' : 's'} ready`
      : 'You can skip this and add accommodations later.',
    'This writes the record and seeds today’s board.',
  ][step];

  const planClass = PLAN_CLASS[plan] || 'other';

  return (
    <div
      className={`acc-wiz${leaving ? ' acc-wiz--leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Add a student"
    >
      {/* The same scene as the board and About, so landing here changes what is
          on the page without changing the room it is in. */}
      <AmbientScene variant={background} />

      <div className="acc-wiz__dialog">
        <header className="acc-wiz__head">
          <div className="acc-wiz__dots">
            {STEP_NAMES.map((title, i) => {
              const current = !done && i === step;
              const past = done ? true : i < step;
              return (
                <button
                  key={title}
                  type="button"
                  className={`acc-wiz__dot${current ? ' acc-wiz__dot--on' : ''}${
                    past ? ' acc-wiz__dot--past' : ''
                  }`}
                  title={title}
                  aria-label={title}
                  aria-current={current ? 'step' : undefined}
                  disabled={!past || Boolean(done)}
                  onClick={() => past && !done && setStep(i)}
                />
              );
            })}
          </div>

          <button type="button" className="acc-wiz__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="acc-wiz__body">
          {/* Keyed by step so the entrance replays on every move. */}
          <div className="acc-wiz__step" key={done ? 'done' : step}>
            {done ? (
              <div className="acc-wiz__done">
                <span className="acc-wiz__tick" aria-hidden="true">
                  ✓
                </span>
                <h1 className="acc-wiz__title acc-wiz__title--done">
                  Added {done.names.join(', ')}
                </h1>
                <p className="acc-wiz__sub">
                  {done.names.length > 1 ? 'Each student was added' : `${done.names[0]} was added`}{' '}
                  with {done.count} accommodation{done.count === 1 ? '' : 's'}. Today’s board is
                  seeded and ready to record against.
                </p>
                <div className="acc-wiz__doneactions">
                  <button type="button" className="acc-btn" onClick={reset}>
                    Add another student
                  </button>
                  <button type="button" className="acc-btn acc-btn--primary" onClick={onClose}>
                    Done
                  </button>
                </div>
              </div>
            ) : step === 0 ? (
              <div className="acc-wiz__pane acc-wiz__pane--narrow">
                <div className="acc-wiz__intro">
                  <h1 className="acc-wiz__title">What should this student be called?</h1>
                  <p className="acc-wiz__sub">
                    Whatever you&rsquo;ll recognise on the board and on a printed report. Initials
                    or a code work fine - the file does not need a full legal name.
                  </p>
                </div>

                <div className="acc-wiz__field">
                  <div className="acc-wiz__namegroup">
                    <input
                      className="acc-wiz__nameinput"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      /*
                        Take the clipboard's own text rather than what the field
                        would make of it. A column pasted out of a spreadsheet
                        arrives with newlines, and a single-line input replaces
                        every one with a space - which is the same character
                        that sits inside "Priya S.".
                      */
                      onPaste={(e) => {
                        const pasted = readPastedNames(e);
                        if (!pasted) return;
                        e.preventDefault();
                        const existing = name.trim();
                        setName((existing ? `${existing}, ` : '') + pasted.join(', '));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && names.length) setStep(1);
                      }}
                      placeholder="J. Alvarez, or JA, or Student 4"
                      aria-label="Student name"
                      autoFocus
                    />
                    <span className={`acc-wiz__planwrap acc-wiz__planwrap--${planClass}`}>
                      <select
                        className="acc-wiz__plan"
                        value={plan}
                        onChange={(e) => setPlan(e.target.value)}
                        aria-label="Plan type"
                        title="Plan type"
                      >
                        {PLAN_TYPES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      {/* Drawn rather than a background image, so it can take the
                          plan colour from the wrapper. */}
                      <svg
                        className="acc-wiz__plancaret"
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        aria-hidden="true"
                      >
                        <path
                          d="M2.5 4.5 6 8l3.5-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </div>
                  <span className="acc-wiz__hint">
                    Paste a whole list, separated by commas or one per line, to add several students
                    together.
                  </span>
                </div>

                {isMulti && (
                  <div className="acc-preview acc-wiz__preview">
                    <p className="acc-preview__summary">
                      {names.length} students, each getting everything set in the next steps
                    </p>
                    <div className="acc-wiz__chips">
                      {names.map((n) => (
                        <span key={n} className="acc-chip acc-chip--on">
                          {n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : step === 1 ? (
              <div className="acc-wiz__pane">
                <div className="acc-wiz__intro acc-wiz__intro--center">
                  <h1 className="acc-wiz__title">Class details</h1>
                  <p className="acc-wiz__sub">
                    Set what you know and skip the rest - all of this is editable later.
                  </p>
                </div>

                <div className="acc-wiz__split">
                  <div className="acc-wiz__cell acc-wiz__cell--end">
                    <span className="acc-wiz__label">Which periods?</span>
                    <div className="acc-wiz__chips acc-wiz__chips--end">
                      {periods.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className={`acc-chip acc-chip--lg${
                            periodIds.includes(p.id) ? ' acc-chip--on' : ''
                          }`}
                          onClick={() =>
                            setPeriodIds((prev) =>
                              prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                            )
                          }
                          aria-pressed={periodIds.includes(p.id)}
                          title={p.name}
                        >
                          {p.shortName}
                        </button>
                      ))}

                      {/*
                        A class this teacher has not named yet, created without
                        leaving the wizard. Sending them to the periods menu
                        would mean abandoning a half-typed student.
                      */}
                      {addingPeriod ? (
                        <input
                          className="acc-wiz__newperiod"
                          value={newPeriod}
                          onChange={(e) => setNewPeriod(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              e.stopPropagation();
                              setNewPeriod('');
                              setAddingPeriod(false);
                            }
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              createPeriod();
                            }
                          }}
                          placeholder="Period 4"
                          aria-label="Name the new period"
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          className="acc-chip acc-chip--lg acc-chip--add"
                          onClick={() => setAddingPeriod(true)}
                          title="Add a period you have not set up yet"
                          aria-label="Add a period"
                        >
                          +
                        </button>
                      )}
                    </div>
                    <span className="acc-wiz__hint">
                      Pick as many as this student is in. Use + to name a new period.
                    </span>
                  </div>

                  <span className="acc-wiz__rule" aria-hidden="true" />

                  <div className="acc-wiz__cell">
                    <span className="acc-wiz__label">Newly enrolled?</span>
                    <input
                      type="date"
                      className="acc-wiz__date"
                      value={enrolledFrom}
                      min={doc.schoolCalendar?.termStart || undefined}
                      max={todayKey()}
                      onChange={(e) => setEnrolledFrom(e.target.value)}
                      aria-label="First day in this class"
                    />
                    <span className="acc-wiz__hint">
                      {enrolledFrom
                        ? `Every day before ${formatDateMedium(enrolledFrom)} stays locked and reads “not applicable - enrolled ${formatDateMedium(enrolledFrom)}”, so nothing is ever recorded against them for a class they were not in yet.`
                        : 'Leave blank if they have been in this class since the start of the year.'}
                    </span>
                  </div>
                </div>
              </div>
            ) : step === 2 ? (
              <div className="acc-wiz__pane">
                <div className="acc-wiz__intro">
                  <h1 className="acc-wiz__title">
                    {isMulti
                      ? 'Their accommodations'
                      : 'How do you want to add their accommodations?'}
                  </h1>
                  <p className="acc-wiz__sub">
                    The plan&rsquo;s wording is what counts - edit anything later to match what it
                    actually says.
                  </p>
                </div>

                {mode === null && (
                  <div className="acc-wiz__chooser">
                    <button
                      type="button"
                      className="acc-wiz__choice"
                      onClick={() => setMode('paste')}
                    >
                      <span className="acc-wiz__choice-name">Paste from the IEP</span>
                      <span className="acc-wiz__choice-body">
                        Copy the accommodation cells straight out of the spreadsheet - one per line,
                        or separated by commas.
                      </span>
                    </button>
                    <button
                      type="button"
                      className="acc-wiz__choice"
                      onClick={() => setMode('starter')}
                    >
                      <span className="acc-wiz__choice-name">Pick from a starter set</span>
                      <span className="acc-wiz__choice-body">
                        Common wordings in six categories, ready to tick. A quick start when the
                        plan is not in front of you.
                      </span>
                    </button>
                  </div>
                )}

                {mode !== null && (
                  <div className="acc-wiz__back">
                    <button
                      type="button"
                      className="acc-wiz__backlink"
                      onClick={() => setMode(null)}
                    >
                      &lsaquo; Choose a different way
                    </button>
                  </div>
                )}

                {mode === 'paste' && (
                  <>
                    <div className="acc-wiz__field">
                      <span className="acc-wiz__label">Paste their accommodations</span>
                      <textarea
                        className="acc-paste acc-wiz__paste"
                        value={paste}
                        onChange={(e) => setPaste(e.target.value)}
                        rows={6}
                        placeholder={
                          'Copy the accommodation cells straight out of the IEP spreadsheet and paste here.\n\n' +
                          'One per line, or separated by commas.'
                        }
                        aria-label="Paste their accommodations"
                      />
                      <span className="acc-wiz__hint">
                        Commas inside brackets are safe - “Preferential seating (front, near
                        instruction)” stays in one piece.
                      </span>
                    </div>

                    {parsed.items.length > 0 && (
                      <div className="acc-preview">
                        <p className="acc-preview__summary">
                          {parsed.items.length} accommodation{parsed.items.length === 1 ? '' : 's'}{' '}
                          found
                          {parsed.duplicates.length > 0 &&
                            `, ${parsed.duplicates.length} duplicate skipped`}
                        </p>
                        <ul className="acc-preview__list">
                          {parsed.items.map((item) => (
                            <li key={item.label} className="acc-preview__item">
                              <span className="acc-preview__label">{item.label}</span>
                              <span
                                className={`acc-preview__tag acc-preview__tag--${
                                  item.isNew ? 'new' : 'reuse'
                                }`}
                              >
                                {item.isNew ? 'New' : 'Already in your list'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}

                {mode === 'starter' && (
                  <div className="acc-starters">
                    {STARTER_SETS.map((set) => {
                      const items = itemsForSet(set.id);
                      const chosen = items.filter((i) =>
                        picked.some((p) => p.label === i.label)
                      ).length;
                      const isOpen = openSet === set.id;

                      return (
                        <div key={set.id} className="acc-starter">
                          <button
                            type="button"
                            className="acc-starter__head"
                            onClick={() => setOpenSet(isOpen ? null : set.id)}
                            aria-expanded={isOpen}
                          >
                            <span className="acc-starter__name">{set.label}</span>
                            <span className="acc-starter__hint">{set.hint}</span>
                            {chosen > 0 && (
                              <span className="acc-starter__badge acc-numeric">{chosen}</span>
                            )}
                            <span className="acc-starter__chevron">{isOpen ? '−' : '+'}</span>
                          </button>

                          {isOpen && (
                            <div className="acc-starter__body">
                              <button
                                type="button"
                                className="acc-btn acc-btn--small acc-btn--quiet"
                                onClick={() => toggleSetAll(set.id)}
                              >
                                {chosen === items.length ? 'Clear all' : 'Select all'}
                              </button>
                              <div className="acc-wiz__chips">
                                {items.map((item) => (
                                  <button
                                    key={item.label}
                                    type="button"
                                    className={`acc-chip acc-chip--wrap${
                                      picked.some((p) => p.label === item.label)
                                        ? ' acc-chip--on'
                                        : ''
                                    }`}
                                    onClick={() => togglePick(item)}
                                    aria-pressed={picked.some((p) => p.label === item.label)}
                                  >
                                    {item.label}
                                    {item.requiresDetail && (
                                      <span className="acc-chip__count">detail</span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="acc-wiz__pane acc-wiz__pane--narrow">
                <div className="acc-wiz__intro">
                  <h1 className="acc-wiz__title">
                    {isMulti
                      ? `Ready to add ${names.length} students`
                      : `Ready to add ${names[0] || 'this student'}`}
                  </h1>
                  <p className="acc-wiz__sub">
                    This is how the record will look - every part stays editable from the board.
                  </p>
                </div>

                <div className="acc-wiz__card">
                  <div className="acc-wiz__cardhead">
                    <span className="acc-wiz__disc" aria-hidden="true">
                      {isMulti ? names.length : initialsFor(names[0])}
                    </span>
                    <div className="acc-wiz__identity">
                      <div className="acc-wiz__nameline">
                        <span className="acc-wiz__cardname">
                          {isMulti ? `${names.length} students` : names[0] || 'Student'}
                        </span>
                        <span className={`acc-pill acc-pill--${planClass}`}>{plan}</span>
                      </div>
                      <span className="acc-wiz__meta">
                        {chosenPeriods.length
                          ? chosenPeriods.map((p) => p.shortName).join(', ')
                          : 'No periods yet'}
                        {' · '}
                        {enrolledFrom
                          ? `Enrolled ${formatDateMedium(enrolledFrom)}`
                          : 'Start of year'}
                      </span>
                    </div>
                    <div className="acc-wiz__edit">
                      <span className="acc-wiz__editlabel">Edit</span>
                      <button
                        type="button"
                        className="acc-wiz__editlink"
                        onClick={() => setStep(0)}
                      >
                        Name
                      </button>
                      {/* The hollow ring the app uses as a divider, not a bullet. */}
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

                  {isMulti && (
                    <div className="acc-wiz__chips acc-wiz__chips--card">
                      {names.map((n) => (
                        <span key={n} className="acc-chip acc-chip--on">
                          {n}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="acc-wiz__accoms">
                    <div className="acc-wiz__accomhead">
                      <span className="acc-wiz__label">
                        {combined.length
                          ? `${combined.length} accommodation${combined.length === 1 ? '' : 's'}`
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

                    {combined.length > 0 ? (
                      <div className="acc-wiz__chips">
                        {combined.map((c) => (
                          <span key={c.label} className="acc-wiz__accom">
                            {c.label}
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

                {isMulti && (
                  <p className="acc-wiz__footnote">
                    Each of the {names.length} students gets this same setup, editable per student
                    afterwards.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {!done && (
          <footer className="acc-wiz__foot">
            {/* The spacer holds the row still when Back is not there to hold it. */}
            <div className="acc-wiz__footside">
              {step > 0 && (
                <button
                  type="button"
                  className="acc-btn acc-btn--quiet"
                  onClick={() => setStep(Math.max(0, step - 1))}
                >
                  Back
                </button>
              )}
            </div>

            <span className="acc-wiz__tip">{statusText}</span>

            <button
              type="button"
              className="acc-btn acc-btn--primary"
              onClick={goNext}
              disabled={nextDisabled}
            >
              {step === 3 ? (isMulti ? `Add ${names.length} students` : 'Add student') : 'Next'}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
