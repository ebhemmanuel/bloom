import { useCallback, useMemo, useRef, useState } from 'react';
import SceneFrame from '../shared/SceneFrame.jsx';
import Caret from '../shared/Caret.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import AccommodationChooser from './AccommodationChooser.jsx';
import RosterList from './RosterList.jsx';
import { usePopoverDismiss } from '../shell/AppHeader.jsx';
import useCustomScrollbar from '../../hooks/useCustomScrollbar.js';
import { useData } from '../../context/DataContext.jsx';
import { useBoard } from '../../context/BoardContext.jsx';
import {
  resolveAccommodationList,
  addAccommodationsToStudent,
} from '../../domain/importStudent.js';
import {
  addPeriod,
  renameStudent,
  setStudentPlan,
  setStudentPeriods,
  setStudentEnrollment,
  setStudentEnrolledFrom,
  retireAssignment,
  reinstateAssignment,
} from '../../domain/mutations.js';
import { itemsForSet } from '../../domain/starterSets.js';
import { planClassOf } from '../../domain/constants.js';
import PlanChooser from './PlanChooser.jsx';
import DateField from '../shared/DateField.jsx';
import {
  periodOptions,
  normalizeSearch,
  studentSearchTerms,
  recordStartDate,
} from '../../domain/selectors.js';
import { assignmentConfig } from '../../domain/schema.js';
import { ensureDay } from '../../domain/seed.js';
import { formatDateMedium, todayKey, addDays, sinceTermLabel } from '../../domain/dates.js';

/**
 * Edit a student, on the sheet the add-student wizard already taught.
 *
 * This replaces the old two-column "Student accommodations" modal, which was a
 * different shape for the same work: find a student, then change their profile
 * and their list. It is the SAME four screens as adding one - who, class
 * details, accommodations, review - with a find step in front when nobody has
 * been named yet, so the two flows are one thing a teacher learns once.
 *
 * Reached two ways. Edit > Accommodations > Add starts on Find; right-clicking
 * a lane and choosing Edit skips it, because the student has already been
 * pointed at.
 *
 * What commits WHEN, and why they differ:
 *
 *   - Name, plan and periods save as you change them. They are corrections to
 *     who someone is, undated, and no day record carries them.
 *   - Retiring an accommodation is dated from today and applies immediately -
 *     it is its own decision, not part of a draft.
 *   - Accommodations being ADDED are staged until the last screen, because the
 *     paste preview is a promise about what will be created and it should be
 *     possible to back out of it.
 */

const STEP_NAMES = ['Student', 'Who', 'Class details', 'Accommodations', 'Review'];

function initialsFor(name) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function EditStudentWizard({ onClose, background, leaving = false, studentId }) {
  const { doc, mutate, readOnly } = useData();
  const { dateKey } = useBoard();
  const periods = useMemo(() => periodOptions(doc), [doc]);
  const today = todayKey();

  // What a student with no enrolment date of their own falls back to. See the
  // selector: the term start, or the earliest day the board holds.
  const recordStart = useMemo(() => recordStartDate(doc), [doc]);

  // Named on the way in means the find step is behind us, not skipped: the dots
  // still show it, and it is still reachable if the wrong lane was clicked.
  const [selectedId, setSelectedId] = useState(studentId || null);
  const [step, setStep] = useState(studentId ? 1 : 0);
  const [done, setDone] = useState(null);

  const [query, setQuery] = useState('');
  const [addingPeriod, setAddingPeriod] = useState(false);
  const [newPeriod, setNewPeriod] = useState('');
  const [mode, setMode] = useState(null);
  const [paste, setPaste] = useState('');
  const [picked, setPicked] = useState([]);
  const [openSet, setOpenSet] = useState(null);
  const [confirming, setConfirming] = useState(null);

  // The roster on the find step scrolls, and gets the board's own floating bar
  // rather than the native one.
  const listScroll = useCustomScrollbar();

  // Escape shuts the plan menu before it shuts the sheet. See the same ref in
  // AddStudentWizard.
  const planOpenRef = useRef(false);
  const notePlanOpen = useCallback((open) => {
    planOpenRef.current = open;
  }, []);
  const sheetCanClose = useCallback(() => !planOpenRef.current, []);

  const student = doc.students.find((s) => s.id === selectedId) || null;
  const plan = student?.planType || 'IEP';
  const planClass = planClassOf(plan);
  const periodIds = student?.periodIds || [];

  /**
   * Who the search picks out - not who survives it.
   *
   * Typing DIMS the rest rather than removing them. A filtering list rebuilds
   * itself on every keystroke: the columns reflow, the name you were reaching
   * for moves, and the roster you had just learned the shape of is gone. Dimmed,
   * everyone holds their place and the matches simply light up in it, which also
   * answers "is that name even on my roster" without emptying the screen to say
   * no.
   *
   * `null` means nothing has been typed, which is different from "nothing
   * matched" - see the empty line below the field.
   */
  const hits = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return null;
    return new Set(
      doc.students.filter((s) => studentSearchTerms(s).some((t) => t.includes(q))).map((s) => s.id)
    );
  }, [doc.students, query]);

  /**
   * The roster split by plan, IEP beside 504, each in two columns.
   *
   * One long single-column list of forty names is a scroll and a scan; the
   * question a teacher is actually answering here is "which of my IEP students
   * is this", and the plan is the one thing about them that never changes. An
   * empty group is dropped rather than left as a headed blank, and `Other`
   * appears only when somebody is on it - it runs full width underneath, since
   * it is usually one or two people.
   *
   * Built from the whole roster, never from the search: see `hits`.
   *
   * Sorted by the name on the row, which is what an eye runs down.
   */
  const groups = useMemo(() => {
    const by = { IEP: [], 504: [], Other: [] };
    for (const s of doc.students) (by[s.planType] || by.Other).push(s);
    return ['IEP', '504', 'Other']
      .map((plan) => ({
        plan,
        students: by[plan].slice().sort((a, b) => a.displayName.localeCompare(b.displayName)),
      }))
      .filter((g) => g.students.length > 0);
  }, [doc.students]);

  const periodById = useMemo(() => new Map(doc.periods.map((p) => [p.id, p])), [doc.periods]);
  const catalogById = useMemo(() => new Map(doc.catalog.map((c) => [c.id, c])), [doc.catalog]);

  // What they already have, retired ones included: a list that quietly hides
  // what was removed cannot explain why the board looks the way it does.
  const rows = useMemo(() => {
    if (!student) return [];
    return doc.assignments
      .filter((a) => a.studentId === student.id)
      .map((a) => ({ assignment: a, cfg: assignmentConfig(a, catalogById) }))
      .sort((x, y) => x.assignment.sortOrder - y.assignment.sortOrder);
  }, [doc.assignments, student, catalogById]);

  const parsed = useMemo(() => resolveAccommodationList(paste, doc.catalog), [paste, doc.catalog]);

  // Staged additions: the paste, plus starter picks it does not already cover.
  const staged = useMemo(() => {
    const seen = new Set(parsed.items.map((i) => i.label.toLowerCase()));
    return [...parsed.items, ...picked.filter((p) => !seen.has(p.label.toLowerCase()))];
  }, [parsed.items, picked]);

  const write = (fn) => {
    if (!readOnly) mutate(fn);
  };

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
    if (!label || !student) return;
    write((d) => {
      const next = addPeriod(d, { name: label });
      const created = next.periods[next.periods.length - 1];
      return setStudentPeriods(next, student.id, [...periodIds, created.id]);
    });
    setNewPeriod('');
    setAddingPeriod(false);
  };

  /**
   * The staged list, written from today forward.
   *
   * `activeFrom: dateKey` is the whole point of adding to an EXISTING student:
   * earlier days never gain the card, so they cannot later be sealed as Not
   * Used for something that had not been assigned yet.
   */
  const save = () => {
    if (!student) return;
    let added = 0;
    if (staged.length > 0) {
      write((d) => {
        const outcome = addAccommodationsToStudent(d, student.id, staged, {
          effectiveFrom: dateKey,
        });
        added = outcome.report.added;
        return ensureDay(outcome.doc, dateKey);
      });
    }
    setDone({ name: student.displayName, added });
  };

  const nextDisabled = (step === 0 && !student) || (step > 0 && !student);

  const goNext = () => {
    if (nextDisabled) return;
    if (step === 4) save();
    else setStep(step + 1);
  };

  const tips = [
    'Find them by name, or pick from the list.',
    'Saves as you change it.',
    'Saves as you change it. Periods are not dated - fixing one leaves every day alone.',
    staged.length > 0
      ? `${staged.length} to add, from ${formatDateMedium(dateKey)}`
      : 'Anything you add starts from today, so earlier days are untouched.',
    'This writes the changes and seeds today’s board.',
  ];

  /**
   * The roster as the shared rows draw it, filtered by the search.
   *
   * Dimming non-matches the way the old columns did would leave a screen of
   * greyed rows with editable fields in them; a search that filters is what the
   * add screen does, and this is meant to be that screen.
   */
  const found = useMemo(
    () =>
      doc.students
        .filter((s) => !hits || hits.has(s.id))
        .slice()
        /*
          Disenrolled students last, and dimmed.

          They are still on this screen because their record has to stay
          reachable - September's days still name them, and disenrolling is
          never a delete. But they are not who you are looking for: sorted in
          among the class alphabetically, a student who left in November sat
          between two you teach on Tuesday, and the only thing marking them was
          a word at the end of the row.
        */
        .sort(
          (a, b) =>
            Number(Boolean(a.unenrolledFrom)) - Number(Boolean(b.unenrolledFrom)) ||
            a.displayName.localeCompare(b.displayName)
        )
        .map((s) => ({
          id: s.id,
          name: s.displayName,
          plan: s.planType,
          periodKeys: s.periodIds || [],
          muted: Boolean(s.unenrolledFrom),
          note: s.unenrolledFrom ? `Disenrolled ${formatDateMedium(s.unenrolledFrom)}` : '',
          accoms: doc.assignments
            .filter((a) => a.studentId === s.id && !a.activeTo)
            .map((a) => assignmentConfig(a, catalogById).label),
        })),
    [doc.students, doc.assignments, hits, catalogById]
  );

  const periodChoices = useMemo(
    () => periods.map((p) => ({ key: p.id, label: p.shortName, title: p.name })),
    [periods]
  );

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
      {/* Back, and its twin: while a route into the accommodation list is open,
          this leaves the route rather than the step. Same place, same weight,
          accent to say it is a different kind of going back. */}
      <div className="acc-sheet__footside">
        {step === 3 && mode !== null ? (
          <button
            type="button"
            className="acc-btn acc-btn--quiet acc-btn--accent"
            onClick={() => setMode(null)}
          >
            &lsaquo; Choose a different way
          </button>
        ) : (
          step > 0 && (
            <button
              type="button"
              className="acc-btn acc-btn--quiet"
              onClick={() => setStep(Math.max(0, step - 1))}
            >
              Back
            </button>
          )
        )}
      </div>

      <span className="acc-sheet__tip">{tips[step]}</span>

      <button
        type="button"
        className="acc-btn acc-btn--primary"
        onClick={goNext}
        disabled={nextDisabled}
      >
        {step === 4 ? (staged.length > 0 ? `Add ${staged.length} and finish` : 'Done') : 'Next'}
      </button>
    </>
  );

  return (
    <SceneFrame
      label="Edit a student"
      background={background}
      leaving={leaving}
      onClose={onClose}
      canClose={sheetCanClose}
      wide
      head={dots}
      footer={footer}
    >
      <div className="acc-sheet__view" key={done ? 'done' : step}>
        {done ? (
          <div className="acc-wiz__done">
            <span className="acc-wiz__tick" aria-hidden="true">
              ✓
            </span>
            <h1 className="acc-sheet__title acc-wiz__title--done">Updated {done.name}</h1>
            <p className="acc-sheet__sub acc-sheet__sub--balance">
              {done.added > 0
                ? `${done.added} accommodation${done.added === 1 ? '' : 's'} added from ${formatDateMedium(dateKey)}. Everything before today is exactly as it was.`
                : 'Their profile is saved. Everything already recorded is exactly as it was.'}
            </p>
            {/* Done first, and the other one under it: they are not a pair of
                equal choices, and side by side they read as one. */}
            <div className="acc-wiz__doneactions">
              <button type="button" className="acc-btn acc-btn--primary" onClick={onClose}>
                Done
              </button>
              <button
                type="button"
                className="acc-btn acc-btn--quiet"
                onClick={() => {
                  setDone(null);
                  setSelectedId(null);
                  setStep(0);
                  setQuery('');
                  setMode(null);
                  setPaste('');
                  setPicked([]);
                  setOpenSet(null);
                }}
              >
                Edit someone else
              </button>
            </div>
          </div>
        ) : step === 0 ? (
          <div className="acc-sheet__pane">
            <div className="acc-sheet__intro acc-sheet__intro--center">
              <h1 className="acc-sheet__title">Who are you editing?</h1>
              {/* Two clauses, balanced onto two even lines rather than a long
                  one and an orphan. See `--balance`. */}
              <p className="acc-sheet__sub acc-sheet__sub--balance">
                Search by name, or pick from the list. What follows is the same four screens you
                added them with.
              </p>
            </div>

            <div className="acc-wiz__field">
              <input
                className="acc-wiz__nameinput acc-wiz__find-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a student…"
                aria-label="Find a student"
                autoFocus
              />
            </div>

            {/*
              The SAME rows the add flow shows, not a two-column directory.

              This used to be its own shape - names split into plan columns with
              a period code beside each - which meant the screen a teacher uses
              to change a student looked nothing like the one they used to
              create them, and nothing on it could be changed in place. It is
              the roster list now: rename on the row, toggle a period on the
              row, and Choose supports to open their accommodations.
            */}
            <div className="acc-wiz__findwrap">
              <div
                className="acc-wiz__find"
                ref={listScroll.scrollRef}
                onScroll={listScroll.onScroll}
              >
                {/* Said out loud, because nothing lighting up is easy to read
                    as the search being broken. */}
                {hits && hits.size === 0 && (
                  <p className="acc-wiz__found-none">Nothing matches “{query.trim()}”.</p>
                )}

                <RosterList
                  students={found}
                  periods={periodChoices}
                  onTogglePeriod={(id, key) => {
                    setSelectedId(id);
                    const s = doc.students.find((x) => x.id === id);
                    const current = s?.periodIds || [];
                    write((d) =>
                      setStudentPeriods(
                        d,
                        id,
                        current.includes(key) ? current.filter((x) => x !== key) : [...current, key]
                      )
                    );
                  }}
                  onRename={(id, value) => {
                    setSelectedId(id);
                    write((d) => renameStudent(d, id, value));
                  }}
                  onEdit={(id) => {
                    setSelectedId(id);
                    // The button says supports, so it opens supports.
                    setStep(3);
                  }}
                />

                {doc.students.length === 0 && (
                  <p className="acc-wiz__found-none">Nobody on the roster yet.</p>
                )}
              </div>

              {listScroll.bar.height > 0 && (
                <div
                  className={`acc-scrollbar${listScroll.bar.visible ? ' acc-scrollbar--visible' : ''}`}
                  style={{
                    top: `${listScroll.bar.trackTop}px`,
                    height: `${listScroll.bar.trackHeight}px`,
                  }}
                  aria-hidden="true"
                >
                  <div
                    className="acc-scrollbar__thumb"
                    style={{ top: `${listScroll.bar.top}px`, height: `${listScroll.bar.height}px` }}
                    onPointerDown={listScroll.onThumbPointerDown}
                  />
                </div>
              )}
            </div>
          </div>
        ) : !student ? (
          <div className="acc-sheet__pane">
            <div className="acc-sheet__intro">
              <h1 className="acc-sheet__title">Pick a student first</h1>
              <p className="acc-sheet__sub">Go back a step and choose who you are editing.</p>
            </div>
          </div>
        ) : step === 1 ? (
          <div className="acc-sheet__pane">
            <div className="acc-sheet__intro">
              <h1 className="acc-sheet__title">What should this student be called?</h1>
              <p className="acc-sheet__sub">
                The name and the plan on their lane, their reports and every printed header. Their
                record is keyed by neither, so changing either is safe.
              </p>
            </div>

            <div className="acc-wiz__field">
              <div className="acc-wiz__namegroup">
                <input
                  className="acc-wiz__nameinput"
                  value={student.displayName}
                  onChange={(e) => write((d) => renameStudent(d, student.id, e.target.value))}
                  placeholder="J. Alvarez, or JA, or Student 4"
                  aria-label="Student name"
                  disabled={readOnly}
                  autoFocus
                />
                <PlanChooser
                  value={plan}
                  disabled={readOnly}
                  onChange={(next) => write((d) => setStudentPlan(d, student.id, next))}
                  onOpenChange={notePlanOpen}
                />
              </div>
              <span className="acc-wiz__hint">
                Saved as you type. The plan type prints on the report header, so it is worth being
                right about.
              </span>
            </div>
          </div>
        ) : step === 2 ? (
          <div className="acc-sheet__pane acc-sheet__pane--wide">
            <div className="acc-sheet__intro acc-sheet__intro--center">
              <h1 className="acc-sheet__title">Class details</h1>
              <p className="acc-sheet__sub">
                Which of your classes they sit in, and where their enrolment stands.
              </p>
            </div>

            <div className="acc-wiz__split">
              <div className="acc-wiz__cell acc-wiz__cell--end">
                <span className="acc-wiz__label">Which periods?</span>
                <div className="acc-wiz__chips acc-wiz__chips--end">
                  {periods.map((p) => {
                    const on = periodIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`acc-chip acc-chip--lg${on ? ' acc-chip--on' : ''}`}
                        onClick={() =>
                          write((d) =>
                            setStudentPeriods(
                              d,
                              student.id,
                              on ? periodIds.filter((x) => x !== p.id) : [...periodIds, p.id]
                            )
                          )
                        }
                        aria-pressed={on}
                        disabled={readOnly}
                        title={p.name}
                      >
                        {p.shortName}
                      </button>
                    );
                  })}

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
                      disabled={readOnly}
                    >
                      +
                    </button>
                  )}
                </div>
                <span className="acc-wiz__hint">
                  Undated, so fixing one is a correction: no day record moves.
                </span>
              </div>

              <span className="acc-wiz__rule" aria-hidden="true" />

              <div className="acc-wiz__cell">
                {/*
                  "Enrolled date", not the add step's "Newly enrolled?". That
                  question is asked of someone being typed in for the first
                  time; this is a student who has been on the board for months,
                  and the honest label for the field is what it holds.
                */}
                <span className="acc-wiz__label">Enrolled date</span>
                {/*
                  The same field the add-student step carries, on the same
                  student. Setting it late is the correction it exists for: a
                  student typed in during onboarding with the rest of the roster
                  had no way to say they actually joined in November.

                  It reaches backwards, which is the point - `effectiveStatus`
                  reads every day before it as "not applicable - enrolled X" -
                  and it deletes nothing: move the date back and those days
                  return with whatever they already held.
                */}
                {/*
                  Filled, not blank. A student with no date of their own has
                  been here since the year opened, and the field showing empty
                  read as missing information rather than as that answer - so it
                  falls back to the term's own start, which is the same fact
                  written out.
                */}
                {/*
                  Unbounded, like the add step's. Pinned between the record's
                  own start and today, it could not be moved at all on a file
                  set up this morning, and "the record began today" is a fact
                  about the file rather than about the student.
                */}
                <DateField
                  value={student.enrolledFrom || recordStart}
                  onChange={(next) => write((d) => setStudentEnrolledFrom(d, student.id, next))}
                  placeholder={sinceTermLabel(doc.schoolCalendar?.termStart)}
                  label="First day in this class"
                  disabled={readOnly}
                />
                <span className="acc-wiz__hint">
                  {student.enrolledFrom
                    ? `Every day before ${formatDateMedium(student.enrolledFrom)} reads “not applicable - enrolled ${formatDateMedium(student.enrolledFrom)}”, so nothing is recorded against them for a class they were not in yet.`
                    : 'The start of the year, so every day on the board is theirs. Set a later one if they joined partway through.'}
                </span>
              </div>
            </div>

            {/*
              Ending an enrolment is not one of the two things this step is
              about, and it sat in the right-hand column as though it were. It
              is the one irreversible-feeling action here, so it stands alone
              under both halves.
            */}
            <div className="acc-wiz__endrow">
              {student.unenrolledFrom ? (
                <button
                  type="button"
                  className="acc-btn"
                  disabled={readOnly}
                  onClick={() => write((d) => setStudentEnrollment(d, student.id, null))}
                >
                  Re-enroll {student.displayName}
                </button>
              ) : (
                <button
                  type="button"
                  className="acc-btn acc-btn--danger"
                  disabled={readOnly}
                  title="They stop appearing from tomorrow. Their record so far is kept in full."
                  onClick={() => setConfirming(addDays(today, 1))}
                >
                  Disenroll from tomorrow
                </button>
              )}
              {/* Only when there is something to report. The reassurance that
                  used to sit here said what the confirm dialog already says,
                  under a button nobody had pressed yet. */}
              {student.unenrolledFrom && (
                <span className="acc-wiz__hint">
                  Disenrolled from {formatDateMedium(student.unenrolledFrom)}.
                </span>
              )}
            </div>
          </div>
        ) : step === 3 ? (
          <div className="acc-sheet__pane acc-sheet__pane--wide">
            <div className="acc-sheet__intro">
              <h1 className="acc-sheet__title">What are they getting?</h1>
              <p className="acc-sheet__sub">
                What is on their board today, and anything you want to add. New ones start from{' '}
                {formatDateMedium(dateKey)}, so earlier days are untouched.
              </p>
            </div>

            <div className="acc-wiz__field">
              <span className="acc-wiz__label">
                {rows.length
                  ? `On their board${rows.some((r) => r.assignment.activeTo) ? ', and what ended' : ''}`
                  : 'Nothing on their board yet'}
              </span>
              <ul className="acc-wiz__current">
                {rows.map(({ assignment, cfg }) => {
                  const retired = Boolean(assignment.activeTo);
                  return (
                    <li
                      key={assignment.id}
                      className={`acc-wiz__row${retired ? ' acc-wiz__row--retired' : ''}`}
                    >
                      <span className="acc-wiz__row-label">
                        {cfg.label}
                        {cfg.requiresDetail && (
                          <span className="acc-wiz__row-tag">needs detail</span>
                        )}
                        {retired && (
                          <span className="acc-wiz__row-tag">
                            ends {formatDateMedium(assignment.activeTo)}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        className="acc-wiz__row-action"
                        disabled={readOnly}
                        title={
                          retired
                            ? `Put "${cfg.label}" back on ${student.displayName}'s board`
                            : `End "${cfg.label}" after today. Everything already recorded is kept.`
                        }
                        onClick={() =>
                          write((d) =>
                            retired
                              ? reinstateAssignment(d, assignment.id)
                              : retireAssignment(d, assignment.id, today)
                          )
                        }
                      >
                        {retired ? 'Put back' : 'End'}
                      </button>
                    </li>
                  );
                })}
              </ul>
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
              <h1 className="acc-sheet__title">{student.displayName}, after this</h1>
              <p className="acc-sheet__sub">
                Their name, plan and periods are already saved. The list below is what today forward
                will look like.
              </p>
            </div>

            <div className="acc-wiz__card">
              <div className="acc-wiz__cardhead">
                <span className="acc-wiz__disc" aria-hidden="true">
                  {initialsFor(student.displayName)}
                </span>
                <div className="acc-wiz__identity">
                  <div className="acc-wiz__nameline">
                    <span className="acc-wiz__cardname">{student.displayName}</span>
                    <span className={`acc-pill acc-pill--${planClass}`}>{plan}</span>
                  </div>
                  <span className="acc-wiz__meta">
                    {periodIds.length
                      ? periodIds
                          .map((id) => periodById.get(id)?.shortName)
                          .filter(Boolean)
                          .join(', ')
                      : 'No periods yet'}
                    {' · '}
                    {student.unenrolledFrom
                      ? `Disenrolled ${formatDateMedium(student.unenrolledFrom)}`
                      : student.enrolledFrom
                        ? `Enrolled ${formatDateMedium(student.enrolledFrom)}`
                        : 'Start of year'}
                  </span>
                </div>
                <div className="acc-wiz__edit">
                  <span className="acc-wiz__editlabel">Edit</span>
                  <button type="button" className="acc-wiz__editlink" onClick={() => setStep(1)}>
                    Name
                  </button>
                  <span className="acc-wiz__editdot" aria-hidden="true" />
                  <button type="button" className="acc-wiz__editlink" onClick={() => setStep(2)}>
                    Details
                  </button>
                </div>
              </div>

              <div className="acc-wiz__accoms">
                <div className="acc-wiz__accomhead">
                  <span className="acc-wiz__label">
                    {staged.length > 0
                      ? `${staged.length} being added`
                      : `${rows.filter((r) => !r.assignment.activeTo).length} on their board`}
                  </span>
                  <button
                    type="button"
                    className="acc-wiz__editlink acc-wiz__editlink--end"
                    onClick={() => setStep(3)}
                  >
                    Edit
                  </button>
                </div>

                <div className="acc-wiz__chips">
                  {rows
                    .filter((r) => !r.assignment.activeTo)
                    .map(({ assignment, cfg }) => (
                      <span key={assignment.id} className="acc-wiz__accom">
                        {cfg.label}
                      </span>
                    ))}
                  {staged.map((s) => (
                    <span key={s.label} className="acc-wiz__accom acc-wiz__accom--new">
                      {s.label}
                    </span>
                  ))}
                </div>

                {rows.length === 0 && staged.length === 0 && (
                  <span className="acc-wiz__empty">
                    None yet - add them any time from the board.
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {confirming && student && (
        <ConfirmDialog
          title={`Disenroll ${student.displayName}?`}
          body={`They will stop appearing on the board from ${formatDateMedium(
            confirming
          )} onward, and will not be included in reports covering days after that.`}
          reassurance="Every day already recorded keeps their information exactly as it is, and you can re-enroll them at any time if this was a mistake."
          confirmLabel="Disenroll"
          tone="danger"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            write((d) => setStudentEnrollment(d, student.id, confirming));
            setConfirming(null);
          }}
        />
      )}
    </SceneFrame>
  );
}
