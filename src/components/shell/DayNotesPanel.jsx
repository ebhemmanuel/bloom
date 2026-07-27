import { useEffect, useRef, useState } from 'react';
import { useData } from '../../context/DataContext.jsx';
import { useBoard } from '../../context/BoardContext.jsx';
import { usePopoverDismiss } from './AppHeader.jsx';
import { setDayNotes, reportTeacherAbsence, clearTeacherAbsence } from '../../domain/mutations.js';
import { TEACHER_ABSENCE_REASONS } from '../../domain/constants.js';
import { formatDateMedium } from '../../domain/dates.js';

/**
 * Whole-day notes, plus the report-an-absence flow.
 *
 * Distinct from the per-student notes in each lane: this is handoff context for a
 * substitute or for tomorrow-you, and it prints on the daily report so a sparse
 * day carries its own explanation.
 */
export default function DayNotesPanel({ onClose }) {
  const { mutate, readOnly } = useData();
  const { dateKey, model } = useBoard();

  const [draft, setDraft] = useState(model.dayNotes || '');
  const [saved, setSaved] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState(TEACHER_ABSENCE_REASONS[0].label);
  const [detail, setDetail] = useState('');
  const timer = useRef(null);
  const latest = useRef(model.dayNotes || '');

  const ref = usePopoverDismiss(true, onClose);
  const absence = model.teacherAbsence;
  const locked = readOnly || model.sealed;

  // Adopt external changes (an absence line appended, a date switch) without
  // clobbering what is being typed.
  useEffect(() => {
    if (model.dayNotes !== latest.current) {
      latest.current = model.dayNotes;
      setDraft(model.dayNotes);
    }
  }, [model.dayNotes]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onNotesChange = (event) => {
    const next = event.target.value;
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      latest.current = next;
      mutate((d) => setDayNotes(d, dateKey, next));
      setSaved(true);
      setTimeout(() => setSaved(false), 1400);
    }, 500);
  };

  const submitAbsence = () => {
    mutate((d) => reportTeacherAbsence(d, dateKey, reason, detail));
    setReporting(false);
    setDetail('');
  };

  return (
    <div
      className="acc-popover acc-popover--notes acc-enter"
      ref={ref}
      role="dialog"
      aria-label="Day notes"
    >
      <header className="acc-popover__header">
        <span className="acc-subhead">Day notes · {formatDateMedium(dateKey)}</span>
        <button type="button" className="acc-popover__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="acc-popover__body">
        <label className="acc-field">
          <span className="acc-field__label">
            Handoff notes
            <span className={`acc-notes__saved${saved ? ' acc-notes__saved--on' : ''}`}>
              {saved ? 'Saved' : ''}
            </span>
          </span>
          <textarea
            className="acc-field__input acc-daynotes"
            value={draft}
            onChange={onNotesChange}
            disabled={locked}
            rows={5}
            placeholder="Handoff notes, prep for tomorrow, anything a sub would need to know."
          />
          <span className="acc-field__hint">Prints on this day's report.</span>
        </label>

        {absence ? (
          <div className="acc-absence acc-absence--recorded">
            <p className="acc-absence__title">
              Absence recorded — {absence.reason}
              {absence.text ? `: ${absence.text}` : ''}
            </p>
            <p className="acc-absence__body">
              This prints in the report header, so whoever reads the record knows why entries are
              thin.
            </p>
            <button
              type="button"
              className="acc-btn acc-btn--small acc-btn--quiet"
              onClick={() => mutate((d) => clearTeacherAbsence(d, dateKey))}
              disabled={locked}
            >
              Undo
            </button>
          </div>
        ) : reporting ? (
          <div className="acc-absence acc-enter">
            <p className="acc-field__label">Why were you out?</p>
            <div className="acc-chipset">
              {TEACHER_ABSENCE_REASONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`acc-chip${reason === r.label ? ' acc-chip--on' : ''}`}
                  onClick={() => setReason(r.label)}
                  aria-pressed={reason === r.label}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <input
              className="acc-field__input"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Anything to add (optional)"
              onKeyDown={(e) => e.key === 'Enter' && submitAbsence()}
            />
            {/* No Cancel — closing the popover cancels. */}
            <button
              type="button"
              className="acc-btn acc-btn--primary acc-btn--full"
              onClick={submitAbsence}
            >
              Add to notes
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="acc-btn acc-btn--small"
            onClick={() => setReporting(true)}
            disabled={locked}
          >
            Report an absence
          </button>
        )}
      </div>
    </div>
  );
}
