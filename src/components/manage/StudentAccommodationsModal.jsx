import { useMemo, useState } from 'react';
import Modal from '../shared/Modal.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import AccommodationPicker from '../shared/AccommodationPicker.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useBoard } from '../../context/BoardContext.jsx';
import {
  setStudentEnrollment,
  retireAssignment,
  reinstateAssignment,
  renameAccommodation,
  setStudentPeriods,
  addPeriod,
} from '../../domain/mutations.js';
import { addAccommodationsToStudent } from '../../domain/importStudent.js';
import { ensureDay } from '../../domain/seed.js';
import { assignmentConfig } from '../../domain/schema.js';
import { normalizeSearch, studentSearchTerms } from '../../domain/selectors.js';
import { todayKey, formatDateMedium, addDays } from '../../domain/dates.js';
import { PencilIcon, ArchiveIcon, RestoreIcon } from '../shared/RowIcons.jsx';

// The same map the board uses, so a plan reads identically on both screens.
const PLAN_CLASS = { IEP: 'iep', 504: '504', Other: 'other' };

/**
 * Look a student up, then manage their accommodations and their enrolment.
 *
 * Nothing here hard-deletes. Removing an accommodation ends it from a date, and
 * unenroling a student ends them from a date - both keep every earlier day
 * exactly as recorded, because this file is a compliance history first and a
 * roster second.
 */
export default function StudentAccommodationsModal({ onClose, studentId = null }) {
  const { doc, mutate, readOnly } = useData();
  const { dateKey } = useBoard();

  const [query, setQuery] = useState('');
  // Seeded from the caller: right-clicking a lane opens this already on that
  // student, so the profile is one action away rather than a search away.
  const [selectedId, setSelectedId] = useState(studentId);
  const [draft, setDraft] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameText, setRenameText] = useState('');
  const [confirming, setConfirming] = useState(null);
  const [addingPeriod, setAddingPeriod] = useState(false);
  const [newPeriod, setNewPeriod] = useState('');

  const today = todayKey();

  const matches = useMemo(() => {
    const q = normalizeSearch(query);
    return doc.students
      .filter((s) => !q || studentSearchTerms(s).some((t) => t.includes(q)))
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [doc.students, query]);

  const student = doc.students.find((s) => s.id === selectedId) || null;
  const catalogById = useMemo(() => new Map(doc.catalog.map((c) => [c.id, c])), [doc.catalog]);
  const periodById = useMemo(() => new Map(doc.periods.map((p) => [p.id, p])), [doc.periods]);

  const rows = useMemo(() => {
    if (!student) return [];
    return doc.assignments
      .filter((a) => a.studentId === student.id)
      .map((a) => ({ assignment: a, cfg: assignmentConfig(a, catalogById) }))
      .sort((x, y) => x.assignment.sortOrder - y.assignment.sortOrder);
  }, [doc.assignments, student, catalogById]);

  const add = (items) => {
    if (!student || items.length === 0) return;
    mutate((d) => {
      const { doc: next } = addAccommodationsToStudent(d, student.id, items, {
        effectiveFrom: dateKey,
      });
      return ensureDay(next, dateKey);
    });
    setDraft('');
  };

  const unenrolled = Boolean(student?.unenrolledFrom);

  return (
    <Modal
      wide
      title="Student accommodations"
      subtitle="Add, rename or retire accommodations, or unenrol a student without losing their record."
      onClose={onClose}
    >
      <div className="acc-stumod">
        <aside className="acc-stumod__list">
          <input
            className="acc-stumod__search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a student…"
            aria-label="Find a student"
            autoFocus
          />
          <ul>
            {matches.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`acc-stumod__student${s.id === selectedId ? ' acc-stumod__student--on' : ''}`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <span className="acc-stumod__student-text">
                    <span className="acc-stumod__student-name">{s.displayName}</span>
                    <span className={`acc-pill acc-pill--${PLAN_CLASS[s.planType] || 'other'}`}>
                      {s.planType}
                    </span>
                    {s.unenrolledFrom && (
                      <span className="acc-stumod__student-meta">unenrolled</span>
                    )}
                  </span>
                  {/* Which classes, on the right of the row. Scanning "who is
                      in P3" should not mean opening every student in turn. */}
                  <span className="acc-stumod__student-periods">
                    {(s.periodIds || [])
                      .map((id) => periodById.get(id)?.shortName)
                      .filter(Boolean)
                      .join(' ')}
                  </span>
                </button>
              </li>
            ))}
            {matches.length === 0 && <li className="acc-stumod__none">No students match.</li>}
          </ul>
        </aside>

        <section className="acc-stumod__detail">
          {!student ? (
            <p className="acc-stumod__placeholder">Pick a student to see their accommodations.</p>
          ) : (
            <>
              <header className="acc-stumod__head">
                <div className="acc-stumod__ident">
                  {/* Name and plan on one line, the plan as the same coloured
                      pill the board uses. It was grey text on the line below,
                      which made the same fact look like two different things
                      depending on which screen you were on. */}
                  <h3 className="acc-stumod__title">
                    {student.displayName}
                    <span
                      className={`acc-pill acc-pill--${PLAN_CLASS[student.planType] || 'other'}`}
                    >
                      {student.planType}
                    </span>
                  </h3>
                  {student.sasid && <p className="acc-stumod__sub">SASID {student.sasid}</p>}
                </div>

                {/*
                  Which of this teacher's classes they are in, beside the name
                  rather than under it. It belongs to the student the way the
                  plan type does - it is who they are on this roster, not a
                  section of their record - and stacking it above the
                  accommodations pushed the list they came here for down the
                  page behind something they will set once a year.

                  This is the only place it can be answered. Onboarding puts
                  everyone in every period the teacher named, since the roster
                  is being typed before anyone knows the timetable, and nothing
                  downstream ever asked again.

                  Undated, unlike enrolment below: a period says which room a
                  student sits in, not a claim about a particular day, so fixing
                  it is a correction and leaves every day record alone.
                */}
                <div className="acc-stumod__periods">
                  <span className="acc-stumod__periods-label">Periods</span>
                  <div className="acc-stumod__periods-set">
                    {doc.periods.map((p) => {
                      const on = (student.periodIds || []).includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className={`acc-chip${on ? ' acc-chip--on' : ''}`}
                          disabled={readOnly}
                          aria-pressed={on}
                          title={
                            on
                              ? `In ${p.name}. Click to take them out.`
                              : `Not in ${p.name}. Click to put them in.`
                          }
                          onClick={() =>
                            mutate((d) =>
                              setStudentPeriods(
                                d,
                                student.id,
                                on
                                  ? (student.periodIds || []).filter((id) => id !== p.id)
                                  : [...(student.periodIds || []), p.id]
                              )
                            )
                          }
                        >
                          {p.shortName}
                        </button>
                      );
                    })}

                    {/*
                      A class that does not exist yet. Timetables get rebuilt
                      mid-year and a student can be moved into a period the
                      teacher has never had to name here before; without this
                      they would have to go and create it somewhere else first,
                      then come back.
                    */}
                    {addingPeriod ? (
                      <form
                        className="acc-stumod__newperiod"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const label = newPeriod.trim();
                          if (!label) return;
                          mutate((d) => {
                            const withPeriod = addPeriod(d, { name: label });
                            const created = withPeriod.periods[withPeriod.periods.length - 1];
                            return setStudentPeriods(withPeriod, student.id, [
                              ...(student.periodIds || []),
                              created.id,
                            ]);
                          });
                          setNewPeriod('');
                          setAddingPeriod(false);
                        }}
                      >
                        <input
                          className="acc-stumod__newperiod-input"
                          value={newPeriod}
                          onChange={(e) => setNewPeriod(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setNewPeriod('');
                              setAddingPeriod(false);
                            }
                          }}
                          placeholder="Period 4"
                          aria-label="Name the new period"
                          autoFocus
                        />
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="acc-chip acc-chip--add"
                        disabled={readOnly}
                        title="Put them in a period you have not set up yet"
                        aria-label="Add a period"
                        onClick={() => setAddingPeriod(true)}
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>
              </header>

              {unenrolled && (
                <p className="acc-stumod__banner">
                  Unenrolled from {formatDateMedium(student.unenrolledFrom)}. They no longer appear
                  on days from that date, and everything before it is untouched.
                </p>
              )}

              <ul className="acc-stumod__accs">
                {rows.map(({ assignment, cfg }) => {
                  const retired = Boolean(assignment.activeTo);
                  return (
                    <li
                      key={assignment.id}
                      className={`acc-stumod__acc${retired ? ' acc-stumod__acc--retired' : ''}`}
                    >
                      {renamingId === assignment.id ? (
                        <form
                          className="acc-stumod__rename"
                          onSubmit={(e) => {
                            e.preventDefault();
                            mutate((d) => renameAccommodation(d, assignment.id, renameText));
                            setRenamingId(null);
                          }}
                        >
                          <div className="acc-inputgroup">
                            <input
                              className="acc-inputgroup__input"
                              value={renameText}
                              onChange={(e) => setRenameText(e.target.value)}
                              onKeyDown={(e) => e.key === 'Escape' && setRenamingId(null)}
                              aria-label="New name"
                              autoFocus
                            />
                            <button
                              type="submit"
                              className="acc-inputgroup__action"
                              disabled={!renameText.trim()}
                            >
                              Save
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <span className="acc-stumod__acc-label">
                            {cfg.label}
                            {assignment.source === 'custom' && (
                              <span className="acc-stumod__tag">one-off</span>
                            )}
                            {cfg.requiresDetail && (
                              <span className="acc-stumod__tag">needs detail</span>
                            )}
                          </span>

                          {retired && (
                            <span className="acc-stumod__retired">
                              ends {formatDateMedium(assignment.activeTo)}
                            </span>
                          )}

                          {/*
                            The same icons and the same tooltips the presets
                            list uses, so two screens showing the same kind of
                            row do not read as two different products.
                          */}
                          <span className="acc-stumod__acc-actions">
                            <button
                              type="button"
                              className="acc-iconbtn"
                              disabled={readOnly}
                              title={`Rename "${cfg.label}" for ${student.displayName}`}
                              aria-label={`Rename ${cfg.label}`}
                              onClick={() => {
                                setRenameText(cfg.label);
                                setRenamingId(assignment.id);
                              }}
                            >
                              <PencilIcon />
                            </button>
                            {retired ? (
                              <button
                                type="button"
                                className="acc-iconbtn"
                                disabled={readOnly}
                                title={`Put "${cfg.label}" back on ${student.displayName}'s board`}
                                aria-label={`Reinstate ${cfg.label}`}
                                onClick={() => mutate((d) => reinstateAssignment(d, assignment.id))}
                              >
                                <RestoreIcon />
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="acc-iconbtn"
                                disabled={readOnly}
                                title={`Remove "${cfg.label}" from tomorrow. Everything already recorded is kept.`}
                                aria-label={`Remove ${cfg.label}`}
                                onClick={() =>
                                  mutate((d) => retireAssignment(d, assignment.id, today))
                                }
                              >
                                <ArchiveIcon />
                              </button>
                            )}
                          </span>
                        </>
                      )}
                    </li>
                  );
                })}
                {rows.length === 0 && <li className="acc-stumod__none">No accommodations yet.</li>}
              </ul>

              <div className="acc-stumod__add">
                <span className="acc-field__label">Add accommodations</span>
                <AccommodationPicker
                  studentId={student.id}
                  value={draft}
                  onChange={setDraft}
                  onCommit={add}
                  disabled={readOnly}
                  placeholder="Find one, or paste several"
                  hint={`Records from ${formatDateMedium(dateKey)} forward - earlier days are untouched.`}
                />
              </div>

              <footer className="acc-stumod__foot">
                {unenrolled ? (
                  <button
                    type="button"
                    className="acc-btn acc-btn--small"
                    disabled={readOnly}
                    onClick={() => mutate((d) => setStudentEnrollment(d, student.id, null))}
                  >
                    Re-enrol {student.displayName}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="acc-btn acc-btn--small acc-btn--danger"
                    disabled={readOnly}
                    title="They stop appearing from tomorrow. Their record so far is kept in full."
                    onClick={() => setConfirming(addDays(today, 1))}
                  >
                    Unenrol from tomorrow
                  </button>
                )}
                <span className="acc-stumod__foot-hint">
                  Nothing here deletes history - both actions are dated, so past days keep every
                  record exactly as it was.
                </span>
              </footer>
            </>
          )}
        </section>
      </div>

      {confirming && student && (
        <ConfirmDialog
          title={`Unenrol ${student.displayName}?`}
          body={`They will stop appearing on the board from ${formatDateMedium(
            confirming
          )} onward, and will not be included in reports covering days after that.`}
          reassurance="Every day already recorded keeps their information exactly as it is, and you can re-enrol them at any time if this was a mistake."
          confirmLabel="Unenrol"
          tone="danger"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            mutate((d) => setStudentEnrollment(d, student.id, confirming));
            setConfirming(null);
          }}
        />
      )}
    </Modal>
  );
}
