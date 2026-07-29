import { useEffect, useRef, useState } from 'react';
import { useData } from '../../context/DataContext.jsx';
import { useBoard } from '../../context/BoardContext.jsx';
import SceneFrame from '../shared/SceneFrame.jsx';
import { setDayNotes, reportTeacherAbsence, clearTeacherAbsence } from '../../domain/mutations.js';
import { TEACHER_ABSENCE_REASONS } from '../../domain/constants.js';
import { formatDateMedium, relativeDayLabel } from '../../domain/dates.js';

/**
 * Whole-day notes, plus the report-an-absence flow. Built to
 * design_handoff_day_notes/.
 *
 * Distinct from the per-student notes in each lane: this is the day itself -
 * prep, reminders, where things left off - and it prints on the daily report so
 * a sparse day carries its own explanation.
 *
 * Written for the teacher, and said that way. The copy used to offer these
 * notes to a substitute, which is a claim this app must not make: a sub does
 * not have access to a student's accommodations, and inviting one to read a
 * page of them is a legal problem rather than a helpful handoff.
 *
 * It lands where the board was, on the same sheet the add-student wizard uses
 * (see SceneFrame), and reporting an absence is a second VIEW inside that fixed
 * frame rather than an expander that grew the dialog under the pointer.
 */
export default function DayNotesPanel({ onClose, background, leaving = false }) {
  const { mutate, readOnly } = useData();
  const { dateKey, model } = useBoard();

  const [view, setView] = useState('notes');
  const [draft, setDraft] = useState(model.dayNotes || '');
  const [saved, setSaved] = useState(false);
  const [reason, setReason] = useState(TEACHER_ABSENCE_REASONS[0].label);
  const [detail, setDetail] = useState('');

  const timer = useRef(null);
  const flash = useRef(null);
  const latest = useRef(model.dayNotes || '');
  // What the debounce is holding, plus a live handle on the writer - the
  // unmount cleanup can't read either from the closure it was created in.
  const pending = useRef(null);
  const flush = useRef(null);
  // Set when an absence has just been recorded, so the box it produces is
  // scrolled to rather than left below the fold of a full column.
  const scrollWanted = useRef(false);
  const bodyRef = useRef(null);

  const absence = model.teacherAbsence;

  /**
   * A day sealed BY an absence is not locked to this panel.
   *
   * Reporting one seals the day, and the way back is the Undo in the box it
   * produced - so treating that seal as a lock disabled the only control that
   * could lift it, and one click closed the day for good. Reporting is refused
   * on an already-sealed day, so a seal sitting next to an absence record is
   * always the absence's own.
   */
  const locked = readOnly || (model.sealed && !absence);

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

  // Type a note, close the sheet inside the debounce window, lose the note.
  // Cheap to get wrong and invisible when it happens, so the pending write is
  // committed on the way out rather than dropped with the timer.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(flash.current);
      flush.current?.();
    },
    []
  );

  const flashSaved = () => {
    setSaved(true);
    clearTimeout(flash.current);
    flash.current = setTimeout(() => setSaved(false), 1400);
  };

  const onNotesChange = (event) => {
    const next = event.target.value;
    setDraft(next);
    setSaved(false);
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      flush.current();
      flashSaved();
    }, 500);
  };

  const submitAbsence = () => {
    mutate((d) => reportTeacherAbsence(d, dateKey, reason, detail));
    scrollWanted.current = true;
    setDetail('');
    setView('notes');
    flashSaved();
  };

  /**
   * The reported box, brought into view.
   *
   * It is appended below the writing surface, and on a short window that puts
   * it under the fold of the column - so recording an absence would look like
   * nothing had happened.
   */
  useEffect(() => {
    if (!scrollWanted.current || view !== 'notes' || !absence) return;
    scrollWanted.current = false;
    const scroller = bodyRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [view, absence]);

  const tip =
    view === 'report'
      ? 'Back keeps your notes untouched.'
      : absence
        ? 'The reason is on record for today’s report.'
        : 'Saves as you type · Prints on today’s report';

  const footer =
    view === 'report' ? (
      <>
        <div className="acc-sheet__footside">
          <button
            type="button"
            className="acc-btn acc-btn--quiet"
            onClick={() => {
              setView('notes');
              setDetail('');
            }}
          >
            Back
          </button>
        </div>
        <span className="acc-sheet__tip">{tip}</span>
        <button type="button" className="acc-btn acc-btn--primary" onClick={submitAbsence}>
          Add to notes
        </button>
      </>
    ) : (
      <>
        <div className="acc-sheet__footside">
          {/* Hidden once an absence is on record: Undo lives in the box it
              produced, and offering to report a second one would be offering
              to say the same thing twice. */}
          {!absence && !locked && (
            <button
              type="button"
              className="acc-btn acc-btn--quiet"
              onClick={() => setView('report')}
            >
              Report an absence
            </button>
          )}
        </div>
        <span className="acc-sheet__tip">{tip}</span>
        {/* Closes, rather than saves: the notes are already written. */}
        <button type="button" className="acc-btn acc-btn--primary" onClick={onClose}>
          Done
        </button>
      </>
    );

  return (
    <SceneFrame
      label="Day notes"
      background={background}
      leaving={leaving}
      onClose={onClose}
      bodyRef={bodyRef}
      footer={footer}
    >
      {/* Keyed by view so the entrance replays on the swap. */}
      <div className="acc-sheet__view" key={view}>
        {view === 'notes' ? (
          <div className="acc-sheet__pane acc-daynotes__pane">
            <div className="acc-sheet__intro acc-sheet__intro--center">
              <h1 className="acc-sheet__title">What should tomorrow-you know?</h1>
              <p className="acc-sheet__sub acc-sheet__sub--balance">
                Prep, reminders, where the day left off - a private note for your eyes only.
              </p>
            </div>

            <div className="acc-daynotes__field">
              <textarea
                className="acc-daynotes__textarea"
                value={draft}
                onChange={onNotesChange}
                disabled={locked}
                rows={7}
                placeholder="Handoff notes, prep for tomorrow…"
                aria-label="Day notes"
                autoFocus
              />

              {/*
                The date sits under the writing surface rather than over it: the
                heading above is the question, and this is only the label the
                note will file itself under.
              */}
              <div className="acc-daynotes__context">
                <span className="acc-daynotes__eyebrow">{heading}</span>
                {saved && (
                  <span className="acc-daynotes__saved" aria-live="polite">
                    Saved
                  </span>
                )}
              </div>
            </div>

            {absence && (
              <div className="acc-daynotes__reported">
                <p className="acc-daynotes__reported-text">
                  Absence noted - {absence.reason}
                  {absence.text ? `: ${absence.text}` : ''}. This prints in the report header, so
                  whoever reads the record knows why entries are thin.
                </p>
                <button
                  type="button"
                  className="acc-daynotes__undo"
                  onClick={() => mutate((d) => clearTeacherAbsence(d, dateKey))}
                  disabled={locked}
                >
                  Undo
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="acc-sheet__pane acc-daynotes__pane acc-daynotes__pane--report">
            <div className="acc-sheet__intro">
              <h1 className="acc-sheet__title">What happened?</h1>
              <p className="acc-sheet__sub">
                This appends a line to the day notes and flags the day in the report header, so a
                thin day carries its own explanation.
              </p>
            </div>

            <div className="acc-daynotes__reasons">
              {TEACHER_ABSENCE_REASONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`acc-chip acc-chip--lg${reason === r.label ? ' acc-chip--on' : ''}`}
                  onClick={() => setReason(r.label)}
                  aria-pressed={reason === r.label}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <input
              className="acc-daynotes__input"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitAbsence()}
              placeholder="Anything to add? (optional)"
              aria-label="Absence detail"
            />
          </div>
        )}
      </div>
    </SceneFrame>
  );
}
