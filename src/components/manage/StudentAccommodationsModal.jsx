import { useMemo, useState } from 'react';
import Modal from '../shared/Modal.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useBoard } from '../../context/BoardContext.jsx';
import {
  setStudentEnrollment,
  retireAssignment,
  reinstateAssignment,
  renameAccommodation,
} from '../../domain/mutations.js';
import {
  addAccommodationsToStudent,
  splitAccommodationList,
  suggestAccommodations,
} from '../../domain/importStudent.js';
import { ensureDay } from '../../domain/seed.js';
import { assignmentConfig } from '../../domain/schema.js';
import { normalizeSearch, studentSearchTerms } from '../../domain/selectors.js';
import { todayKey, formatDateMedium, addDays } from '../../domain/dates.js';
import { PencilIcon, ArchiveIcon, RestoreIcon } from '../shared/RowIcons.jsx';

/**
 * Look a student up, then manage their accommodations and their enrolment.
 *
 * Nothing here hard-deletes. Removing an accommodation ends it from a date, and
 * unenroling a student ends them from a date - both keep every earlier day
 * exactly as recorded, because this file is a compliance history first and a
 * roster second.
 */
export default function StudentAccommodationsModal({ onClose }) {
  const { doc, mutate, readOnly } = useData();
  const { dateKey } = useBoard();

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameText, setRenameText] = useState('');
  const [confirming, setConfirming] = useState(null);

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

  const rows = useMemo(() => {
    if (!student) return [];
    return doc.assignments
      .filter((a) => a.studentId === student.id)
      .map((a) => ({ assignment: a, cfg: assignmentConfig(a, catalogById) }))
      .sort((x, y) => x.assignment.sortOrder - y.assignment.sortOrder);
  }, [doc.assignments, student, catalogById]);

  const suggestions = useMemo(
    () => (student ? suggestAccommodations(doc, student.id, draft) : []),
    [doc, student, draft]
  );
  const parsed = useMemo(() => splitAccommodationList(draft), [draft]);

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
            className="acc-field__input"
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
                  <span className="acc-stumod__student-name">{s.displayName}</span>
                  <span className="acc-stumod__student-meta">
                    {s.planType}
                    {s.unenrolledFrom ? ' · unenrolled' : ''}
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
                <div>
                  <h3 className="acc-stumod__title">{student.displayName}</h3>
                  <p className="acc-stumod__sub">
                    {student.planType}
                    {student.sasid ? ` · SASID ${student.sasid}` : ''}
                  </p>
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
                <label className="acc-field">
                  <span className="acc-field__label">Add accommodations</span>
                  <input
                    className="acc-field__input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        add(parsed);
                      }
                    }}
                    placeholder="Type one, or paste several"
                    disabled={readOnly}
                  />
                  <span className="acc-field__hint">
                    Records from {formatDateMedium(dateKey)} forward - earlier days are untouched.
                  </span>
                </label>

                {suggestions.length > 0 && parsed.length <= 1 && (
                  <ul className="acc-stumod__suggest">
                    {suggestions.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() =>
                            add([
                              {
                                label: s.label,
                                category: s.category,
                                requiresDetail: s.requiresDetail,
                              },
                            ])
                          }
                        >
                          {s.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {parsed.length > 0 && (
                  <button
                    type="button"
                    className="acc-btn acc-btn--primary acc-btn--small"
                    onClick={() => add(parsed)}
                    disabled={readOnly}
                  >
                    {parsed.length > 1 ? `Add all ${parsed.length}` : 'Add'}
                  </button>
                )}
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
                    className="acc-btn acc-btn--small acc-btn--quiet"
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
          tone="warn"
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
