import { useCallback, useMemo, useRef, useState } from 'react';
import SceneFrame from '../shared/SceneFrame.jsx';
import Caret from '../shared/Caret.jsx';
import { usePopoverDismiss } from '../shell/AppHeader.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useBoard } from '../../context/BoardContext.jsx';
import {
  resolveAccommodationList,
  addStudentWithAccommodations,
  splitStudentNames,
  readPastedNames,
} from '../../domain/importStudent.js';
import { addPeriod } from '../../domain/mutations.js';
import { itemsForSet, resolveStarterItem } from '../../domain/starterSets.js';
import AccommodationChooser from './AccommodationChooser.jsx';
import RosterList from './RosterList.jsx';
import StudentDetour, { DETOUR_STEPS, detourTip, detourLabel } from './StudentDetour.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import { PLAN_TYPES } from '../../domain/constants.js';
import { periodOptions } from '../../domain/selectors.js';
import { ensureDay, backfillDays, backfillRange } from '../../domain/seed.js';
import { formatDateMedium } from '../../domain/dates.js';

/**
 * Add a student, as four short questions rather than one long form.
 *
 * Built to `design_handoff_add_student_wizard/`: Who, Class details,
 * Accommodations, Review, inside a fixed 900x660 frame so the steps swap
 * without the window resizing under the pointer.
 *
 * It is NOT a dialog on a scrim. Opening it cascades the board away and lands
 * here, exactly as About does, so every full-screen destination in the app
 * arrives the same way. The frame is `SceneFrame` / `.acc-sheet`, shared with
 * day notes; only what is inside it belongs to this file.
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

  /**
   * The students named so far, a row each.
   *
   * This used to be a derived list of strings and nothing else, so a roster of
   * five arrived as five chips: nothing to correct, nothing to remove, and one
   * shared answer for all of them. Setup's roster screen had rows from the
   * start, and the two are meant to be the same flow, so the rows live here too
   * now - each carrying its own periods and its own supports.
   */
  const [roster, setRoster] = useState([]);
  // Which row is open, if any, and where in its three panes. Setup gives this
  // its own screen; the sheet already has a frame, so it takes the place of the
  // name pane.
  const [editingId, setEditingId] = useState(null);
  const [editStep, setEditStep] = useState(0);

  // Who is going in half-described when Next is pressed with nothing left to
  // name, or null. See `goNext`.
  const [confirming, setConfirming] = useState(null);
  const [confirmDate, setConfirmDate] = useState('');
  const [flagged, setFlagged] = useState([]);
  const openRow = (id) => {
    setEditingId(id);
    setEditStep(0);
  };
  const seq = useRef(0);

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

  // What is in the field but not yet on the list, so the split can be seen
  // before it is committed to a row.
  const typed = useMemo(() => splitStudentNames(name), [name]);
  const names = useMemo(() => roster.map((r) => r.name), [roster]);
  const isMulti = roster.length > 1;
  const editing = roster.find((r) => r.id === editingId) || null;

  /** Add whatever is in the field, as its own row each. */
  const addTyped = () => {
    if (typed.length === 0) return;
    setRoster((prev) => [
      ...prev,
      ...typed.map((n) => ({
        id: `r${seq.current++}`,
        name: n,
        plan,
        periodIds: [],
        enrolledFrom: '',
        accoms: [],
      })),
    ]);
    setName('');
  };

  const updateRow = (id, fn) => setRoster((prev) => prev.map((r) => (r.id === id ? fn(r) : r)));

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

  // The sheet has real period records; the shared row only wants a key, a short
  // label and something to say on hover.
  const periodChoices = useMemo(
    () => periods.map((p) => ({ key: p.id, label: p.shortName, title: p.name })),
    [periods]
  );

  /*
    The review has to describe the students being added, not only the answers
    given on the shared screens: a period corrected on somebody's row counts,
    and so does a support chosen for one of them.
  */
  const reviewPeriods = useMemo(() => {
    const ids = new Set([...periodIds, ...roster.flatMap((r) => r.periodIds)]);
    return periods.filter((p) => ids.has(p.id));
  }, [periods, periodIds, roster]);

  const ownAccoms = useMemo(() => [...new Set(roster.flatMap((r) => r.accoms))], [roster]);

  /*
    And the same for the date. One answer covers everybody only when everybody
    resolves to it; otherwise the card would name one student's date as though
    it were the group's.
  */
  const reviewEnrolled = useMemo(() => {
    const dates = roster.map((r) => r.enrolledFrom || enrolledFrom);
    const distinct = [...new Set(dates)];
    if (distinct.length === 1) {
      return distinct[0] ? `Enrolled ${formatDateMedium(distinct[0])}` : 'Start of year';
    }
    return 'Their own enrolment dates';
  }, [roster, enrolledFrom]);

  const cardPlan = roster[0]?.plan || plan;

  /*
    Rows that would go in with nothing recorded against them.

    A student with no accommodations opens an empty lane, which is a fine thing
    to intend and an easy thing to have missed - and one with no enrolment date
    is a student the record assumes has been here since the year opened. Both
    are worth one question before they are written.
  */
  const incomplete = useMemo(
    () =>
      roster
        .filter((r) => r.accoms.length === 0 && combined.length === 0)
        .map((r) => ({
          id: r.id,
          name: r.name,
          undated: !(r.enrolledFrom || enrolledFrom),
        })),
    [roster, combined, enrolledFrom]
  );

  const nextDisabled = step === 0 && !editing && roster.length === 0 && typed.length === 0;

  const [planOpen, setPlanOpen] = useState(false);
  const closePlan = useCallback(() => setPlanOpen(false), []);
  const planRef = usePopoverDismiss(planOpen, closePlan);

  /**
   * Escape closes the plan menu first, and the sheet only once it is shut.
   *
   * Read through a ref rather than the state: both listeners fire inside the
   * same keypress, and the menu's own handler has not re-rendered yet by the
   * time SceneFrame asks - so the state still says open, which is exactly what
   * this needs it to say.
   */
  const planOpenRef = useRef(false);
  planOpenRef.current = planOpen;
  const sheetCanClose = useCallback(() => !planOpenRef.current, []);

  const reset = useCallback(() => {
    setStep(0);
    setDone(null);
    setName('');
    setPlan('IEP');
    setRoster([]);
    setEditingId(null);
    setConfirming(null);
    setConfirmDate('');
    setFlagged([]);
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
  const submit = (dateFor = {}) => {
    let report = null;
    mutate((d) => {
      let next = d;
      for (const row of roster) {
        /*
          Their own answers first, then the shared ones on top. Unioned rather
          than assigned over: a period corrected on somebody's row, or a support
          chosen for one of them, survives the answer given for everybody.
        */
        const own = row.accoms.map(resolveStarterItem);
        const seen = new Set(own.map((a) => a.label.toLowerCase()));

        const outcome = addStudentWithAccommodations(next, {
          displayName: row.name,
          planType: row.plan,
          periodIds: [...new Set([...row.periodIds, ...periodIds])],
          // Their own date wins, then whatever the confirm just asked for, then
          // the group answer. Unlike the two lists this is a single answer, so
          // the broader one must never overwrite the narrower.
          enrolledFrom: row.enrolledFrom || dateFor[row.id] || enrolledFrom || null,
          accommodations: [...own, ...combined.filter((c) => !seen.has(c.label.toLowerCase()))],
        });
        next = outcome.doc;
        report = outcome.report;
      }

      /*
        The floor is the EARLIEST of them, not this screen's answer. With a date
        per student, raising it to the latest would skip laying out the days one
        of the others has been here for.
      */
      const dates = roster
        .map((r) => r.enrolledFrom || dateFor[r.id] || enrolledFrom)
        .filter(Boolean);
      const earliest = dates.length === roster.length && dates.length ? dates.sort()[0] : null;

      const range = backfillRange(next);
      const filled = range
        ? backfillDays(next, {
            from: earliest && earliest > range.from ? earliest : range.from,
            to: range.to,
          }).doc
        : next;

      return ensureDay(filled, dateKey);
    });

    setDone({ names: [...names], count: report ? report.added : 0 });
  };

  const goNext = () => {
    if (nextDisabled) return;
    // Describing one student is a detour inside the first step, not a step of
    // its own, so its last pane puts the list back rather than moving anybody
    // forward.
    if (editing) {
      if (editStep === DETOUR_STEPS - 1) setEditingId(null);
      else setEditStep(editStep + 1);
      return;
    }
    if (step === 3) {
      submit();
      return;
    }

    /*
      An empty field with a list already on screen means there is nobody left to
      name, so this is the last chance to catch a student who is going in
      half-described. It asks once, here, rather than walking on through two
      screens about nobody and committing them at the end.
    */
    if (step === 0 && typed.length === 0 && incomplete.length > 0) {
      setConfirming(incomplete);
      setConfirmDate('');
      return;
    }

    // Next adds whatever is still in the field, so a teacher who types the last
    // name and reaches for Next does not leave them behind.
    if (step === 0) addTyped();
    setStep(step + 1);
  };

  const statusText = [
    editing
      ? detourTip(editStep, editing)
      : roster.length > 0 || typed.length > 1
        ? 'Press Enter to add another, or carry on to describe the ones you have named.'
        : 'Only a name is needed to continue.',
    'Skip anything you do not know yet.',
    combined.length > 0
      ? `${combined.length} accommodation${combined.length === 1 ? '' : 's'} ready`
      : 'You can skip this and add accommodations later.',
    'This writes the record and seeds today’s board.',
  ][step];

  const planClass = PLAN_CLASS[plan] || 'other';

  const dots = (
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
  );

  const footer = done ? null : (
    <>
      {/* The spacer holds the row still when Back is not there to hold it. */}
      <div className="acc-sheet__footside">
        {(step > 0 || editing) && (
          <button
            type="button"
            className="acc-btn acc-btn--quiet"
            onClick={() =>
              editing
                ? editStep === 0
                  ? setEditingId(null)
                  : setEditStep(editStep - 1)
                : setStep(Math.max(0, step - 1))
            }
          >
            Back
          </button>
        )}
      </div>

      <span className="acc-sheet__tip">{statusText}</span>

      <button
        type="button"
        className="acc-btn acc-btn--primary"
        onClick={goNext}
        disabled={nextDisabled}
      >
        {editing
          ? detourLabel(editStep)
          : step === 3
            ? isMulti
              ? `Add ${roster.length} students`
              : 'Add student'
            : 'Next'}
      </button>
    </>
  );

  return (
    <SceneFrame
      label="Add a student"
      background={background}
      leaving={leaving}
      onClose={onClose}
      canClose={sheetCanClose}
      wide
      head={dots}
      footer={footer}
    >
      {/* Keyed by step so the entrance replays on every move, and by the
          supports detour so that arrives the same way. */}
      <div
        className="acc-sheet__view"
        key={done ? 'done' : editing ? `row-${editing.id}-${editStep}` : step}
      >
        {done ? (
          <div className="acc-wiz__done">
            <span className="acc-wiz__tick" aria-hidden="true">
              ✓
            </span>
            <h1 className="acc-sheet__title acc-wiz__title--done">Added {done.names.join(', ')}</h1>
            <p className="acc-sheet__sub acc-sheet__sub--balance">
              {done.names.length > 1 ? 'Each student was added' : `${done.names[0]} was added`} with{' '}
              {done.count} accommodation{done.count === 1 ? '' : 's'}. Today’s board is seeded and
              ready to record against.
            </p>
            {/* Done first, and the other one under it: they are not a pair of
                equal choices, and side by side they read as one. */}
            <div className="acc-wiz__doneactions">
              <button type="button" className="acc-btn acc-btn--primary" onClick={onClose}>
                Done
              </button>
              <button type="button" className="acc-btn acc-btn--quiet" onClick={reset}>
                Add another student
              </button>
            </div>
          </div>
        ) : editing ? (
          /* The same three panes setup shows behind "Choose supports", in the
             frame this sheet already has. */
          <StudentDetour
            sub={editStep}
            student={{ ...editing, periodKeys: editing.periodIds }}
            periods={periodChoices}
            onTogglePeriod={(id, key) =>
              updateRow(id, (r) => ({
                ...r,
                periodIds: r.periodIds.includes(key)
                  ? r.periodIds.filter((x) => x !== key)
                  : [...r.periodIds, key],
              }))
            }
            onEnrolledFrom={(id, value) => updateRow(id, (r) => ({ ...r, enrolledFrom: value }))}
            onToggle={(label) =>
              updateRow(editing.id, (r) => ({
                ...r,
                accoms: r.accoms.includes(label)
                  ? r.accoms.filter((x) => x !== label)
                  : [...r.accoms, label],
              }))
            }
            onAddCustom={(label) =>
              updateRow(editing.id, (r) =>
                r.accoms.includes(label) ? r : { ...r, accoms: [...r.accoms, label] }
              )
            }
          />
        ) : step === 0 ? (
          <div className="acc-sheet__pane">
            <div className="acc-sheet__intro">
              <h1 className="acc-sheet__title">What should this student be called?</h1>
              <p className="acc-sheet__sub">
                Whatever you&rsquo;ll recognise on the board and on a printed report. Initials or a
                code work fine - the file does not need a full legal name.
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
                    // Straight onto the list. A pasted roster is a roster;
                    // there is nothing to confirm when the names are right
                    // there in front of you.
                    setRoster((prev) => [
                      ...prev,
                      ...pasted.map((n) => ({
                        id: `r${seq.current++}`,
                        name: n,
                        plan,
                        periodIds: [],
                        accoms: [],
                      })),
                    ]);
                    setName('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTyped();
                    }
                  }}
                  placeholder="J. Alvarez, or JA, or Student 4"
                  aria-label="Student name"
                  autoFocus
                />
                {/*
                      A button and a menu, not a native select. Every other
                      chooser in the app opens the same panel of rows with a
                      tick beside the current one, and the OS dropdown this
                      used to raise was the one control that looked like it
                      came from somewhere else.
                    */}
                <span className={`acc-wiz__planwrap acc-wiz__planwrap--${planClass}`} ref={planRef}>
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
              <span className="acc-wiz__hint">
                Paste a whole list, separated by commas or one per line, to add several students
                together.
              </span>
            </div>

            {/* No preview of the split. The rows below ARE the preview: a name
                becomes one the moment it is entered, and what the splitter made
                of the text is visible there with everything else the teacher can
                do about it. */}
            <RosterList
              students={roster.map((r) => ({ ...r, periodKeys: r.periodIds }))}
              periods={periodChoices}
              onTogglePeriod={(id, key) =>
                updateRow(id, (r) => ({
                  ...r,
                  periodIds: r.periodIds.includes(key)
                    ? r.periodIds.filter((x) => x !== key)
                    : [...r.periodIds, key],
                }))
              }
              /* Ringed until they are answered for. Someone given supports
                 after the question was asked is no longer what it meant. */
              flagged={flagged.filter((id) => incomplete.some((s) => s.id === id))}
              onEdit={openRow}
              onRemove={(id) => setRoster((prev) => prev.filter((r) => r.id !== id))}
            />
          </div>
        ) : step === 1 ? (
          <div className="acc-sheet__pane acc-sheet__pane--wide">
            <div className="acc-sheet__intro acc-sheet__intro--center">
              <h1 className="acc-sheet__title">Class details</h1>
              <p className="acc-sheet__sub">
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
                {/*
                  Unbounded on purpose, in both directions.

                  It used to be pinned between the term's start and today, which
                  froze the field solid for the commonest case there is: a
                  teacher who set the app up this morning has a term that starts
                  this morning, so the floor and the ceiling were the same day
                  and the answer was already filled in. Typing a student in is
                  not a claim about when they joined - they may have been here
                  since September, or they may start on Monday - and the record
                  has to be able to say either.
                */}
                <input
                  type="date"
                  className="acc-wiz__date"
                  value={enrolledFrom}
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
          <div className="acc-sheet__pane acc-sheet__pane--wide">
            <div className="acc-sheet__intro">
              <h1 className="acc-sheet__title">
                {isMulti ? 'Their accommodations' : 'How do you want to add their accommodations?'}
              </h1>
              <p className="acc-sheet__sub">
                The plan&rsquo;s wording is what counts - edit anything later to match what it
                actually says.
              </p>
            </div>

            <AccommodationChooser
              mode={mode}
              onMode={setMode}
              paste={paste}
              onPaste={setPaste}
              parsed={parsed}
              picked={picked}
              onTogglePick={togglePick}
              onToggleSet={toggleSetAll}
              openSet={openSet}
              onOpenSet={setOpenSet}
            />
          </div>
        ) : (
          <div className="acc-sheet__pane">
            <div className="acc-sheet__intro">
              <h1 className="acc-sheet__title">
                {isMulti
                  ? `Ready to add ${names.length} students`
                  : `Ready to add ${names[0] || 'this student'}`}
              </h1>
              <p className="acc-sheet__sub">
                This is how the record will look - every part stays editable from the board.
              </p>
            </div>

            <div className="acc-wiz__card">
              <div className="acc-wiz__cardhead">
                <span className="acc-wiz__disc" aria-hidden="true">
                  {isMulti ? roster.length : initialsFor(names[0])}
                </span>
                <div className="acc-wiz__identity">
                  <div className="acc-wiz__nameline">
                    <span className="acc-wiz__cardname">
                      {isMulti ? `${roster.length} students` : names[0] || 'Student'}
                    </span>
                    {!isMulti && (
                      <span className={`acc-pill acc-pill--${PLAN_CLASS[cardPlan] || 'other'}`}>
                        {cardPlan}
                      </span>
                    )}
                  </div>
                  <span className="acc-wiz__meta">
                    {reviewPeriods.length
                      ? reviewPeriods.map((p) => p.shortName).join(', ')
                      : 'No periods yet'}
                    {' · '}
                    {reviewEnrolled}
                  </span>
                </div>
                <div className="acc-wiz__edit">
                  <span className="acc-wiz__editlabel">Edit</span>
                  <button type="button" className="acc-wiz__editlink" onClick={() => setStep(0)}>
                    Name
                  </button>
                  {/* The hollow ring the app uses as a divider, not a bullet. */}
                  <span className="acc-wiz__editdot" aria-hidden="true" />
                  <button type="button" className="acc-wiz__editlink" onClick={() => setStep(1)}>
                    Details
                  </button>
                </div>
              </div>

              {isMulti && (
                <div className="acc-wiz__chips acc-wiz__chips--card">
                  {roster.map((r) => (
                    <span key={r.id} className="acc-chip acc-chip--on">
                      {r.name}
                    </span>
                  ))}
                </div>
              )}

              {/*
                What each of them will actually have: their own picks from
                Choose supports, and anything answered for everybody, marked
                apart.
              */}
              <div className="acc-wiz__accoms">
                <div className="acc-wiz__accomhead">
                  <span className="acc-wiz__label">
                    {combined.length
                      ? `${combined.length} accommodation${combined.length === 1 ? '' : 's'}${
                          ownAccoms.length ? ' each' : ''
                        }`
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

                {combined.length > 0 || ownAccoms.length > 0 ? (
                  <div className="acc-wiz__chips">
                    {ownAccoms.map((label) => (
                      <span key={label} className="acc-wiz__accom">
                        {label}
                      </span>
                    ))}
                    {combined
                      .filter((c) => !ownAccoms.includes(c.label))
                      .map((c) => (
                        <span key={c.label} className="acc-wiz__accom acc-wiz__accom--new">
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

      {/*
        The last thing between a half-described student and the record. It asks
        rather than blocks, and it carries the one field that can still fix the
        other half of the problem.
      */}
      {confirming && (
        <ConfirmDialog
          title={
            confirming.length === 1
              ? `${confirming[0].name} has no accommodations yet`
              : `${confirming.length} students have no accommodations yet`
          }
          body="Their lanes will open empty. That is fine if it is what you meant - you can add accommodations from the board at any time."
          reassurance="Nothing is lost either way. Cancelling brings you back to the list with them marked."
          confirmLabel={roster.length === 1 ? 'Add student' : `Add ${roster.length} students`}
          onCancel={() => {
            setFlagged(confirming.map((s) => s.id));
            setConfirming(null);
          }}
          onConfirm={() => {
            // Only the ones it named as undated, so confirming never rewrites a
            // date somebody already has.
            const dates = {};
            if (confirmDate) {
              confirming.filter((s) => s.undated).forEach((s) => (dates[s.id] = confirmDate));
            }
            setConfirming(null);
            submit(dates);
          }}
        >
          {confirming.some((s) => s.undated) && (
            <>
              <span className="acc-confirm__label">
                {confirming.filter((s) => s.undated).length === 1
                  ? `When did ${confirming.find((s) => s.undated).name} join?`
                  : `When did these ${confirming.filter((s) => s.undated).length} join?`}
              </span>
              <input
                type="date"
                className="acc-wiz__date"
                value={confirmDate}
                onChange={(e) => setConfirmDate(e.target.value)}
                aria-label="Enrolled date for the students without one"
              />
              <span className="acc-confirm__hint">
                Leave it blank if they have been in your class since the start of the year. It only
                touches the ones above that have no date of their own.
              </span>
            </>
          )}
        </ConfirmDialog>
      )}
    </SceneFrame>
  );
}
