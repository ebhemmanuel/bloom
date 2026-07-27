import { useState } from 'react';
import { useData } from '../../context/DataContext.jsx';
import { updateTeacher, updateSettings } from '../../domain/mutations.js';
import { usePopoverDismiss } from './AppHeader.jsx';
import ChipMulti from '../shared/ChipMulti.jsx';
import { SUBJECT_OPTIONS, GRADE_OPTIONS } from '../../domain/constants.js';

/**
 * The teacher's own details, opened from the avatar.
 *
 * Name, subjects and grades are the same three questions onboarding asks. They
 * personalise the printed report header and nothing else — none of it feeds a
 * compliance calculation.
 */
export default function SettingsPanel({ onClose }) {
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

  const ref = usePopoverDismiss(true, onClose);

  const commit = (changes) => {
    const next = { ...draft, ...changes };
    setDraft(next);
    if (!readOnly && teacher) mutate((d) => updateTeacher(d, teacher.id, next));
  };

  return (
    <div
      className="acc-popover acc-popover--settings acc-enter"
      ref={ref}
      role="dialog"
      aria-label="Your details"
    >
      <header className="acc-popover__header">
        <span className="acc-subhead">Your details</span>
        <button type="button" className="acc-popover__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="acc-popover__body">
        <label className="acc-field">
          <span className="acc-field__label">What should we call you?</span>
          <input
            className="acc-field__input"
            value={draft.displayName}
            onChange={(e) => commit({ displayName: e.target.value })}
            placeholder="Ms. Rivera"
            disabled={readOnly}
          />
          <span className="acc-field__hint">
            Appears on every printed report as “{draft.displayName || 'your name'}”.
          </span>
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
            After this time, anything still unassigned shows as Not Used. Today stays editable until
            the date rolls over.
          </span>
        </label>
      </div>
    </div>
  );
}
