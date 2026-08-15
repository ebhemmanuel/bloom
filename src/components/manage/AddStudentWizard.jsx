import { useCallback, useMemo, useRef, useState } from 'react';
import SceneFrame from '../shared/SceneFrame.jsx';
import PlanChooser from './PlanChooser.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useBoard } from '../../context/BoardContext.jsx';
import useSlotWords from '../../hooks/useSlotWords.js';
import {
  resolveAccommodationList,
  addStudentWithAccommodations,
  splitStudentNames,
  readPastedNames,
} from '../../domain/importStudent.js';
import { addPeriod } from '../../domain/mutations.js';
import { itemsForSet, resolveStarterItem } from '../../domain/starterSets.js';
import AccommodationChooser, { routeOf } from './AccommodationChooser.jsx';
import RosterList from './RosterList.jsx';
import StudentDetour, {
  DETOUR_STEPS,
  detourTip,
  detourLabel,
  commitDetourPaste,
} from './StudentDetour.jsx';
import DateField from '../shared/DateField.jsx';
import { planClassOf } from '../../domain/constants.js';
import { normalizeSearch, periodOptions } from '../../domain/selectors.js';
import useCustomScrollbar from '../../hooks/useCustomScrollbar.js';
import { ensureDay, backfillDays, backfillRange } from '../../domain/seed.js';
import { formatDateMedium, sinceTermLabel, todayKey } from '../../domain/dates.js';

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

/**
 * Who, then one student at a time, then the review.
 *
 * "Class details" used to be a single screen answering periods and the
 * enrolment date for everybody at once. Periods are not a group fact - a pasted
 * roster is five students in five different classes - so the group screen had
 * to guess, and every attempt to make it honest produced a screen where two
 * students' answers were mixed together and neither could be read off it.
 *
 * The middle is ONE loop, not two passes: periods then accommodations for Rex,
 * then periods then accommodations for Sam. Walking the whole list twice asks a
 * teacher to hold the roster in their head across two circuits, when what they
 * actually have in front of them is one student's paperwork at a time.
 *
 * The enrolment date is the one answer that genuinely is usually shared, so it
 * moved to the end where it is asked once.
 */
/* The dots' tooltips. Built from the teacher's own word for a slot, so the
   second step is named the same thing the screen under it asks about. */
const stepNames = (words) => ['Who', words.Many, 'Accommodations', 'Review'];

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
  // "Period" or "block", from this teacher's grades. Presentation only.
  const words = useSlotWords();
  const STEP_NAMES = stepNames(words);
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
  const [flagged, setFlagged] = useState([]);
  const openRow = (id) => {
    setEditingId(id);
    setEditStep(0);
    // On the paste box, and empty, so nothing typed about somebody else follows
    // us in.
    setMode('paste');
    setPaste('');
    setPasteReplaces(false);
  };
  const seq = useRef(0);

  const [addingPeriod, setAddingPeriod] = useState(false);
  const [newPeriod, setNewPeriod] = useState('');

  /**
   * Which student the middle of the flow is about.
   *
   * One index for both of its screens, because they are one visit: a student's
   * classes and their plan are answered together, then the next student.
   */
  const [studentIndex, setStudentIndex] = useState(0);

  const [mode, setMode] = useState(null);
  const [paste, setPaste] = useState('');
  /**
   * Whether the paste box is being used to EDIT a list rather than add to one.
   *
   * Seeded by Edit on the confirm card, which puts their existing wordings in
   * the box. Everywhere else pasting adds, and it has to: a teacher pasting a
   * second batch is not saying the first batch was wrong. Here they are looking
   * at their own list, so a line they deleted has to come off - which means
   * what comes out of the box replaces what went in.
   */
  const [pasteReplaces, setPasteReplaces] = useState(false);
  const [picked, setPicked] = useState([]);
  const [openSet, setOpenSet] = useState(null);

  /*
    Both middle screens are about the same person. They used to ask once and
    give the answer to everybody, which on a pasted roster is close to always
    wrong: five students arriving in one paste are five different plans, and
    handing all five the same answers writes a record nobody claimed.
  */
  const studentFor = roster[studentIndex] || null;
  const lastStudent = studentIndex >= roster.length - 1;

  /**
   * The enrolment date, asked once at the end - and held by the STUDENTS.
   *
   * There is no separate "all of them" value to go stale. The field shows the
   * date when they all carry the same one and nothing when they do not, and
   * setting it writes to every row. Three things follow, and they are the three
   * a teacher expects:
   *
   *   - Setting it for all of them sets it on each of them, so their own rows
   *     say what the record will say.
   *   - Giving one student a date of their own makes the field blank, because
   *     "all of them" is no longer true of anybody. The individual answer took
   *     over, which is the narrower claim and the one that should win.
   *   - Everyone else keeps the date they were given. Nothing reverts, because
   *     there is nothing held elsewhere to revert to.
   */
  const dates = [...new Set(roster.map((r) => r.enrolledFrom || ''))];
  const sharedDate = dates.length === 1 ? dates[0] : '';
  const datesDiffer = dates.length > 1;

  // What blank means, said as the date it actually is. See sinceTermLabel.
  const sinceLabel = sinceTermLabel(doc.schoolCalendar?.termStart);

  /**
   * What a brand-new row's enrolment defaults to.
   *
   * Mid-year, the honest default is TODAY: a student typed in on August 15th of
   * a term that began on the 3rd almost certainly just arrived, and counting
   * them from the start of the year would manufacture days of "not used" that
   * nobody owed them. On or before the first day it stays blank, which means
   * "since the start of the year" - and either way the date sits on the row,
   * visible and correctable.
   */
  const term = doc.schoolCalendar?.termStart;
  const defaultEnrolledFrom = term && todayKey() > term ? todayKey() : '';

  const setDateForAll = (next) =>
    setRoster((prev) => prev.map((r) => ({ ...r, enrolledFrom: next })));

  // What is in the field but not yet on the list, so the split can be seen
  // before it is committed to a row.
  const typed = useMemo(() => splitStudentNames(name), [name]);

  /**
   * One field, two jobs: type a name to add, or type one to find.
   *
   * A pasted roster of thirty is a list you then have to work through, and
   * "which of these was Priya" was answerable only by scrolling. The field is
   * already where the teacher's hands are and already holds a name, so it
   * filters the rows as well - the same trick the preset list uses. Enter still
   * adds, so the two jobs never fight: filtering shows you what is there, and
   * the keystroke that commits is unchanged.
   */
  const query = normalizeSearch(name);
  const filtering = query.length > 0 && roster.length > 0;
  const shown = useMemo(
    () => (filtering ? roster.filter((r) => normalizeSearch(r.name).includes(query)) : roster),
    [filtering, roster, query]
  );

  // The list scrolls inside the pane rather than the pane inside the sheet, so
  // it gets its own copy of the app's floating bar.
  const rosterScroll = useCustomScrollbar();

  const names = useMemo(() => roster.map((r) => r.name), [roster]);
  const isMulti = roster.length > 1;
  const editing = roster.find((r) => r.id === editingId) || null;

  // Which view the frame is showing: the name step alone is the pinned one.
  const pinned = !done && !editing && !confirming && step === 0;

  /**
   * The middle of the flow, as a list of SCREENS still worth showing.
   *
   * Not "which students are unfinished" - which screens are unanswered. The
   * case this exists for: a teacher part-way through eight students goes back
   * to the name step because they missed one, presses Continue, and is walked
   * through all eight again to reach the one that is new. Worse, somebody who
   * only lacked periods was still shown their accommodations screen with their
   * own five supports already ticked, to press Continue past.
   *
   * So each student contributes only the questions they have not answered:
   * periods if they sit in none, accommodations if they have none, both if
   * neither, and NOTHING at all when both are set. A student with everything
   * filled in never appears in the walk.
   *
   * Recomputed on every move rather than held, so answering a question removes
   * its screen from the rest of the trip as soon as it is answered.
   */
  const stopsIn = (list) =>
    list.flatMap((r, i) => [
      ...(r.periodIds.length === 0 ? [{ i, which: 1 }] : []),
      ...(r.accoms.length === 0 ? [{ i, which: 2 }] : []),
    ]);

  /** Screens are ordered by student, then periods before accommodations. */
  const ordOf = (i, which) => i * 2 + (which - 1);

  /**
   * The next screen after this one, or null for "on to the review".
   *
   * Strictly after, which is what lets a teacher leave a question unanswered
   * and still move on: skipping periods does not put their periods screen back
   * in front of them, it just leaves that fact unset.
   */
  const nextStop = (after, list = roster) =>
    stopsIn(list).find((s) => ordOf(s.i, s.which) > after) || null;

  /**
   * Where the walk has actually been, so Back can retrace it exactly.
   *
   * Working the way back out of the rows would not do, for the same reason the
   * forward walk is computed from them: answering a question REMOVES its screen
   * from the list. A teacher who has just set somebody's periods and presses
   * Back to correct them would find that screen gone and land two students
   * earlier. So the trip is remembered rather than re-derived.
   */
  const trail = useRef([]);

  /** Add whatever is in the field, as its own row each. Returns the new rows. */
  const addTyped = () => {
    if (typed.length === 0) return [];
    const added = typed.map((n) => ({
      id: `r${seq.current++}`,
      name: n,
      plan,
      periodIds: [],
      enrolledFrom: defaultEnrolledFrom,
      accoms: [],
    }));
    setRoster((prev) => [...prev, ...added]);
    setName('');
    return added;
  };

  const updateRow = (id, fn) => setRoster((prev) => prev.map((r) => (r.id === id ? fn(r) : r)));

  const parsed = useMemo(() => resolveAccommodationList(paste, doc.catalog), [paste, doc.catalog]);

  // Starter picks the paste already covers are dropped, so taking both routes
  // cannot double up.
  const combined = useMemo(() => {
    const seen = new Set(parsed.items.map((i) => i.label.toLowerCase()));
    return [...parsed.items, ...picked.filter((p) => !seen.has(p.label.toLowerCase()))];
  }, [parsed.items, picked]);

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
    const ids = new Set(roster.flatMap((r) => r.periodIds));
    return periods.filter((p) => ids.has(p.id));
  }, [periods, roster]);

  const cardPlan = roster[0]?.plan || plan;

  /*
    Rows that would go in with nothing recorded against them.

    A student with no accommodations opens an empty lane, which is a fine thing
    to intend and an easy thing to have missed - and one with no enrolment date
    is a student the record assumes has been here since the year opened. Both
    are worth one question before they are written.
  */
  const incomplete = useMemo(
    () => roster.filter((r) => r.accoms.length === 0).map((r) => ({ id: r.id, name: r.name })),
    [roster]
  );

  const nextDisabled = step === 0 && !editing && roster.length === 0 && typed.length === 0;

  /*
    On the accommodations question - the main screen or the same question inside
    a student's own detour - which is where the footer offers the other view.

    It used to be a fork first and a view second, and the footer's left button
    said "choose a different way" to get back out to it. The fork is gone: the
    screen opens on the paste box, because a teacher who has reached this step
    has the plan in front of them, and the presets are what you reach for when
    they do not. So the button names the other view and switches straight to it,
    and Back keeps its own place beside it.
  */
  const onSupports = editing ? editStep === 1 : step === 2;
  const route = routeOf(mode);

  /**
   * Escape closes the plan menu first, and the sheet only once it is shut.
   *
   * Held in a ref rather than in state: both listeners fire inside the same
   * keypress, and the menu's own handler has not re-rendered by the time
   * SceneFrame asks - so the ref still says open, which is exactly what this
   * needs it to say.
   */
  const planOpenRef = useRef(false);
  const notePlanOpen = useCallback((open) => {
    planOpenRef.current = open;
  }, []);
  const sheetCanClose = useCallback(() => !planOpenRef.current, []);

  const reset = useCallback(() => {
    setStep(0);
    setDone(null);
    setName('');
    setPlan('IEP');
    setRoster([]);
    setEditingId(null);
    setConfirming(null);
    setFlagged([]);
    setStudentIndex(0);
    trail.current = [];
    setAddingPeriod(false);
    setNewPeriod('');
    setMode('paste');
    setPaste('');
    setPasteReplaces(false);
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

  /**
   * Fill the chooser from one student's own list.
   *
   * The chooser IS their list while it is open, which is what makes going back
   * to somebody show what was chosen for them rather than an empty screen, and
   * what makes unticking a starter actually remove it.
   */
  const loadChooser = (row) => {
    const own = (row?.accoms || []).map(resolveStarterItem);
    setPicked(own);
    setPaste('');
    setPasteReplaces(false);
    /*
      Always the paste box, never wherever the last student was left.

      The plan is the thing being copied from, so that is the view the question
      opens on. What is already chosen sits under it either way, and the presets
      are one button away in the footer.
    */
    setMode('paste');
    setOpenSet(null);
  };

  /** Write what the chooser holds onto the student it was asking about. */
  const commitChooser = (row) => {
    if (!row) return;
    const labels = combined.map((c) => c.label);
    updateRow(row.id, (r) => ({ ...r, accoms: [...new Set(labels)] }));
  };

  /**
   * Turn a period on or off, for everyone this pass named.
   *
   * The screen answers once for the group. It used to be per student with a
   * switch offering to apply the answer to all, and the switch was right nearly
   * every time - a teacher adding several students at once is adding a class.
   *
   * Read off the student on screen rather than flipping each row's own list, so
   * all of them end up with exactly what this screen is showing. Anyone who
   * differs comes off from their own row, which is where you notice it.
   */
  const togglePeriodFor = (id, periodId) => {
    const current = studentFor?.periodIds || [];
    const next = current.includes(periodId)
      ? current.filter((x) => x !== periodId)
      : [...current, periodId];
    setRoster((prev) => prev.map((r) => ({ ...r, periodIds: [...next] })));
  };

  /** Open one of the two per-student screens on a given student. */
  const visit = (i, which, rows = roster) => {
    const idx = Math.max(0, Math.min(i, rows.length - 1));
    setStudentIndex(idx);
    if (which === 2) loadChooser(rows[idx]);
    setStep(which);
  };

  const createPeriod = () => {
    const label = newPeriod.trim();
    if (!label) return;
    mutate((d) => {
      const next = addPeriod(d, { name: label });
      const created = next.periods[next.periods.length - 1];
      // Selected straight away, for the student on screen: naming a period here
      // is only ever in service of putting THEM in it.
      if (studentFor) togglePeriodFor(studentFor.id, created.id);
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
      for (const row of roster) {
        const outcome = addStudentWithAccommodations(next, {
          displayName: row.name,
          planType: row.plan,
          /*
            The row, and only the row. Class details lands on these as the step
            is left, so by here every answer - group or per student - is already
            on them and re-applying this screen's copy could only disagree.
          */
          periodIds: row.periodIds,
          // The row is the whole answer: the review's shared field writes onto
          // the rows, and a new row already defaults to the honest date.
          enrolledFrom: row.enrolledFrom || null,
          /*
            Theirs alone. There is no group answer for accommodations any more:
            the step asks per student, because "everyone added together receives
            the same support" is a claim about five plans that the teacher never
            made.
          */
          accommodations: row.accoms.map(resolveStarterItem),
        });
        next = outcome.doc;
        report = outcome.report;
      }

      /*
        The floor is the EARLIEST of them, not this screen's answer. With a date
        per student, raising it to the latest would skip laying out the days one
        of the others has been here for.
      */
      const dates = roster.map((r) => r.enrolledFrom).filter(Boolean);
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

  /** The gate's own primary: the teacher meant the empty lanes, so write. */
  const confirmSubmit = () => {
    setConfirming(null);
    submit();
  };

  const goNext = () => {
    if (nextDisabled) return;
    // Describing one student is a detour inside the first step, not a step of
    // its own, so its last pane puts the list back rather than moving anybody
    // forward.
    if (editing) {
      // A list still sitting in the paste box is one the teacher meant to keep.
      // Continue commits it rather than a second button underneath it.
      if (editStep === 1 && (paste.trim() || pasteReplaces)) {
        if (pasteReplaces) {
          // Their own list, edited in place: the box IS the answer, so an
          // emptied box means they took everything off.
          const labels = resolveAccommodationList(paste, doc.catalog).items.map((i) => i.label);
          updateRow(editing.id, (r) => ({ ...r, accoms: [...new Set(labels)] }));
        } else {
          commitDetourPaste({
            paste,
            catalog: doc.catalog,
            onAddCustom: (label) =>
              updateRow(editing.id, (r) =>
                r.accoms.includes(label) ? r : { ...r, accoms: [...r.accoms, label] }
              ),
          });
        }
        setPaste('');
        setPasteReplaces(false);
        setMode('paste');
      }
      if (editStep === DETOUR_STEPS - 1) setEditingId(null);
      else setEditStep(editStep + 1);
      return;
    }
    /*
      The last gate, on the button that actually writes.

      It asks once, about whoever is going in with nothing recorded against
      them, and it carries the enrolment question for whoever has no date. It
      sits HERE rather than on the way out of the name step, because a roster
      that has not been described yet is not a mistake - it is the next few
      screens - and stopping someone on their way into them would be stopping
      them from doing the very thing the confirm is worried they have not done.
    */
    if (step === 3) {
      if (incomplete.length > 0) {
        setConfirming(incomplete);
        return;
      }
      submit();
      return;
    }

    /*
      The end of one screen, and on to the next one still worth showing.

      Both middle steps go through the same walk, which is what makes a student
      who is only missing supports get only that screen - and a student missing
      nothing get none at all. See `stopsIn`.
    */
    if (step === 1 || step === 2) {
      // Accommodations are staged rather than written on the click, so leaving
      // that screen is what lands them.
      if (step === 2) commitChooser(studentFor);
      const stop = nextStop(ordOf(studentIndex, step));
      if (stop) {
        trail.current.push(stop);
        visit(stop.i, stop.which);
        return;
      }
      setStep(3);
      return;
    }

    // Next adds whatever is still in the field, so a teacher who types the last
    // name and reaches for Next does not leave them behind - then goes to the
    // first unanswered screen, which after a trip back here is the student they
    // came to add.
    if (step === 0) {
      const list = [...roster, ...addTyped()];
      const first = nextStop(-1, list);
      // Everything already answered: there is nothing to walk, so the review.
      if (!first) {
        trail.current = [];
        setStep(3);
        return;
      }
      trail.current = [first];
      visit(first.i, first.which, list);
      return;
    }
    setStep(step + 1);
  };

  /** Any move to another step that is not Next or Back. */
  const jumpTo = (i) => {
    setConfirming(null);
    if (step === 2) commitChooser(studentFor);
    if (i === 1 || i === 2) {
      // The first student that step is still unanswered for, or the first row
      // when it is answered for everyone - the dot was clicked deliberately, so
      // the step still opens.
      const first = stopsIn(roster).find((s) => s.which === i);
      const stop = { i: first ? first.i : 0, which: i };
      trail.current = [stop];
      visit(stop.i, stop.which);
      return;
    }
    setStep(i);
  };

  /** Back, walking the same visit Next walks, in reverse. */
  const goBack = () => {
    if (editing) {
      if (editStep === 0) setEditingId(null);
      else setEditStep(editStep - 1);
      return;
    }
    if (step === 3) {
      // Back onto the screen the review was reached from. With nothing to have
      // asked, there was no such screen, so it is the list that Back means.
      const last = trail.current[trail.current.length - 1];
      if (!last) {
        setStep(0);
        return;
      }
      visit(last.i, last.which);
      return;
    }
    if (step === 1 || step === 2) {
      // The chooser is staged rather than live, so this one still commits on
      // the way out: stepping back off somebody's screen is not a reason to
      // throw away what was chosen for them.
      if (step === 2) commitChooser(studentFor);
      // Off this screen, and on to whichever one came before it. Backing off
      // the first lands on the name list, which is where it came from.
      trail.current.pop();
      const back = trail.current[trail.current.length - 1];
      if (back) {
        visit(back.i, back.which);
        return;
      }
      setStep(0);
      return;
    }
    setStep(Math.max(0, step - 1));
  };

  const statusText = [
    editing
      ? detourTip(editStep, editing)
      : roster.length > 0 || typed.length > 1
        ? 'Press Enter to add another, or carry on to describe the ones you have named.'
        : 'Only a name is needed to continue.',
    // Whose visit this is, and how far through the list. On a pasted roster the
    // position is the thing a teacher needs to know.
    isMulti
      ? `${studentFor?.name || 'This student'} - ${studentIndex + 1} of ${roster.length}`
      : 'Skip it if you are not sure yet.',
    isMulti
      ? `${studentFor?.name || 'This student'} - ${studentIndex + 1} of ${roster.length}`
      : combined.length > 0
        ? `${combined.length} accommodation${combined.length === 1 ? '' : 's'} ready`
        : 'You can skip this and add accommodations later.',
    'This writes the record and seeds today’s board.',
  ][step];

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
            /* Through the same gate the buttons use: a dot is another way of
               leaving a step, and leaving Class details has to land it. */
            onClick={() => past && !done && jumpTo(i)}
          />
        );
      })}
    </div>
  );

  const footer = done ? null : (
    <>
      {/*
        Back, and beside it the other view.

        The accommodations question is two views of one list, so the way across
        sits next to the way back rather than replacing it - the accent says it
        is a different kind of move, and Back still means Back on every screen.
      */}
      <div className="acc-sheet__footside">
        {confirming ? (
          /* Off the gate and back to the list, with the students it was about
             ringed - the same "go and fix it later" exit the modal's Cancel
             offered, in the place Back always lives. */
          <button
            type="button"
            className="acc-btn acc-btn--quiet"
            onClick={() => {
              setFlagged(confirming.map((s) => s.id));
              setConfirming(null);
              setStep(0);
            }}
          >
            Back
          </button>
        ) : (
          <>
            {(step > 0 || editing) && (
              <button type="button" className="acc-btn acc-btn--quiet" onClick={goBack}>
                Back
              </button>
            )}
          </>
        )}
      </div>

      {/*
        The centre of the footer carries the guidance line - except on the
        accommodations question, where it carries the other view of the list.

        A sentence saying you may skip this was advice nobody needed twice, and
        it was sitting in the one place on the screen where the second way of
        answering could be equally weighted with neither Back nor Next.
      */}
      {onSupports && !confirming ? (
        <div className="acc-sheet__tip acc-sheet__tip--action">
          <button
            type="button"
            className="acc-btn acc-btn--quiet acc-btn--accent"
            onClick={() => setMode(route === 'starter' ? 'paste' : 'starter')}
          >
            {route === 'starter' ? 'Paste from the IEP' : 'Choose from preset'}
          </button>
        </div>
      ) : (
        <span className="acc-sheet__tip">
          {confirming ? 'Their lanes will open empty until accommodations are added.' : statusText}
        </span>
      )}

      <button
        type="button"
        className="acc-btn acc-btn--primary"
        onClick={confirming ? confirmSubmit : goNext}
        disabled={nextDisabled}
      >
        {editing
          ? detourLabel(editStep)
          : step === 3
            ? isMulti
              ? `Add ${roster.length} students`
              : 'Add student'
            : // The end of somebody's visit says whose turn is next, so nobody
              // wonders whether they missed a student.
              step === 2 && isMulti && !lastStudent
              ? `Next: ${roster[studentIndex + 1]?.name || 'student'}`
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
        /* The name step fills the frame instead of centring in it, because the
           list inside it is the thing that scrolls. Every other view is its own
           height and sits in the middle. */
        className={`acc-sheet__view${pinned ? ' acc-sheet__view--fill' : ''}`}
        key={done ? 'done' : editing ? `row-${editing.id}-${editStep}` : confirming ? 'gate' : step}
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
        ) : confirming ? (
          /*
            The last gate, as a step of the flow rather than a small modal over
            it. Every other question in here is a full pane with the footer
            carrying the way forward and the way back; the one question that
            decides whether the record is written should not be the one squeezed
            into a box.
          */
          <div className="acc-sheet__pane">
            <div className="acc-sheet__intro acc-sheet__intro--center">
              <h1 className="acc-sheet__title">Missing accommodations</h1>
              {/* Why this is a question and not a wall: an empty lane is a fine
                  thing to mean, because nothing here is a one-shot. */}
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
                const first = roster.findIndex((r) => r.id === confirming[0].id);
                setConfirming(null);
                visit(first < 0 ? 0 : first, 2);
              }}
            >
              {confirming.length === 1
                ? `Add some for ${confirming[0].name}`
                : `Add some, starting with ${confirming[0].name}`}
            </button>
          </div>
        ) : editing ? (
          /* The same three panes setup shows behind "Choose supports", in the
             frame this sheet already has. */
          <StudentDetour
            sub={editStep}
            student={{ ...editing, periodKeys: editing.periodIds }}
            periods={periodChoices}
            catalog={doc.catalog}
            sinceLabel={sinceLabel}
            mode={mode}
            paste={paste}
            onPaste={setPaste}
            pasteReplaces={pasteReplaces}
            /*
              Edit lands ON the thing being edited, not at the fork above it.

              For accommodations that means the paste box with their own
              wordings already in it, one per line, exactly as they were
              written - so correcting a phrase is correcting a phrase rather
              than removing a chip and typing a replacement. What comes back
              out REPLACES the list (see `pasteReplaces`), because a line
              deleted here has to mean the accommodation is gone.

              With nothing to edit yet there is nothing to seed, so that case
              opens the fork and lets them choose a route.
            */
            onJump={(sub) => {
              const seed = sub === 1 && editing.accoms.length > 0;
              setMode('paste');
              setPaste(seed ? editing.accoms.join('\n') : '');
              setPasteReplaces(seed);
              setEditStep(sub);
            }}
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
          />
        ) : step === 0 ? (
          /* Pinned head, scrolling list. On a roster of thirty the field you
             are typing in used to leave the screen the moment the names filled
             it, which is exactly when you most need it. */
          <div className="acc-sheet__pane acc-wiz__pane--pinned">
            {/*
              Holds the question in the middle of the frame while the list is
              empty, and gets out of the way as it fills.

              A growing spacer rather than a switch between centred and
              top-aligned: `flex-grow` animates, so the heading rises as the
              first row arrives instead of jumping there. With nothing named
              yet, a question pinned to the top of an empty frame reads as a
              screen that has already moved on without you.
            */}
            <div
              className={`acc-wiz__pinlead${roster.length === 0 ? ' acc-wiz__pinlead--open' : ''}`}
              aria-hidden="true"
            />
            <div className="acc-wiz__pinhead">
              <div className="acc-sheet__intro">
                <h1 className="acc-sheet__title">What should this student be called?</h1>
                <p className="acc-sheet__sub">
                  Whatever you&rsquo;ll recognise on the board and on a printed report. Initials or
                  a code work fine - the file does not need a full legal name.
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
                          enrolledFrom: defaultEnrolledFrom,
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
                  <PlanChooser value={plan} onChange={setPlan} onOpenChange={notePlanOpen} />
                </div>
                <span className="acc-wiz__hint">
                  {filtering
                    ? `${shown.length} of ${roster.length} on the list ${
                        shown.length === 1 ? 'matches' : 'match'
                      } - press Enter to add a new one instead.`
                    : 'Paste a whole list, separated by commas or one per line, to add several students together.'}
                </span>
              </div>
            </div>

            {/* No preview of the split. The rows below ARE the preview: a name
                becomes one the moment it is entered, and what the splitter made
                of the text is visible there with everything else the teacher can
                do about it. */}
            <div className="acc-wiz__pinscroll">
              <div
                className="acc-wiz__pinlist"
                ref={rosterScroll.scrollRef}
                onScroll={rosterScroll.onScroll}
              >
                <RosterList
                  students={shown.map((r) => ({ ...r, periodKeys: r.periodIds }))}
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
                  // Editable here as well as on the review: a name is most often
                  // wrong the moment it is typed, and that is this screen.
                  onRename={(id, value) => updateRow(id, (r) => ({ ...r, name: value }))}
                  onEdit={openRow}
                  onRemove={(id) => setRoster((prev) => prev.filter((r) => r.id !== id))}
                />

                {filtering && shown.length === 0 && (
                  <p className="acc-wiz__nomatch">
                    Nobody on the list matches that. Press Enter to add them.
                  </p>
                )}
              </div>

              {rosterScroll.bar.height > 0 && (
                <div
                  className={`acc-scrollbar acc-scrollbar--inset${
                    rosterScroll.bar.visible ? ' acc-scrollbar--visible' : ''
                  }`}
                  style={{
                    top: `${rosterScroll.bar.trackTop}px`,
                    height: `${rosterScroll.bar.trackHeight}px`,
                  }}
                  aria-hidden="true"
                >
                  <div
                    className="acc-scrollbar__thumb"
                    style={{
                      top: `${rosterScroll.bar.top}px`,
                      height: `${rosterScroll.bar.height}px`,
                    }}
                    onPointerDown={rosterScroll.onThumbPointerDown}
                  />
                </div>
              )}
            </div>
          </div>
        ) : step === 1 ? (
          <div className="acc-sheet__pane">
            {/*
              Answered once, for everyone this pass named.

              It used to be per student with a switch offering to apply the
              answer to all - and the switch was the right answer close to every
              time, because a teacher adding several students at once is almost
              always adding one class. A toggle that is correct by default is a
              question nobody needed to be asked, so it is gone and its
              behaviour is simply how the screen works. Anyone who differs is
              corrected from their own row, which is where you notice it.
            */}
            <div className="acc-sheet__intro acc-sheet__intro--center">
              <h1 className="acc-sheet__title">
                {isMulti
                  ? `Which ${words.many} are these ${roster.length} students in?`
                  : `Which ${words.many} are they in?`}
              </h1>
              <p className="acc-sheet__sub acc-sheet__sub--balance">
                {isMulti
                  ? 'They all get these. Correct anyone who differs from their own row afterwards.'
                  : 'Pick as many as they sit in, or skip it - a student in none of them still appears on every board.'}
              </p>
            </div>

            <div className="acc-wiz__field acc-wiz__field--center">
              <div className="acc-wiz__chips acc-wiz__chips--center">
                {periods.map((p) => {
                  const on = Boolean(studentFor?.periodIds.includes(p.id));
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`acc-chip acc-chip--lg${on ? ' acc-chip--on' : ''}`}
                      onClick={() => studentFor && togglePeriodFor(studentFor.id, p.id)}
                      aria-pressed={on}
                      title={p.name}
                    >
                      {p.shortName}
                    </button>
                  );
                })}

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
                    placeholder={`${words.One} 4`}
                    aria-label={`Name the new ${words.one}`}
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    className="acc-chip acc-chip--lg acc-chip--add"
                    onClick={() => setAddingPeriod(true)}
                    title={`Add a ${words.one} you have not set up yet`}
                    aria-label={`Add a ${words.one}`}
                  >
                    +
                  </button>
                )}
              </div>
              <span className="acc-wiz__hint acc-wiz__hint--center">
                Use + to name a class you have not set up yet.
              </span>
            </div>
          </div>
        ) : step === 2 ? (
          <div className="acc-sheet__pane acc-sheet__pane--wide">
            {/* Whose plan this is, in the heading. A pasted roster walks through
                here one student at a time, and a screen that did not say the
                name was the reason one answer used to reach all of them. */}
            <div className="acc-sheet__intro">
              <h1 className="acc-sheet__title">
                {isMulti ? (
                  <>
                    What does{' '}
                    <span className="acc-sheet__who">{studentFor?.name || 'this student'}</span>{' '}
                    receive?
                  </>
                ) : (
                  // Not "how do you want to add them" any more: there is no
                  // fork to choose at, so the screen asks the question itself.
                  'What do they receive?'
                )}
              </h1>
              <p className="acc-sheet__sub">
                {isMulti
                  ? 'Answered for this student alone. Continue moves to the next one.'
                  : 'The plan’s wording is what counts - edit anything later to match what it actually says.'}
              </p>
            </div>

            <AccommodationChooser
              mode={mode}
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

            {/*
              The same rows the first screen shows, with each student's supports
              under their own.

              It used to be a summary card - one header over a flat list of
              names - which looked like a different app and, worse, was
              read-only: the last screen before writing a compliance record was
              the one screen where nothing could be corrected. Every row here is
              live. Rename in place, correct a period, open Choose supports,
              take somebody off.
            */}
            <RosterList
              students={roster.map((r) => ({ ...r, periodKeys: r.periodIds }))}
              periods={periodChoices}
              showAccoms
              onRename={(id, value) => updateRow(id, (r) => ({ ...r, name: value }))}
              onTogglePeriod={togglePeriodFor}
              onEdit={openRow}
              onRemove={(id) => setRoster((prev) => prev.filter((r) => r.id !== id))}
            />

            {/*
              The one question left, and the last screen is where it belongs.
              Unlike periods this genuinely is usually one answer for everyone
              arriving together - a class that gained four students gained them
              on the same day - and a student who joined on their own date has
              their own field on their row.
            */}
            <div className="acc-wiz__field acc-wiz__field--center">
              <span className="acc-wiz__label">
                {isMulti ? 'Newly enrolled? (all of them)' : 'Newly enrolled?'}
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
    </SceneFrame>
  );
}
