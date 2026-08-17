import { useCallback, useRef, useState } from 'react';
import { planClassOf } from '../../../domain/constants.js';
import { itemsForSet, resolveStarterItem } from '../../../domain/starterSets.js';
import { formatDateMedium, sinceTermLabel } from '../../../domain/dates.js';
import {
  splitStudentNames,
  readPastedNames,
  resolveAccommodationList,
} from '../../../domain/importStudent.js';
import AccommodationChooser, { routeOf } from '../../manage/AccommodationChooser.jsx';
import PlanChooser from '../../manage/PlanChooser.jsx';
import RosterList from '../../manage/RosterList.jsx';
import StudentDetour, {
  DETOUR_STEPS,
  detourTip,
  detourLabel,
  commitDetourPaste,
} from '../../manage/StudentDetour.jsx';
import DateField from '../../shared/DateField.jsx';

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

/** Which classes they are already in, from the chips on their row. */
const ownPeriodsOf = (list) => [...new Set(list.flatMap((s) => s.periods || []))];

/** A fresh pass through the flow: nobody named, nothing shared chosen yet. */
export const EMPTY_ROSTER_DRAFT = {
  step: 0,
  name: '',
  plan: 'IEP',
  sharedPeriods: [],
  mode: 'paste',
  paste: '',
  picked: [],
  openSet: null,
  pendingIds: [],
  /*
    Which of the pending students the middle of the flow is about. One index for
    both of its screens, because they are one visit: a student's classes and
    their plan are answered together, then the next student.
  */
  studentIndex: 0,
};

export function RosterStep({
  // The teacher's own word for a slot, passed in: onboarding has no document
  // for useSlotWords to read. See OnboardingFlow.
  words,
  students,
  periods,
  periodNames,
  termStart,
  draft,
  onDraft,
  onAdd,
  onRemove,
  onRename,
  onEdit,
  onTogglePeriod,
  onApplyToPending,
  onBack,
  onBoard,
}) {
  const {
    step,
    name,
    plan,
    sharedPeriods,
    mode,
    paste,
    picked,
    openSet,
    pendingIds,
    studentIndex,
  } = draft;

  // Who is still without accommodations when Done is pressed, or null. Held
  // rather than recomputed: the pass lands first, and `students` is a render
  // behind that. See `finish`.
  const [confirming, setConfirming] = useState(null);
  const [flagged, setFlagged] = useState([]);

  const seq = useRef(0);

  const parsed = splitStudentNames(name);
  const ready = parsed.length > 0;

  /**
   * One field, one or many.
   *
   * Typing a name adds a student. Pasting a column out of a spreadsheet adds all
   * of them, because that is what a teacher setting up in September actually
   * has in front of them.
   *
   * The ids are made here rather than in the flow above, so this step knows
   * which students belong to the pass it is running - the two shared screens
   * answer for THOSE, not for everyone ever added.
   */
  const add = () => {
    if (!ready) return [];
    const added = parsed.map((n) => ({ id: `s${seq.current++}-${n}`, name: n, plan }));
    added.forEach(onAdd);
    onDraft({ name: '', pendingIds: [...pendingIds, ...added.map((s) => s.id)] });
    return added.map((s) => s.id);
  };

  // No catalog exists yet during setup, so everything pasted is new. The
  // preview still earns its place: it shows what the splitter made of the text.
  const parsedAccoms = resolveAccommodationList(paste, []);

  const staged = (() => {
    const seen = new Set(parsedAccoms.items.map((i) => i.label.toLowerCase()));
    return [...parsedAccoms.items, ...picked.filter((p) => !seen.has(p.label.toLowerCase()))];
  })();

  const togglePick = (item) =>
    onDraft({
      picked: picked.some((p) => p.label === item.label)
        ? picked.filter((p) => p.label !== item.label)
        : [...picked, item],
    });

  const toggleSetAll = (setId) => {
    const items = itemsForSet(setId);
    const allPicked = items.every((i) => picked.some((p) => p.label === i.label));
    const without = picked.filter((p) => !items.some((i) => i.label === p.label));
    onDraft({ picked: allPicked ? without : [...without, ...items] });
  };

  // Who this pass is about: the ones named since the last time through.
  const pending = students.filter((s) => pendingIds.includes(s.id));
  const roster = students.length;
  const withoutSupports = students.filter((s) => s.accoms.length === 0);

  /**
   * Whose accommodations the step is asking about, and whether they are last.
   *
   * The step used to ask once and hand the answer to everybody the pass had
   * named. On a pasted roster that is close to always wrong: five students
   * arriving in one paste are five different plans, and giving all five the
   * same supports writes a record nobody claimed. It walks the list instead,
   * and the screen says whose plan it is on.
   */
  const studentFor = pending[studentIndex] || null;
  const lastPending = studentIndex >= pending.length - 1;
  const manyPending = pending.length > 1;

  /**
   * The enrolment date, asked once at the end - and held by the STUDENTS.
   *
   * There is no separate "all of them" value to go stale. The field shows the
   * date when they all carry the same one and nothing when they do not, and
   * setting it writes to every one of them. So setting it for all sets it on
   * each; giving one student their own makes the field blank, because "all of
   * them" is no longer true of anybody; and everyone else keeps what they were
   * given, since there is nothing held elsewhere to revert to.
   */
  const dates = [...new Set(pending.map((s) => s.enrolledFrom || ''))];
  const sharedDate = dates.length === 1 ? dates[0] : '';
  const datesDiffer = dates.length > 1;

  // What blank means, said as the date it actually is. See sinceTermLabel.
  const sinceLabel = sinceTermLabel(termStart);

  const setDateForAll = (next) =>
    onApplyToPending({ ids: pendingIds, periods: [], enrolledFrom: next || null, accoms: [] });

  /** The gate's own primary: the teacher meant the empty lanes, so open up. */
  const confirmSubmit = () => {
    setConfirming(null);
    onBoard();
  };

  /** Open one of the two per-student screens on a given student. */
  const visit = (i, which, ids = pendingIds) => {
    const idx = Math.max(0, Math.min(i, ids.length - 1));
    if (which === 2) loadChooser(students.find((s) => s.id === ids[idx]));
    onDraft({ step: which, studentIndex: idx });
  };

  /** Fill the chooser from one student's own list. */
  const loadChooser = (student) => {
    const own = (student?.accoms || []).map(resolveStarterItem);
    // Always the fork, with their picks shown under it. See the chooser.
    onDraft({ picked: own, paste: '', mode: 'paste', openSet: null });
  };

  /** Write what the chooser holds onto the student it was asking about. */
  const commitChooser = (student) => {
    if (!student) return;
    onApplyToPending({
      ids: [student.id],
      periods: [],
      // Left OUT rather than sent as null: null is an answer meaning "no date",
      // and this call is about accommodations. Sending it would wipe a date the
      // student already had.
      accoms: staged.map((s) => s.label),
      replaceAccoms: true,
    });
  };

  // What the review says about classes: what these students actually carry,
  // since that is now the only place a period is ever recorded.
  const reviewPeriods = ownPeriodsOf(pending).sort((a, b) => a - b);

  // Setup holds periods as bare numbers, since no document exists to hold ids.
  const periodChoices = periods.map((n) => ({
    key: n,
    label: String(n),
    title: periodNames[n] || `${words.One} ${n}`,
  }));

  /**
   * Write this pass onto the students it was about.
   *
   * Called from every way OUT of the pass, not only from the last button. It
   * used to run there alone, so a teacher who chose accommodations and then
   * walked back to the list lost them with no sign that anything had gone: the
   * answers were held in the draft and the draft was thrown away. Nothing here
   * overwrites - see `onApplyToPending` - so applying early costs nothing.
   */
  const applyPending = () => {
    if (pendingIds.length === 0) return;
    // Periods and the date both land on the students as they are set, so the
    // chooser is the only thing still staged.
    if (step === 2) commitChooser(studentFor);
  };

  /**
   * Turn a period on or off for the student the step is asking about.
   *
   * Straight onto the student. There is no staging, no seed and no difference
   * to work out, because the screen is about one of them: what it shows is what
   * they have, and a click is the whole of the change.
   */
  const togglePeriodFor = (id, n) => {
    // The screen answers once, for everyone this pass named. Read off the
    // student on screen rather than flipping each one's own list, so all of
    // them end up with exactly what this screen is showing.
    const current = studentFor?.periods || [];
    const next = current.includes(n) ? current.filter((x) => x !== n) : [...current, n];
    onApplyToPending({ ids: pendingIds, periods: [], setPeriods: next, accoms: [] });
  };

  const clearPass = () =>
    onDraft({
      step: 0,
      name: '',
      sharedPeriods: [],
      mode: 'paste',
      paste: '',
      picked: [],
      openSet: null,
      pendingIds: [],
      studentIndex: 0,
    });

  /*
    Who is still without accommodations once this pass has landed.

    `students` is a render behind the write, so asking it directly would name
    the student the chooser is open on, who is about to be given three.
  */
  const missing = students.filter(
    (s) => s.accoms.length === 0 && !(staged.length > 0 && s.id === studentFor?.id)
  );

  /**
   * Done, and the one question worth asking before it.
   *
   * A student on the roster with no accommodations is a lane that will open
   * empty, which is a fine thing to intend and an easy thing to have missed. So
   * it is asked once, and cancelling puts a ring around exactly who it meant.
   */
  const finish = () => {
    applyPending();
    clearPass();
    if (missing.length > 0) {
      setConfirming(missing.map((s) => ({ id: s.id, name: s.name })));
      return;
    }
    onBoard();
  };

  const next = () => {
    if (step === 0) {
      /*
        Done only when there is nothing left to do: no name in the field AND
        nobody named who has not been described yet. A roster that arrived by
        paste is sitting right there waiting to be asked about, and Continue
        means continue - it walks them, one at a time, rather than offering to
        open the board over the top of them.
      */
      if (!ready && pendingIds.length === 0) {
        finish();
        return;
      }
      // Into the first student's visit, including whoever the field just added.
      visit(0, 1, ready ? [...pendingIds, ...add()] : pendingIds);
      return;
    }

    // Periods, then the same student's accommodations. Nothing to commit on the
    // way out: every click already landed on the student it was about.
    if (step === 1) {
      visit(studentIndex, 2);
      return;
    }

    /*
      The end of one student's visit. Their answers land, and then it is the
      next student's turn - back to periods, not on to a second circuit of the
      whole list. Only the last one goes through to the review.
    */
    if (step === 2) {
      commitChooser(studentFor);
      if (!lastPending) {
        // Straight to the next student's accommodations: periods were answered
        // for all of them on the one screen at the front.
        visit(studentIndex + 1, 2);
        return;
      }
      onDraft({ step: 3 });
      return;
    }

    /*
      The confirm, and then straight back to the top for the next one.

      It used to ask whether you were done, which is the wrong question at the
      moment you have just finished describing somebody: the answer is almost
      always "no, there are five more". Done lives on the first screen now,
      where an empty field means there is nobody left to add.

      Shared answers are UNIONED onto this pass's students rather than assigned
      over them, so a support chosen for one from the list survives.
    */
    applyPending();
    clearPass();
  };

  /*
    Back lands the pass rather than abandoning it, on the same reasoning as
    Done: leaving is not the same as undoing.

    It fires on the way to the list, so walking back from the review reaches a
    row that says "2 supports" rather than one that says nothing was chosen.
    Staying inside the pass - review to accommodations, say - just moves.
  */
  const back = () => {
    // From the review, back into the last student's visit.
    if (step === 3) {
      visit(pending.length - 1, 2);
      return;
    }

    /*
      The chooser is staged rather than live, so it commits on the way out:
      stepping off somebody's screen is not a reason to throw away what was
      chosen for them.
    */
    if (step === 2) {
      commitChooser(studentFor);
      // Periods are answered once, on the screen at the front, so back is the
      // previous student's own screen - except for the first, who came from
      // that shared one.
      if (studentIndex > 0) visit(studentIndex - 1, 2);
      else visit(0, 1);
      return;
    }

    /*
      Back off somebody's periods goes to the PREVIOUS student's last screen,
      which is where they came from, or out to the list WITHOUT ending the pass.
      It used to clear the whole pass here, so a teacher who stepped back to add
      one more name found the students they had already described were no longer
      the ones the next screens were about.
    */
    if (step === 1) {
      if (studentIndex > 0) {
        visit(studentIndex - 1, 2);
        return;
      }
      onDraft({ step: 0 });
      return;
    }

    applyPending();
    clearPass();
    onBack();
  };

  const tips = [
    ready
      ? 'Press Enter to add another, or carry on to describe the ones you have named.'
      : roster > 0
        ? 'Add another, or open your board - everything here is editable later.'
        : 'Names or initials, whatever you would recognise on a report.',
    // Whose classes these are, and how far through the list. On a pasted roster
    // the position is the thing a teacher needs to know.
    manyPending
      ? `${studentFor?.name || 'This student'} - ${studentIndex + 1} of ${pending.length}`
      : 'Skip it if you are not sure yet.',
    manyPending
      ? `${studentFor?.name || 'This student'} - ${studentIndex + 1} of ${pending.length}`
      : staged.length > 0
        ? `${staged.length} accommodation${staged.length === 1 ? '' : 's'} ready`
        : 'You can skip this and add accommodations any time from the board.',
    'This adds them, then brings you back for the next one.',
  ];

  // Done on an empty field, Continue the moment a name is in it. Inside the
  // loop it says where it is going, so nobody wonders if they missed anyone.
  const nextLabel =
    step === 3
      ? `Add ${pending.length || roster} student${(pending.length || roster) === 1 ? '' : 's'}`
      : // The end of somebody's visit says whose turn is next, so nobody
        // wonders whether they missed a student.
        step === 2 && manyPending && !lastPending
        ? `Next: ${pending[studentIndex + 1]?.name || 'student'}`
        : ready || step > 0 || pendingIds.length > 0
          ? 'Continue'
          : 'Done';

  return (
    <div className="acc-ob__screen acc-ob__screen--card">
      <div className="acc-sheet__dialog acc-sheet__dialog--wide">
        <div className="acc-sheet__body">
          {/* Keyed by step so the entrance replays on every move, as the sheet
              does. */}
          <div className="acc-sheet__view" key={confirming ? 'gate' : step}>
            {confirming ? (
              /*
                The last gate, as a step of the flow rather than a small modal
                over it. Every other question here is a full pane with the
                footer carrying the way forward and back; the one deciding
                whether the record is written should not be squeezed into a box.
              */
              <div className="acc-sheet__pane">
                <div className="acc-sheet__intro acc-sheet__intro--center">
                  <h1 className="acc-sheet__title">Missing accommodations</h1>
                  {/* Why this is a question and not a wall: an empty lane is a
                      fine thing to mean, because nothing here is a one-shot. */}
                  <p className="acc-sheet__sub acc-sheet__sub--balance">
                    You can add accommodations at any time later, from the board.
                  </p>
                </div>

                {/* The action the gate exists to offer: go and add them now,
                    landing on that student's own accommodations screen. */}
                <button
                  type="button"
                  className="acc-btn acc-btn--outline acc-confirm__go"
                  onClick={() => {
                    const first = pendingIds.indexOf(confirming[0].id);
                    setConfirming(null);
                    if (first >= 0) visit(first, 2);
                    else onEdit(confirming[0].id);
                  }}
                >
                  {confirming.length === 1
                    ? `Add some for ${confirming[0].name}`
                    : `Add some, starting with ${confirming[0].name}`}
                </button>
              </div>
            ) : step === 0 ? (
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
                      onChange={(e) => onDraft({ name: e.target.value })}
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
                        const added = names.map((n) => ({
                          id: `s${seq.current++}-${n}`,
                          name: n,
                          plan,
                        }));
                        added.forEach(onAdd);
                        onDraft({
                          name: '',
                          pendingIds: [...pendingIds, ...added.map((s) => s.id)],
                        });
                      }}
                      placeholder="J. Alvarez, or JA, or Student 4"
                      aria-label="Student name"
                      autoFocus
                    />

                    <PlanChooser value={plan} onChange={(p) => onDraft({ plan: p })} />
                  </div>

                  <span className="acc-wiz__hint acc-wiz__hint--center">
                    Paste a whole list, separated by commas or one per line, to add several at once.
                  </span>
                </div>

                {/* No preview of the split. The rows below ARE the preview. */}
                <RosterList
                  students={students.map((s) => ({ ...s, periodKeys: s.periods || [] }))}
                  periods={periodChoices}
                  /* Ringed until they are answered for. Someone given supports
                     after the question was asked is no longer what it meant. */
                  flagged={flagged.filter((id) => withoutSupports.some((s) => s.id === id))}
                  // Editable here as well as on the review: a name is most
                  // often wrong the moment it is typed, and that is this
                  // screen.
                  onRename={onRename}
                  onTogglePeriod={onTogglePeriod}
                  onEdit={onEdit}
                  onRemove={onRemove}
                />
              </div>
            ) : step === 1 ? (
              <div className="acc-sheet__pane">
                {/* One student, named in the heading. Which class somebody sits
                    in is not a group fact, and a screen that answered it for
                    everyone at once could only be right about one of them. */}
                <div className="acc-sheet__intro acc-sheet__intro--center">
                  <h1 className="acc-sheet__title">
                    {manyPending
                      ? `Which ${words.many} are these ${pending.length} students in?`
                      : `Which ${words.many} are they in?`}
                  </h1>
                  <p className="acc-sheet__sub acc-sheet__sub--balance">
                    {manyPending
                      ? 'They all get these. Correct anyone who differs from their own row afterwards.'
                      : 'Pick as many as they sit in, or skip it - a student in none of them still appears on every board.'}
                  </p>
                </div>

                <div className="acc-wiz__field acc-wiz__field--center">
                  <div className="acc-wiz__chips acc-wiz__chips--center">
                    {periods.map((n) => {
                      const on = Boolean(studentFor?.periods?.includes(n));
                      return (
                        <button
                          key={n}
                          type="button"
                          className={`acc-chip acc-chip--lg${on ? ' acc-chip--on' : ''}`}
                          aria-pressed={on}
                          title={periodNames[n] || `${words.One} ${n}`}
                          onClick={() => studentFor && togglePeriodFor(studentFor.id, n)}
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
                </div>
              </div>
            ) : step === 2 ? (
              <div className="acc-sheet__pane acc-sheet__pane--wide">
                {/* Whose plan this is, in the heading. A pasted roster walks
                    through here one at a time, and a screen that did not say
                    the name was why one answer used to reach all of them. */}
                <div className="acc-sheet__intro acc-sheet__intro--center">
                  <h1 className="acc-sheet__title">
                    {manyPending ? (
                      <>
                        What does{' '}
                        <span className="acc-sheet__who">{studentFor?.name || 'this student'}</span>{' '}
                        receive?
                      </>
                    ) : (
                      'What do they receive?'
                    )}
                  </h1>
                  <p className="acc-sheet__sub acc-sheet__sub--balance">
                    {manyPending
                      ? 'Answered for this student alone. Continue moves to the next one.'
                      : 'The plan’s wording is what counts - edit anything later to match what it actually says.'}
                  </p>
                </div>

                {/* The sheet's own chooser, unchanged: paste the plan, or tick a
                    starter set. See AccommodationChooser. */}
                <AccommodationChooser
                  mode={mode}
                  paste={paste}
                  onPaste={(p) => onDraft({ paste: p })}
                  parsed={parsedAccoms}
                  picked={picked}
                  onTogglePick={togglePick}
                  onToggleSet={toggleSetAll}
                  openSet={openSet}
                  onOpenSet={(s) => onDraft({ openSet: s })}
                />
              </div>
            ) : (
              <div className="acc-sheet__pane">
                <div className="acc-sheet__intro acc-sheet__intro--center">
                  <h1 className="acc-sheet__title">
                    {pending.length === 1
                      ? `Ready to add ${pending[0].name}`
                      : `Ready to add ${pending.length} students`}
                  </h1>
                  <p className="acc-sheet__sub acc-sheet__sub--balance">
                    This is how the record will look. Every part of it stays editable from the
                    board, and you come straight back here for the next one.
                  </p>
                </div>

                {/*
                  The same rows the first screen shows, with each student's
                  supports under their own.

                  It used to be a summary card - one header over a flat list of
                  names - which looked like a different screen and, worse, was
                  read-only: the last thing before writing a record was the one
                  place nothing could be corrected. Every row here is live.
                */}
                <RosterList
                  students={pending.map((s) => ({ ...s, periodKeys: s.periods || [] }))}
                  periods={periodChoices}
                  showAccoms
                  onRename={onRename}
                  onTogglePeriod={onTogglePeriod}
                  onEdit={onEdit}
                  onRemove={onRemove}
                />
                {/*
                  The one question left, and the last screen is where it
                  belongs. Unlike periods this genuinely is usually one answer
                  for everyone arriving together, and a student who joined on
                  their own date has their own field behind Choose supports.
                */}
                <div className="acc-wiz__field acc-wiz__field--center">
                  <span className="acc-wiz__label">
                    {pending.length > 1 ? 'Newly enrolled? (all of them)' : 'Newly enrolled?'}
                  </span>
                  <DateField
                    value={sharedDate}
                    onChange={setDateForAll}
                    placeholder={datesDiffer ? 'Their own dates' : sinceLabel}
                    label="First day in this class"
                  />
                  <span className="acc-wiz__hint acc-wiz__hint--center">
                    {datesDiffer
                      ? 'They do not all share a date. Setting one here gives it to every one of them.'
                      : sharedDate
                        ? `Every day before ${formatDateMedium(sharedDate)} reads “not applicable - enrolled ${formatDateMedium(sharedDate)}”, so nothing is recorded against them for a class they were not in yet.`
                        : 'Leave it as it is if they have been in this class since your first day.'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* The same row every other step wears: Back on the left, the one line
            of guidance centred, the primary on the right. */}
        <footer className="acc-sheet__foot">
          {/* Back, and its twin: while a route into the accommodation list is
              open, this leaves the route rather than the step. Same place, same
              weight, accent to say it is a different kind of going back. */}
          <div className="acc-sheet__footside">
            {confirming ? (
              /* Off the gate and back to the list, with the students it was
                 about ringed - the same "go and fix it later" exit the modal's
                 Cancel offered, in the place Back always lives. */
              <button
                type="button"
                className="acc-btn acc-btn--quiet"
                onClick={() => {
                  setFlagged(confirming.map((s) => s.id));
                  setConfirming(null);
                }}
              >
                Back
              </button>
            ) : (
              <button type="button" className="acc-btn acc-btn--quiet" onClick={back}>
                Back
              </button>
            )}
          </div>
          {/* The centre carries the other view of the list on the
              accommodations question, and the guidance line everywhere else.
              See the sheet's footer. */}
          {step === 2 && !confirming ? (
            <div className="acc-sheet__tip acc-sheet__tip--action">
              <button
                type="button"
                className="acc-btn acc-btn--quiet acc-btn--accent"
                onClick={() => onDraft({ mode: routeOf(mode) === 'starter' ? 'paste' : 'starter' })}
              >
                {routeOf(mode) === 'starter' ? 'Paste from the IEP' : 'Choose from preset'}
              </button>
            </div>
          ) : (
            <span className="acc-sheet__tip">
              {confirming
                ? 'Their lanes will open empty until accommodations are added.'
                : tips[step]}
            </span>
          )}
          <button
            type="button"
            className="acc-btn acc-btn--primary"
            onClick={confirming ? confirmSubmit : next}
          >
            {confirming ? 'Open my board' : nextLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * One student on their own, reached from "Choose supports".
 *
 * Three panes rather than one: their class details, their supports, then a
 * confirm. The list is where a teacher notices that this one is only in P3 or
 * joined in November, so those questions belong to the row they clicked, not
 * only to the group screen.
 */
export function SupportsStep({
  student,
  periods,
  periodNames,
  termStart,
  onTogglePeriod,
  onEnrolledFrom,
  onToggle,
  onAddCustom,
  onReplaceAccoms,
  onDone,
}) {
  const [sub, setSub] = useState(0);
  // Which route into the accommodation list is open, held HERE so the footer
  // below can offer the way out of it. See StudentDetour.
  const [mode, setMode] = useState('paste');
  // And the paste box's text, for the same reason: Continue is what commits it.
  const [paste, setPaste] = useState('');
  // Whether the box is editing their list rather than adding to it. See the
  // sheet's copy of this for why the two have to behave differently.
  const [pasteReplaces, setPasteReplaces] = useState(false);

  /** Keep whatever is still in the paste box, then move on. */
  const advance = () => {
    if (sub === 1 && (paste.trim() || pasteReplaces)) {
      // No catalog exists yet during setup, so everything pasted is new.
      if (pasteReplaces) {
        onReplaceAccoms(resolveAccommodationList(paste, []).items.map((i) => i.label));
      } else {
        commitDetourPaste({ paste, catalog: [], onAddCustom });
      }
      setPaste('');
      setPasteReplaces(false);
      setMode('paste');
    }
    if (sub === DETOUR_STEPS - 1) onDone();
    else setSub(sub + 1);
  };

  const periodChoices = periods.map((n) => ({
    key: n,
    label: `${words.short}${n}`,
    title: periodNames[n] || `${words.One} ${n}`,
  }));

  const row = {
    ...student,
    periodKeys: student.periods || [],
    enrolledFrom: student.enrolledFrom || '',
  };

  return (
    <div className="acc-ob__screen acc-ob__screen--card">
      <div className="acc-sheet__dialog acc-sheet__dialog--wide">
        <div className="acc-sheet__body">
          {/* Keyed so each pane arrives the way every other step does. */}
          <div className="acc-sheet__view" key={sub}>
            <StudentDetour
              sub={sub}
              student={row}
              periods={periodChoices}
              sinceLabel={sinceTermLabel(termStart)}
              mode={mode}
              paste={paste}
              onPaste={setPaste}
              pasteReplaces={pasteReplaces}
              /* Edit lands ON the thing being edited - their own wordings in
                 the box, one per line, so a phrase is corrected rather than
                 removed and retyped. See the sheet's copy of this. */
              onJump={(next) => {
                const seed = next === 1 && row.accoms.length > 0;
                setMode('paste');
                setPaste(seed ? row.accoms.join('\n') : '');
                setPasteReplaces(seed);
                setSub(next);
              }}
              onTogglePeriod={onTogglePeriod}
              onEnrolledFrom={onEnrolledFrom}
              onToggle={onToggle}
            />
          </div>
        </div>

        <footer className="acc-sheet__foot">
          {/* Back, and beside it the other view of the same list. */}
          <div className="acc-sheet__footside">
            <button
              type="button"
              className="acc-btn acc-btn--quiet"
              onClick={() => (sub === 0 ? onDone() : setSub(sub - 1))}
            >
              Back
            </button>
          </div>
          {sub === 1 ? (
            <div className="acc-sheet__tip acc-sheet__tip--action">
              <button
                type="button"
                className="acc-btn acc-btn--quiet acc-btn--accent"
                onClick={() => setMode(routeOf(mode) === 'starter' ? 'paste' : 'starter')}
              >
                {routeOf(mode) === 'starter' ? 'Paste from the IEP' : 'Choose from preset'}
              </button>
            </div>
          ) : (
            <span className="acc-sheet__tip">{detourTip(sub, row)}</span>
          )}
          <button type="button" className="acc-btn acc-btn--primary" onClick={advance}>
            {detourLabel(sub)}
          </button>
        </footer>
      </div>
    </div>
  );
}
