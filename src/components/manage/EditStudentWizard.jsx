import { useCallback, useMemo, useRef, useState } from 'react';
import SceneFrame from '../shared/SceneFrame.jsx';
import Caret from '../shared/Caret.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import AccommodationChooser from './AccommodationChooser.jsx';
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
  retireAssignment,
  reinstateAssignment,
} from '../../domain/mutations.js';
import { itemsForSet } from '../../domain/starterSets.js';
import { PLAN_TYPES } from '../../domain/constants.js';
import { periodOptions, normalizeSearch, studentSearchTerms } from '../../domain/selectors.js';
import { assignmentConfig } from '../../domain/schema.js';
import { ensureDay } from '../../domain/seed.js';
import { formatDateMedium, todayKey, addDays } from '../../domain/dates.js';

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

const PLAN_CLASS = { IEP: 'iep', 504: '504', Other: 'other' };
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

  const [planOpen, setPlanOpen] = useState(false);
  const closePlan = useCallback(() => setPlanOpen(false), []);
  const planRef = usePopoverDismiss(planOpen, closePlan);
  const planOpenRef = useRef(false);
  planOpenRef.current = planOpen;
  const sheetCanClose = useCallback(() => !planOpenRef.current, []);

  const student = doc.students.find((s) => s.id === selectedId) || null;
  const plan = student?.planType || 'IEP';
  const planClass = PLAN_CLASS[plan] || 'other';
  const periodIds = student?.periodIds || [];

  const matches = useMemo(() => {
    const q = normalizeSearch(query);
    return doc.students
      .filter((s) => !q || studentSearchTerms(s).some((t) => t.includes(q)))
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
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
   * Sorted by the name on the row, which is what an eye runs down.
   */
  const groups = useMemo(() => {
    const by = { IEP: [], 504: [], Other: [] };
    for (const s of matches) (by[s.planType] || by.Other).push(s);
    return ['IEP', '504', 'Other']
      .map((plan) => ({
        plan,
        students: by[plan].slice().sort((a, b) => a.displayName.localeCompare(b.displayName)),
      }))
      .filter((g) => g.students.length > 0);
  }, [matches]);

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

  // The two-up half of the roster, and the group that runs underneath it.
  const sideGroups = groups.filter((g) => g.plan !== 'Other');
  const otherGroup = groups.find((g) => g.plan === 'Other');

  /**
   * One plan's column.
   *
   * `end` right-aligns the heading against the rule, with the count inside the
   * pill rather than trailing it - the two headings then face each other across
   * the middle instead of both running away from it.
   *
   * A group alone on its row takes the full width and lays out four across.
   */
  const renderGroup = (g, end) => {
    const plan = PLAN_CLASS[g.plan] || 'other';
    const wide = g.plan === 'Other' || sideGroups.length === 1;
    return (
      <section
        key={g.plan}
        className={`acc-wiz__group acc-wiz__group--${plan}${wide ? ' acc-wiz__group--wide' : ''}${
          end ? ' acc-wiz__group--end' : ''
        }`}
        aria-label={`${g.plan} students`}
      >
        <p className="acc-wiz__group-head">
          <span className={`acc-pill acc-pill--${plan}`}>{g.plan}</span>
          <span className="acc-wiz__group-count acc-numeric">{g.students.length}</span>
        </p>

        <ul className="acc-wiz__group-list">
          {g.students.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={`acc-wiz__found${s.id === selectedId ? ' acc-wiz__found--on' : ''}`}
                onClick={() => {
                  setSelectedId(s.id);
                  setStep(1);
                }}
              >
                {/* No plan pill on the row: the heading above the column
                    already says it, and repeating it on every line spends a
                    third of a narrow column saying the same word twenty
                    times. The row's own hover carries the plan's colour
                    instead, so the heading reads as the key to the column. */}
                <span className="acc-wiz__found-name">{s.displayName}</span>
                {s.unenrolledFrom && <span className="acc-wiz__found-meta">disenrolled</span>}
                <span className="acc-wiz__found-periods">
                  {(s.periodIds || [])
                    .map((id) => periodById.get(id)?.shortName)
                    .filter(Boolean)
                    .join(' ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  };

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
      <div className="acc-sheet__footside">
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
            <p className="acc-sheet__sub">
              {done.added > 0
                ? `${done.added} accommodation${done.added === 1 ? '' : 's'} added from ${formatDateMedium(dateKey)}. Everything before today is exactly as it was.`
                : 'Their profile is saved. Everything already recorded is exactly as it was.'}
            </p>
            <div className="acc-wiz__doneactions">
              <button
                type="button"
                className="acc-btn"
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
              <button type="button" className="acc-btn acc-btn--primary" onClick={onClose}>
                Done
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
              The board's floating scrollbar, on the roster. The native bar cut
              a full-height grey rule down the inside edge of the list, over the
              period column it was measuring; this one is the app's own - short,
              lavender, outside the list, and only there while you are moving.
            */}
            <div className="acc-wiz__findwrap">
              <div
                className="acc-wiz__find"
                ref={listScroll.scrollRef}
                onScroll={listScroll.onScroll}
              >
                {sideGroups[0] && renderGroup(sideGroups[0], sideGroups.length === 2)}
                {/*
                  The same gradient rule the class-details step puts between its
                  two halves, so a split down the middle looks the same wherever
                  the app makes one.
                */}
                {sideGroups.length === 2 && <span className="acc-wiz__rule" aria-hidden="true" />}
                {sideGroups[1] && renderGroup(sideGroups[1], false)}
                {otherGroup && renderGroup(otherGroup, false)}

                {matches.length === 0 && <p className="acc-wiz__found-none">No students match.</p>}
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
                <span className={`acc-wiz__planwrap acc-wiz__planwrap--${planClass}`} ref={planRef}>
                  <button
                    type="button"
                    className="acc-wiz__plan"
                    onClick={() => setPlanOpen((o) => !o)}
                    aria-haspopup="menu"
                    aria-expanded={planOpen}
                    aria-label={`Plan type: ${plan}`}
                    title="Plan type"
                    disabled={readOnly}
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
                            write((d) => setStudentPlan(d, student.id, p));
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
                <span className="acc-wiz__label">Enrolment</span>
                {/*
                  Stated, not editable. Moving the start date backwards or
                  forwards changes which days read "not applicable", and days
                  already recorded would disappear behind a derived status - a
                  correction worth having, but not one to make with a date field
                  and no warning. Ending their enrolment is the decision this
                  screen offers.
                */}
                <p className="acc-wiz__enrol">
                  {student.unenrolledFrom
                    ? `Disenrolled from ${formatDateMedium(student.unenrolledFrom)}.`
                    : student.enrolledFrom
                      ? `In this class from ${formatDateMedium(student.enrolledFrom)}.`
                      : 'In this class since the start of the year.'}
                </p>
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
                <span className="acc-wiz__hint">
                  Dated, never deleted - every day already recorded keeps their record exactly as it
                  is.
                </span>
              </div>
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
