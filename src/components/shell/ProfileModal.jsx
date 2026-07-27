import { useEffect, useState } from 'react';
import { useData } from '../../context/DataContext.jsx';
import { updateTeacher, updateSettings } from '../../domain/mutations.js';
import ChipMulti from '../shared/ChipMulti.jsx';
import Scrim from '../shared/Scrim.jsx';
import useDismissAnimation from '../../hooks/useDismissAnimation.js';
import { SUBJECT_OPTIONS, GRADE_OPTIONS } from '../../domain/constants.js';

/**
 * The teacher's own details, opened from the avatar.
 *
 * A centred modal rather than a dropdown: this is a form with real content, and
 * click-outside deliberately does NOT close it once anything has been typed:
 * losing a half-finished profile to a stray click is a bad trade for the
 * convenience of dismissing an empty one.
 */
export default function ProfileModal({ onClose }) {
  const { doc, mutate, readOnly } = useData();
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

  // Exit mirrors the entrance rather than cutting, per the motion spec.
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

  return (
    <Scrim
      leaving={leaving}
      onDismiss={() => {
        // Only an untouched form is dismissible by clicking away.
        if (!dirty) dismiss();
      }}
    >
      <div
        className={`acc-modal ${leaving ? 'acc-leave' : 'acc-enter'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Your details"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="acc-modal__header">
          <div>
            <h2 className="acc-modal__title">Your details</h2>
            <p className="acc-modal__subtitle">
              These appear on every printed report. None of it affects your totals.
            </p>
          </div>
          <button type="button" className="acc-popover__close" onClick={dismiss} aria-label="Close">
            ×
          </button>
        </header>

        <div className="acc-modal__body acc-modal__body--stack">
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
              After this, anything still unassigned shows as Not Used. Today stays editable until
              the date rolls over.
            </span>
          </label>
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
