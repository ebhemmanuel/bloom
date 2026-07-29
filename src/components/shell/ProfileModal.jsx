import { useState } from 'react';
import { useData } from '../../context/DataContext.jsx';
import { updateTeacher, updateSettings } from '../../domain/mutations.js';
import {
  BACKGROUND_STYLES,
  DEFAULT_BACKGROUND_STYLE,
  DEFAULT_CYCLE_END_TIME,
  DEFAULT_REMINDERS,
  CYCLE_END_OPTIONS,
  REMINDER_OPTIONS,
  SUBJECT_OPTIONS,
  GRADE_OPTIONS,
} from '../../domain/constants.js';
import SceneFrame from '../shared/SceneFrame.jsx';

/**
 * Settings, on the same sheet the add-student wizard lands on. Built to
 * design_handoff_settings_redesign/.
 *
 * Three sections behind header tabs, where there were four behind a 200px rail.
 * That rail split seven fields across four screens - School was two fields and
 * Your day was one - and gave the reminder preferences no home at all: they
 * were set once during setup and then unreachable. They live here now.
 *
 * Everything commits as it changes. Done, Escape and the × only dismiss, so
 * there is nothing to lose by leaving: the old click-outside guard existed
 * because a scrim was one stray click away from a half-typed profile, and this
 * screen has no outside to click.
 */

const SECTIONS = [
  { id: 'you', label: 'You' },
  { id: 'day', label: 'Your day' },
  { id: 'look', label: 'Appearance' },
];

const TIPS = {
  you: 'Everything here saves as it changes - close whenever.',
  day: 'Applies from today. Sealed days never change.',
  look: 'Changes the scene immediately.',
};

export default function ProfileModal({ onClose, background, leaving = false }) {
  const { doc, mutate, readOnly } = useData();
  const teacher =
    doc.teachers.find((t) => t.id === doc.settings?.activeTeacherId) || doc.teachers[0];

  const [section, setSection] = useState('you');
  const [draft, setDraft] = useState({
    displayName: teacher?.displayName || '',
    school: teacher?.school || '',
    room: teacher?.room || '',
    subjects: teacher?.subjects || [],
    gradeLevels: teacher?.gradeLevels || [],
  });
  const [addingSubj, setAddingSubj] = useState(false);
  const [newSubj, setNewSubj] = useState('');

  const settings = doc.settings || {};
  const scene = settings.backgroundStyle || DEFAULT_BACKGROUND_STYLE;
  const cycleEndTime = settings.cycleEndTime || DEFAULT_CYCLE_END_TIME;
  const reminders = settings.reminders || DEFAULT_REMINDERS;

  const commit = (changes) => {
    const next = { ...draft, ...changes };
    setDraft(next);
    if (!readOnly && teacher) mutate((d) => updateTeacher(d, teacher.id, next));
  };

  const setSetting = (changes) => {
    if (!readOnly) mutate((d) => updateSettings(d, changes));
  };

  const toggleSubject = (value) =>
    commit({
      subjects: draft.subjects.includes(value)
        ? draft.subjects.filter((s) => s !== value)
        : [...draft.subjects, value],
    });

  const addSubject = () => {
    const value = newSubj.trim();
    setAddingSubj(false);
    setNewSubj('');
    if (!value) return;
    // Case-insensitive dedupe, so "algebra" does not join an existing "Algebra".
    if (draft.subjects.some((s) => s.toLowerCase() === value.toLowerCase())) return;
    commit({ subjects: [...draft.subjects, value] });
  };

  // Anything chosen that is not in the preset list, so a custom subject stays
  // visible - and removable, which is what the × on it means.
  const extraSubjects = draft.subjects.filter((s) => !SUBJECT_OPTIONS.includes(s));

  /**
   * The report header, written out as it will print.
   *
   * These three fields do nothing else, and the line they produce is not
   * obvious from the fields themselves - a teacher filling in "214" cannot see
   * that it becomes ", Rm 214" until they print one.
   */
  const printLine =
    (draft.displayName.trim() || 'Ms. Rivera') +
    (draft.school.trim() ? ` · ${draft.school.trim()}` : '') +
    (draft.room.trim() ? `, Rm ${draft.room.trim()}` : '');

  const tabs = (
    <div className="acc-set__tabs" role="tablist" aria-label="Settings sections">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={s.id === section}
          className={`acc-set__tab${s.id === section ? ' acc-set__tab--on' : ''}`}
          onClick={() => setSection(s.id)}
        >
          <span className="acc-set__tabdot" aria-hidden="true" />
          {s.label}
        </button>
      ))}
    </div>
  );

  const footer = (
    <>
      {/* No Back: sections are not steps. The spacer keeps the tip centred on
          the frame rather than on what is left of the row. */}
      <div className="acc-sheet__footside" />
      <span className="acc-sheet__tip">{TIPS[section]}</span>
      <button type="button" className="acc-btn acc-btn--primary" onClick={onClose}>
        Done
      </button>
    </>
  );

  return (
    <SceneFrame
      label="Settings"
      background={background}
      leaving={leaving}
      onClose={onClose}
      wide
      head={tabs}
      footer={footer}
    >
      {/* Keyed by section so the entrance replays on every switch. */}
      <div className="acc-sheet__view" key={section}>
        {section === 'you' && (
          <div className="acc-sheet__pane acc-set__pane">
            <div className="acc-sheet__intro">
              <h1 className="acc-sheet__title">You, on the printed report</h1>
              <p className="acc-sheet__sub">
                Everything here is the header of every report you sign. None of it affects your
                totals.
              </p>
            </div>

            <div className="acc-set__field">
              <span className="acc-set__label">What should we call you?</span>
              <div className="acc-set__ids">
                <input
                  className="acc-set__input acc-set__input--name"
                  value={draft.displayName}
                  onChange={(e) => commit({ displayName: e.target.value })}
                  placeholder="Ms. Rivera"
                  aria-label="Your name"
                  disabled={readOnly}
                  autoFocus
                />
                <input
                  className="acc-set__input"
                  value={draft.school}
                  onChange={(e) => commit({ school: e.target.value })}
                  placeholder="School"
                  aria-label="School"
                  disabled={readOnly}
                />
                <input
                  className="acc-set__input"
                  value={draft.room}
                  onChange={(e) => commit({ room: e.target.value })}
                  placeholder="Rm"
                  aria-label="Room"
                  disabled={readOnly}
                />
              </div>
              <span className="acc-set__hint">
                Prints as &ldquo;{printLine}&rdquo; at the top of every report.
              </span>
            </div>

            <div className="acc-set__split">
              <div className="acc-set__cell acc-set__cell--end">
                <span className="acc-set__label">What do you teach?</span>
                <div className="acc-set__chips acc-set__chips--end">
                  {SUBJECT_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`acc-chip${draft.subjects.includes(option) ? ' acc-chip--on' : ''}`}
                      onClick={() => toggleSubject(option)}
                      aria-pressed={draft.subjects.includes(option)}
                      disabled={readOnly}
                    >
                      {option}
                    </button>
                  ))}

                  {/* Chosen and not on the list. The × says the click removes
                      it, which is otherwise the one thing a selected chip does
                      not obviously do. */}
                  {extraSubjects.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className="acc-chip acc-chip--on"
                      onClick={() => toggleSubject(option)}
                      aria-pressed
                      disabled={readOnly}
                      title="Remove"
                    >
                      {option} ×
                    </button>
                  ))}

                  {addingSubj ? (
                    <input
                      className="acc-set__newsubj"
                      value={newSubj}
                      onChange={(e) => setNewSubj(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          setAddingSubj(false);
                          setNewSubj('');
                        }
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addSubject();
                        }
                      }}
                      placeholder="Journalism"
                      aria-label="Add another subject"
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      className="acc-chip acc-chip--add"
                      onClick={() => setAddingSubj(true)}
                      title="Add another subject"
                      aria-label="Add another subject"
                      disabled={readOnly}
                    >
                      +
                    </button>
                  )}
                </div>
                <span className="acc-set__hint">
                  Pick as many as you teach. Use + for anything not listed.
                </span>
              </div>

              <span className="acc-set__rule" aria-hidden="true" />

              <div className="acc-set__cell">
                <span className="acc-set__label">Which grades?</span>
                <div className="acc-set__chips acc-set__chips--grades">
                  {GRADE_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`acc-chip${
                        draft.gradeLevels.includes(option) ? ' acc-chip--on' : ''
                      }`}
                      onClick={() =>
                        commit({
                          gradeLevels: draft.gradeLevels.includes(option)
                            ? draft.gradeLevels.filter((g) => g !== option)
                            : [...draft.gradeLevels, option],
                        })
                      }
                      aria-pressed={draft.gradeLevels.includes(option)}
                      disabled={readOnly}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <span className="acc-set__hint">
                  Used on the report header and for suggested catalogs - nothing else.
                </span>
              </div>
            </div>
          </div>
        )}

        {section === 'day' && (
          <div className="acc-sheet__pane acc-sheet__pane--wide acc-set__pane">
            <div className="acc-sheet__intro">
              <h1 className="acc-sheet__title">Your day</h1>
              <p className="acc-sheet__sub">
                When the day closes out, and what Bloom says to you along the way.
              </p>
            </div>

            <div className="acc-set__field">
              <span className="acc-set__label">End of school day</span>
              {/*
                The same six taps setup offers, rather than the time field this
                used to be. Typing 15:30 into a picker is a decision about
                formatting; choosing from the times a school day actually ends
                is a decision about your day.
              */}
              <div className="acc-set__chips">
                {CYCLE_END_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className={`acc-chip acc-chip--lg${
                      cycleEndTime === o.value ? ' acc-chip--on' : ''
                    }`}
                    onClick={() => setSetting({ cycleEndTime: o.value })}
                    aria-pressed={cycleEndTime === o.value}
                    disabled={readOnly}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <span className="acc-set__hint">
                After this, anything still unassigned shows as Not Used. Today stays editable until
                the date rolls over.
              </span>
            </div>

            <div className="acc-set__field">
              <span className="acc-set__label">Reminders</span>
              <div className="acc-set__toggles">
                {REMINDER_OPTIONS.map((r) => {
                  const on = Boolean(reminders[r.id]);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`acc-set__toggle${on ? ' acc-set__toggle--on' : ''}`}
                      aria-pressed={on}
                      disabled={readOnly}
                      onClick={() => setSetting({ reminders: { ...reminders, [r.id]: !on } })}
                    >
                      <span className="acc-set__toggle-text">
                        <span className="acc-set__toggle-title">{r.title}</span>
                        <span className="acc-set__toggle-body">{r.body}</span>
                      </span>
                      <span className="acc-set__track" aria-hidden="true">
                        <span className="acc-set__knob" />
                      </span>
                    </button>
                  );
                })}
              </div>
              <span className="acc-set__hint">
                All off unless you turn them on. Nothing here is ever urgent.
              </span>
            </div>
          </div>
        )}

        {section === 'look' && (
          <div className="acc-sheet__pane acc-sheet__pane--wide acc-set__pane">
            <div className="acc-sheet__intro">
              <h1 className="acc-sheet__title">The scene behind the board</h1>
              <p className="acc-sheet__sub">
                Three weathers, same room. The board itself stays clean white on all of them.
              </p>
            </div>

            <div className="acc-bgpick">
              {BACKGROUND_STYLES.map((b) => {
                const on = scene === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`acc-bgpick__opt${on ? ' acc-bgpick__opt--on' : ''}`}
                    aria-pressed={on}
                    disabled={readOnly}
                    onClick={() => setSetting({ backgroundStyle: b.id })}
                  >
                    {/* A swatch of the real thing, not a description of it. All
                        three scenes are slow enough that a word for them would
                        be a worse answer than a look. */}
                    <span
                      className={`acc-bgpick__swatch acc-bgpick__swatch--${b.id}`}
                      aria-hidden="true"
                    />
                    <span className="acc-bgpick__row">
                      <span className="acc-bgpick__name">{b.label}</span>
                      {on && (
                        <span className="acc-bgpick__check" aria-hidden="true">
                          ✓
                        </span>
                      )}
                    </span>
                    <span className="acc-bgpick__hint">{b.hint}</span>
                  </button>
                );
              })}
            </div>

            <span className="acc-set__hint">
              Calm is the scene setup opens in, so the board arrives in the room you started in
              rather than changing it as it appears.
            </span>
          </div>
        )}
      </div>
    </SceneFrame>
  );
}
