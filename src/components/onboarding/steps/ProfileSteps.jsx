import { useState } from 'react';
import {
  SUBJECT_OPTIONS,
  GRADE_OPTIONS,
  CYCLE_END_OPTIONS,
  REMINDER_OPTIONS,
} from '../../../domain/constants.js';
import { PRODUCT_NAME } from '../../../domain/schema.js';

/**
 * The four questions that build the teacher's own profile, plus the summary.
 *
 * One question per screen, and only the name is required. Everything else can be
 * walked past empty, because a teacher who wants to get to the board should be
 * able to, and none of these change what the app can record.
 */

/** The shared shell: glass card, eyebrow, question, note, then a footer. */
function Card({ width, eyebrow, title, note, children, footer }) {
  return (
    <div className="acc-ob__screen acc-ob__screen--card">
      <div className={`acc-ob__card acc-ob__card--${width}`}>
        <header className="acc-ob__head">
          <p className="acc-ob__eyebrow">{eyebrow}</p>
          <h2 className="acc-ob__question">{title}</h2>
          {note && <p className="acc-ob__note">{note}</p>}
        </header>
        {children}
        <footer className="acc-ob__foot">{footer}</footer>
      </div>
    </div>
  );
}

function Chip({ on, onClick, children, wide }) {
  return (
    <button
      type="button"
      className={`acc-ob__chip${on ? ' acc-ob__chip--on' : ''}${wide ? ' acc-ob__chip--fixed' : ''}`}
      onClick={onClick}
      aria-pressed={on}
    >
      {children}
    </button>
  );
}

function Back({ onClick }) {
  return (
    <button type="button" className="acc-ob__ghost" onClick={onClick}>
      Back
    </button>
  );
}

function Next({ onClick, disabled, children = 'Continue' }) {
  return (
    <button
      type="button"
      className={`acc-ob__next${disabled ? ' acc-ob__next--waiting' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function NameStep({ value, onChange, onNext }) {
  const ready = value.trim().length > 0;

  return (
    <Card
      width="sm"
      eyebrow="About you"
      title="What should we call you?"
      note={`However you'd like it to read on your printed reports, "Ms. Rivera" and "Jordan" are both fine.`}
      footer={
        <>
          <p className="acc-ob__hint">That&rsquo;s the only thing we need to start.</p>
          <Next onClick={onNext} disabled={!ready} />
        </>
      }
    >
      <div className="acc-ob__group">
        <input
          className="acc-ob__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && ready) onNext();
          }}
          placeholder="Ms. Rivera"
          aria-label="Your name"
          autoFocus
        />
        {/*
          Shows exactly where the name lands, so it is obvious this is for the
          paperwork rather than a login. It is also the first time the teacher
          sees the thing they are actually building.
        */}
        {ready && (
          <div className="acc-ob__preview acc-fade-enter">
            <p className="acc-ob__preview-label">On your printed reports</p>
            <p className="acc-ob__preview-line">
              {PRODUCT_NAME} · Daily Accommodation Record · {value.trim()}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

export function TeachStep({ name, subjects, grades, onToggle, onAddSubject, onBack, onNext }) {
  const [draft, setDraft] = useState('');
  const extras = subjects.filter((s) => !SUBJECT_OPTIONS.includes(s));

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    onAddSubject(value);
    setDraft('');
  };

  return (
    <Card
      width="md"
      eyebrow="Your classroom"
      title={`What do you teach, ${name}?`}
      note="Pick any that apply. These only personalize your reports, they're never used to score anything."
      footer={
        <>
          <Back onClick={onBack} />
          <Next onClick={onNext} />
        </>
      }
    >
      <div className="acc-ob__group">
        <div className="acc-ob__chips">
          {[...SUBJECT_OPTIONS, ...extras].map((s) => (
            <Chip key={s} on={subjects.includes(s)} onClick={() => onToggle('subjects', s)}>
              {s}
            </Chip>
          ))}
          <input
            className="acc-ob__chip-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Something else…"
            aria-label="Add a subject"
          />
        </div>
      </div>

      <div className="acc-ob__group">
        <p className="acc-ob__label">Which grades?</p>
        <div className="acc-ob__chips">
          {GRADE_OPTIONS.map((g) => (
            <Chip key={g} wide on={grades.includes(g)} onClick={() => onToggle('grades', g)}>
              {g}
            </Chip>
          ))}
        </div>
      </div>
    </Card>
  );
}

const PERIOD_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];

export function PeriodsStep({ periods, periodNames, onToggle, onRename, onBack, onNext }) {
  return (
    <Card
      width="md"
      eyebrow="Your day"
      title="Which periods do you see students?"
      note="Just the ones where you deliver accommodations. You can add or change these anytime."
      footer={
        <>
          <Back onClick={onBack} />
          <Next onClick={onNext} />
        </>
      }
    >
      <div className="acc-ob__chips">
        {PERIOD_NUMBERS.map((n) => (
          <Chip key={n} wide on={periods.includes(n)} onClick={() => onToggle(n)}>
            P{n}
          </Chip>
        ))}
      </div>

      {periods.length > 0 && (
        <div className="acc-ob__group acc-fade-enter">
          <p className="acc-ob__hint">Call them whatever you do out loud, optional.</p>
          {[...periods]
            .sort((a, b) => a - b)
            .map((n) => (
              <div key={n} className="acc-ob__rename">
                <span className="acc-ob__rename-label">Period {n}</span>
                <input
                  className="acc-ob__rename-input"
                  value={periodNames[n] || ''}
                  onChange={(e) => onRename(n, e.target.value)}
                  placeholder={n === 3 ? 'e.g. "3rd Block"' : 'Optional name'}
                  aria-label={`Name for period ${n}`}
                />
              </div>
            ))}
        </div>
      )}
    </Card>
  );
}

export function DayStep({ endTime, reminders, onPickTime, onToggleReminder, onBack, onNext }) {
  return (
    <Card
      width="md"
      eyebrow="Your rhythm"
      title="When does your day usually end?"
      note="Bloom uses this to quietly close out the day. Nothing pings you at this time."
      footer={
        <>
          <Back onClick={onBack} />
          <Next onClick={onNext} />
        </>
      }
    >
      <div className="acc-ob__chips">
        {CYCLE_END_OPTIONS.map((t) => (
          <Chip key={t.value} on={endTime === t.value} onClick={() => onPickTime(t.value)}>
            {t.label}
          </Chip>
        ))}
      </div>

      <div className="acc-ob__group">
        <div className="acc-ob__group acc-ob__group--tight">
          <p className="acc-ob__label">Reminders, only if they help</p>
          <p className="acc-ob__hint">
            You get enough pings already. These stay off unless you turn them on.
          </p>
        </div>

        <div className="acc-ob__toggles">
          {REMINDER_OPTIONS.map((r) => {
            const on = Boolean(reminders[r.id]);
            return (
              <button
                key={r.id}
                type="button"
                className={`acc-ob__toggle${on ? ' acc-ob__toggle--on' : ''}`}
                onClick={() => onToggleReminder(r.id)}
                aria-pressed={on}
              >
                <span className="acc-ob__toggle-text">
                  <span className="acc-ob__toggle-title">{r.title}</span>
                  <span className="acc-ob__toggle-body">{r.body}</span>
                </span>
                <span className="acc-ob__switch" aria-hidden="true">
                  <span className="acc-ob__knob" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

export function SetStep({ summary, onRoster, onBoard }) {
  return (
    <div className="acc-ob__screen acc-ob__screen--card">
      <div className="acc-ob__card acc-ob__card--sm acc-ob__card--centred">
        <h2 className="acc-ob__question acc-ob__question--big">That&rsquo;s the paperwork done.</h2>
        <p className="acc-ob__summary acc-numeric">{summary}</p>
        <p className="acc-ob__note">
          Your students come next: names, plans, and their supports. A few minutes, or later. Both
          are fine.
        </p>
        <div className="acc-ob__actions">
          <button type="button" className="acc-ob__cta" onClick={onRoster}>
            Add my students
          </button>
          <button type="button" className="acc-ob__ghost" onClick={onBoard}>
            Later, open my board
          </button>
        </div>
      </div>
    </div>
  );
}

export { Card };
