import { useEffect, useRef, useState } from 'react';
import { useData } from '../../context/DataContext.jsx';
import { useBoard } from '../../context/BoardContext.jsx';
import { usePopoverDismiss } from './AppHeader.jsx';
import useDismissAnimation from '../../hooks/useDismissAnimation.js';
import { setDayNotes, reportTeacherAbsence, clearTeacherAbsence } from '../../domain/mutations.js';
import { TEACHER_ABSENCE_REASONS } from '../../domain/constants.js';
import { formatDateMedium, relativeDayLabel } from '../../domain/dates.js';

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
  // What the debounce is holding, plus a live handle on the writer - the
  // unmount cleanup can't read either from the closure it was created in.
  const pending = useRef(null);
  const flush = useRef(null);

  // Every way out of this panel goes through `dismiss`, so it leaves the way it
  // arrived whether the teacher clicks the ×, clicks away, or presses Escape.
  const { leaving, dismiss } = useDismissAnimation(onClose);
  const ref = usePopoverDismiss(true, dismiss);
  const absence = model.teacherAbsence;
  const locked = readOnly || model.sealed;

  const relative = relativeDayLabel(dateKey);
  const heading = `Day notes · ${relative ? `${relative}, ` : ''}${formatDateMedium(dateKey)}`;

  // Adopt external changes (an absence line appended, a date switch) without
  // clobbering what is being typed.
  useEffect(() => {
    if (model.dayNotes !== latest.current) {
      latest.current = model.dayNotes;
      setDraft(model.dayNotes);
    }
  }, [model.dayNotes]);

  // Kept current every render so the cleanup below writes with today's mutate
  // and today's date rather than whichever ones existed when it was registered.
  flush.current = () => {
    if (pending.current === null) return;
    const text = pending.current;
    pending.current = null;
    latest.current = text;
    mutate((d) => setDayNotes(d, dateKey, text));
  };

  // Type a note, close the panel inside the debounce window, lose the note.
  // Cheap to get wrong and invisible when it happens, so the pending write is
  // committed on the way out rather than dropped with the timer.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      flush.current?.();
    },
    []
  );

  const onNotesChange = (event) => {
    const next = event.target.value;
    setDraft(next);
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      flush.current();
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
      className={`acc-daypanel ${leaving ? 'acc-leave' : 'acc-enter'}`}
      ref={ref}
      role="dialog"
      aria-label="Day notes"
    >
      <header className="acc-daypanel__header">
        <span className="acc-daypanel__eyebrow">{heading}</span>
        <button type="button" className="acc-daypanel__close" onClick={dismiss} aria-label="Close">
          ×
        </button>
      </header>

      <div className="acc-daypanel__body">
        <p className="acc-daypanel__intro">
          For a sub, or for tomorrow-you, anything the next person running this class should know.
        </p>

        <div className="acc-daypanel__notes">
          <textarea
            className="acc-daypanel__textarea"
            value={draft}
            onChange={onNotesChange}
            disabled={locked}
            rows={4}
            placeholder="Handoff notes, prep for tomorrow…"
            aria-label="Day notes"
          />
          <span
            className={`acc-daypanel__saved${saved ? ' acc-daypanel__saved--on' : ''}`}
            aria-live="polite"
          >
            Saved
          </span>
        </div>

        <div className="acc-daypanel__absence">
          {absence ? (
            <div className="acc-daypanel__reported">
              <p className="acc-daypanel__reported-text">
                Absence noted - {absence.reason}
                {absence.text ? `: ${absence.text}` : ''}. This prints in the report header, so
                whoever reads the record knows why entries are thin.
              </p>
              <button
                type="button"
                className="acc-daypanel__undo"
                onClick={() => mutate((d) => clearTeacherAbsence(d, dateKey))}
                disabled={locked}
              >
                Undo
              </button>
            </div>
          ) : reporting ? (
            <div className="acc-daypanel__form acc-enter">
              <span className="acc-daypanel__label">What happened?</span>
              <div className="acc-daypanel__reasons">
                {TEACHER_ABSENCE_REASONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`acc-daypanel__reason${reason === r.label ? ' acc-daypanel__reason--on' : ''}`}
                    onClick={() => setReason(r.label)}
                    aria-pressed={reason === r.label}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <input
                className="acc-daypanel__input"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Anything to add? (optional)"
                onKeyDown={(e) => e.key === 'Enter' && submitAbsence()}
              />
              {/* No Cancel - closing the popover cancels. */}
              <button type="button" className="acc-daypanel__submit" onClick={submitAbsence}>
                Add to notes
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="acc-daypanel__start"
              onClick={() => setReporting(true)}
              disabled={locked}
            >
              Report an absence
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
