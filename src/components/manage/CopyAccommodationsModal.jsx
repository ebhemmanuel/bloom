import { useMemo, useState } from 'react';
import Modal from '../shared/Modal.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useBoard } from '../../context/BoardContext.jsx';
import { copyAccommodationsBetweenStudents } from '../../domain/importStudent.js';
import { ensureDay } from '../../domain/seed.js';
import { assignmentConfig } from '../../domain/schema.js';
import { formatDateMedium } from '../../domain/dates.js';

/**
 * Use one student as a template for others.
 *
 * The realistic workflow: set one student up the way a plan type usually looks,
 * then apply that shape across a group and adjust the individuals afterwards.
 *
 * Copying only ADDS. It never removes what a target already has, and it skips
 * anything they already have — so running it twice changes nothing, and a
 * mis-click cannot wipe out a student's existing plan.
 */
export default function CopyAccommodationsModal({ onClose }) {
  const { doc, mutate, readOnly } = useData();
  const { dateKey } = useBoard();

  const [sourceId, setSourceId] = useState(null);
  const [targetIds, setTargetIds] = useState([]);
  const [result, setResult] = useState(null);

  const catalogById = useMemo(() => new Map(doc.catalog.map((c) => [c.id, c])), [doc.catalog]);
  const roster = useMemo(
    () => doc.students.filter((s) => s.active && !s.archivedAt),
    [doc.students]
  );

  const sourceRows = useMemo(() => {
    if (!sourceId) return [];
    return doc.assignments
      .filter((a) => a.studentId === sourceId && !a.activeTo)
      .map((a) => assignmentConfig(a, catalogById).label);
  }, [doc.assignments, sourceId, catalogById]);

  const toggleTarget = (id) =>
    setTargetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const apply = () => {
    let outcome = null;
    mutate((d) => {
      const res = copyAccommodationsBetweenStudents(d, sourceId, targetIds, {
        effectiveFrom: dateKey,
      });
      outcome = res.report;
      // Seed the day so the new cards appear now rather than tomorrow.
      return ensureDay(res.doc, dateKey);
    });
    setResult(outcome);
    setTargetIds([]);
  };

  const source = roster.find((s) => s.id === sourceId);

  return (
    <Modal
      wide
      title="Copy accommodations"
      subtitle="Use one student as a template for others. Copying only adds — nothing is removed or overwritten."
      onClose={onClose}
    >
      <div className="acc-copymod">
        <section className="acc-copymod__col">
          <p className="acc-field__label">Copy from</p>
          <ul className="acc-copymod__list">
            {roster.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`acc-copymod__pick${s.id === sourceId ? ' acc-copymod__pick--on' : ''}`}
                  onClick={() => {
                    setSourceId(s.id);
                    setTargetIds((prev) => prev.filter((x) => x !== s.id));
                    setResult(null);
                  }}
                >
                  {s.displayName}
                  <span className="acc-copymod__meta">{s.planType}</span>
                </button>
              </li>
            ))}
          </ul>

          {source && (
            <div className="acc-copymod__preview">
              <p className="acc-copymod__preview-title">
                {sourceRows.length} accommodation{sourceRows.length === 1 ? '' : 's'} will be copied
              </p>
              <ul>
                {sourceRows.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="acc-copymod__col">
          <p className="acc-field__label">Copy to</p>
          <ul className="acc-copymod__list">
            {roster
              .filter((s) => s.id !== sourceId)
              .map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`acc-copymod__pick${targetIds.includes(s.id) ? ' acc-copymod__pick--on' : ''}`}
                    onClick={() => toggleTarget(s.id)}
                    aria-pressed={targetIds.includes(s.id)}
                    disabled={!sourceId}
                  >
                    <span className="acc-copymod__check">
                      {targetIds.includes(s.id) ? '✓' : ''}
                    </span>
                    {s.displayName}
                    <span className="acc-copymod__meta">{s.planType}</span>
                  </button>
                </li>
              ))}
          </ul>

          <div className="acc-copymod__all">
            <button
              type="button"
              className="acc-btn acc-btn--small acc-btn--quiet"
              disabled={!sourceId}
              onClick={() => setTargetIds(roster.filter((s) => s.id !== sourceId).map((s) => s.id))}
            >
              Select all
            </button>
            <button
              type="button"
              className="acc-btn acc-btn--small acc-btn--quiet"
              disabled={targetIds.length === 0}
              onClick={() => setTargetIds([])}
            >
              Clear
            </button>
          </div>
        </section>

        <footer className="acc-copymod__foot">
          <span className="acc-copymod__hint">
            Added from {formatDateMedium(dateKey)} forward. Anything a student already has is
            skipped, so this is safe to run twice.
          </span>
          <div className="acc-copymod__actions">
            <button type="button" className="acc-btn acc-btn--quiet" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="acc-btn acc-btn--primary"
              onClick={apply}
              disabled={readOnly || !sourceId || targetIds.length === 0 || sourceRows.length === 0}
            >
              Copy to {targetIds.length} student{targetIds.length === 1 ? '' : 's'}
            </button>
          </div>
        </footer>

        {result && (
          <p className="acc-copymod__result acc-fade-enter" role="status">
            Added {result.added} accommodation{result.added === 1 ? '' : 's'} across{' '}
            {result.students} student{result.students === 1 ? '' : 's'}
            {result.skipped > 0 && ` · ${result.skipped} already present, skipped`}.
          </p>
        )}
      </div>
    </Modal>
  );
}
