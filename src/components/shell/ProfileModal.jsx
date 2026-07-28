import { useEffect, useRef, useState } from 'react';
import { useData } from '../../context/DataContext.jsx';
import { updateTeacher, updateSettings } from '../../domain/mutations.js';
import {
  BACKGROUND_STYLES,
  DEFAULT_BACKGROUND_STYLE,
  SUBJECT_OPTIONS,
  GRADE_OPTIONS,
} from '../../domain/constants.js';
import ChipMulti from '../shared/ChipMulti.jsx';
import Scrim from '../shared/Scrim.jsx';
import useDismissAnimation from '../../hooks/useDismissAnimation.js';

/**
 * Settings, as a rail of sections and one panel at a time.
 *
 * It was a single column of every field there is, which is fine at four fields
 * and unreadable at ten: a teacher looking for the end-of-day time had to scroll
 * past their own name, their subjects and their grades to find it. Splitting it
 * means each screen answers one question, and adding the eleventh field later
 * costs nothing.
 *
 * Click-outside deliberately does NOT close it once anything has been typed.
 * Losing a half-finished profile to a stray click is a bad trade for the
 * convenience of dismissing an empty one.
 */

const SECTIONS = [
  { id: 'you', label: 'You', hint: 'Name, subjects, grades' },
  { id: 'school', label: 'School', hint: 'Where you teach' },
  { id: 'day', label: 'Your day', hint: 'When it closes out' },
  { id: 'appearance', label: 'Appearance', hint: 'The scene behind the board' },
];

export default function ProfileModal({ onClose }) {
  const { doc, mutate, readOnly } = useData();
  const background = doc.settings?.backgroundStyle || DEFAULT_BACKGROUND_STYLE;
  const teacher =
    doc.teachers.find((t) => t.id === doc.settings?.activeTeacherId) || doc.teachers[0];

  const [draft, setDraft] = useState({
    displayName: teacher?.displayName || '',
    school: teacher?.school || '',
    room: teacher?.room || '',
    subjects: teacher?.subjects || [],
    gradeLevels: teacher?.gradeLevels || [],
  });
  const [dirty, setDirty] = useState(false);
  const [section, setSection] = useState('you');

  /**
   * Switching sections: the outgoing panel leaves before the incoming one
   * arrives, rather than the content swapping under a static frame.
   *
   * `pending` holds the section that has been asked for while the current one
   * is still on screen. Without it the panel would cut, which reads as the
   * dialog having been replaced rather than turned to a new page.
   */
  const [pending, setPending] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const goTo = (next) => {
    if (next === section || pending) return;
    setPending(next);
    timer.current = setTimeout(() => {
      setSection(next);
      setPending(null);
    }, 140);
  };

  // The whole dialog exits the way every other one does.
  const { leaving, dismiss } = useDismissAnimation(onClose);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dismiss]);

  const commit = (changes) => {
    const next = { ...draft, ...changes };
    setDraft(next);
    setDirty(true);
    if (!readOnly && teacher) mutate((d) => updateTeacher(d, teacher.id, next));
  };

  const active = SECTIONS.find((s) => s.id === section) || SECTIONS[0];

  return (
    <Scrim
      leaving={leaving}
      onDismiss={() => {
        // Only an untouched form is dismissible by clicking away.
        if (!dirty) dismiss();
      }}
    >
      <div
        className={`acc-modal acc-modal--wide ${leaving ? 'acc-leave' : 'acc-enter'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="acc-modal__header">
          <div className="acc-modal__heading">
            <h2 className="acc-modal__title">Settings</h2>
            <p className="acc-modal__subtitle">
              Your details appear on every printed report. None of it affects your totals.
            </p>
          </div>
          <button type="button" className="acc-popover__close" onClick={dismiss} aria-label="Close">
            ×
          </button>
        </header>

        <div className="acc-settings">
          <nav className="acc-settings__rail" aria-label="Settings sections">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`acc-settings__tab${s.id === section ? ' acc-settings__tab--on' : ''}`}
                aria-current={s.id === section ? 'page' : undefined}
                onClick={() => goTo(s.id)}
              >
                <span className="acc-settings__tab-name">{s.label}</span>
                <span className="acc-settings__tab-hint">{s.hint}</span>
              </button>
            ))}
          </nav>

          {/*
            Keyed on the section, so React rebuilds the panel rather than
            reusing it - which is what lets the cascade replay each time instead
            of running once and never again.
          */}
          <section
            key={section}
            className={`acc-settings__panel ${pending ? 'acc-leave' : 'acc-cascade'}`}
            aria-label={active.label}
          >
            {section === 'you' && (
              <>
                <label className="acc-field">
                  <span className="acc-field__label">What should we call you?</span>
                  <input
                    className="acc-field__input"
                    value={draft.displayName}
                    onChange={(e) => commit({ displayName: e.target.value })}
                    placeholder="Ms. Rivera"
                    disabled={readOnly}
                    autoFocus
                  />
                </label>

                <ChipMulti
                  label="What do you teach?"
                  options={SUBJECT_OPTIONS}
                  selected={draft.subjects}
                  onChange={(subjects) => commit({ subjects })}
                  allowCustom
                  disabled={readOnly}
                />

                <ChipMulti
                  label="Which grades?"
                  options={GRADE_OPTIONS}
                  selected={draft.gradeLevels}
                  onChange={(gradeLevels) => commit({ gradeLevels })}
                  disabled={readOnly}
                />
              </>
            )}

            {section === 'school' && (
              <div className="acc-field-row">
                <label className="acc-field">
                  <span className="acc-field__label">School</span>
                  <input
                    className="acc-field__input"
                    value={draft.school}
                    onChange={(e) => commit({ school: e.target.value })}
                    placeholder="Northside Middle"
                    disabled={readOnly}
                  />
                </label>
                <label className="acc-field acc-field--narrow">
                  <span className="acc-field__label">Room</span>
                  <input
                    className="acc-field__input"
                    value={draft.room}
                    onChange={(e) => commit({ room: e.target.value })}
                    placeholder="214"
                    disabled={readOnly}
                  />
                </label>
              </div>
            )}

            {section === 'day' && (
              <label className="acc-field">
                <span className="acc-field__label">End of school day</span>
                <input
                  type="time"
                  className="acc-field__input acc-field__input--time"
                  value={doc.settings?.cycleEndTime || '16:00'}
                  onChange={(e) =>
                    !readOnly && mutate((d) => updateSettings(d, { cycleEndTime: e.target.value }))
                  }
                  disabled={readOnly}
                />
                <span className="acc-field__hint">
                  After this, anything still unassigned shows as Not Used. Today stays editable
                  until the date rolls over.
                </span>
              </label>
            )}

            {section === 'appearance' && (
              <div className="acc-field">
                <span className="acc-field__label">Background</span>
                <div className="acc-bgpick">
                  {BACKGROUND_STYLES.map((b) => {
                    const on = background === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        className={`acc-bgpick__opt${on ? ' acc-bgpick__opt--on' : ''}`}
                        aria-pressed={on}
                        disabled={readOnly}
                        onClick={() =>
                          !readOnly && mutate((d) => updateSettings(d, { backgroundStyle: b.id }))
                        }
                      >
                        {/* A swatch of the real thing, not a description of it.
                            Both scenes are slow enough that a word for them
                            would be a worse answer than a look. */}
                        <span
                          className={`acc-bgpick__swatch acc-bgpick__swatch--${b.id}`}
                          aria-hidden="true"
                        />
                        <span className="acc-bgpick__name">{b.label}</span>
                        <span className="acc-bgpick__hint">{b.hint}</span>
                      </button>
                    );
                  })}
                </div>
                <span className="acc-field__hint">
                  Calm is the scene setup opens in, so the board arrives in the room you started in
                  rather than changing it as it appears.
                </span>
              </div>
            )}
          </section>
        </div>

        <footer className="acc-modal__footer">
          <button type="button" className="acc-btn acc-btn--primary" onClick={dismiss}>
            Done
          </button>
        </footer>
      </div>
    </Scrim>
  );
}
