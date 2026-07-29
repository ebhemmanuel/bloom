import { useState } from 'react';
import {
  SUBJECT_OPTIONS,
  GRADE_OPTIONS,
  CYCLE_END_OPTIONS,
  REMINDER_OPTIONS,
} from '../../../domain/constants.js';

/**
 * The four questions that build the teacher's own profile, plus the summary.
 *
 * One question per screen, and only the name is required. Everything else can be
 * walked past empty, because a teacher who wants to get to the board should be
 * able to, and none of these change what the app can record.
 */

/**
 * The shared shell: the same sheet frame the add-student wizard and settings
 * wear (see SceneFrame and _sheet.scss), minus the close button - onboarding
 * has nowhere to close to. Title and sub in the body, and the standard footer
 * row: Back on the left, the one line of guidance centred, primary on the
 * right. No eyebrow: the view's own heading is the title.
 */
function Card({ wide, title, note, children, footer }) {
  return (
    <div className="acc-ob__screen acc-ob__screen--card">
      <div className={`acc-sheet__dialog${wide ? ' acc-sheet__dialog--wide' : ''}`}>
        <div className="acc-sheet__body">
          <div className="acc-sheet__view">
            <div className={`acc-sheet__pane${wide ? ' acc-sheet__pane--wide' : ''}`}>
              <div className="acc-sheet__intro">
                <h1 className="acc-sheet__title">{title}</h1>
                {note && <p className="acc-sheet__sub">{note}</p>}
              </div>
              {children}
            </div>
          </div>
        </div>
        {footer && <footer className="acc-sheet__foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** The standard footer row. `next` is the primary button, already built. */
function Foot({ onBack, tip, next }) {
  return (
    <>
      {/* The spacer holds the row still when Back is not there to hold it. */}
      <div className="acc-sheet__footside">
        {onBack && (
          <button type="button" className="acc-btn acc-btn--quiet" onClick={onBack}>
            Back
          </button>
        )}
      </div>
      {tip && <span className="acc-sheet__tip">{tip}</span>}
      {next}
    </>
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

function Next({ onClick, disabled, children = 'Continue' }) {
  return (
    <button type="button" className="acc-btn acc-btn--primary" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function NameStep({ value, onChange, onNext }) {
  const ready = value.trim().length > 0;

  return (
    <Card
      title="What should we call you?"
      note={`However you'd like it to read on your printed reports, "Ms. Rivera" and "Jordan" are both fine.`}
      footer={
        <Foot
          tip="That's the only thing we need to start."
          next={<Next onClick={onNext} disabled={!ready} />}
        />
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
      </div>
    </Card>
  );
}

// Where the grade rows break: after 3, then after 7.
const GRADE_ROWS = [
  GRADE_OPTIONS.slice(0, GRADE_OPTIONS.indexOf('4')),
  GRADE_OPTIONS.slice(GRADE_OPTIONS.indexOf('4'), GRADE_OPTIONS.indexOf('8')),
  GRADE_OPTIONS.slice(GRADE_OPTIONS.indexOf('8')),
];

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
      wide
      title={`What do you teach, ${name}?`}
      note="Pick any that apply."
      footer={
        <Foot
          onBack={onBack}
          tip="These only personalize your reports, they're never used to score anything."
          next={<Next onClick={onNext} />}
        />
      }
    >
      {/* The settings Classes tab's layout: subjects and grades a true half
          each, meeting at the rule. See ProfileModal and `.acc-set__split`. */}
      <div className="acc-ob__split">
        <div className="acc-ob__cell acc-ob__cell--end">
          <p className="acc-ob__label">Subjects</p>
          <div className="acc-ob__chips acc-ob__chips--end">
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

        <span className="acc-ob__rule" aria-hidden="true" />

        <div className="acc-ob__cell">
          <p className="acc-ob__label">Which grades?</p>
          {/* Fixed rows rather than free wrap: K-3, 4-7, 8-12, so the bands a
              school actually splits on read as bands. */}
          <div className="acc-ob__chip-rows">
            {GRADE_ROWS.map((row) => (
              <div key={row[0]} className="acc-ob__chips">
                {row.map((g) => (
                  <Chip key={g} wide on={grades.includes(g)} onClick={() => onToggle('grades', g)}>
                    {g}
                  </Chip>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

const PERIOD_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];

export function PeriodsStep({ periods, periodNames, onToggle, onRename, onBack, onNext }) {
  return (
    <Card
      title="Which periods do you see students?"
      note="Just the ones where you deliver accommodations."
      footer={
        <Foot
          onBack={onBack}
          tip="You can add or change these anytime."
          next={<Next onClick={onNext} />}
        />
      }
    >
      <div className="acc-ob__chips acc-ob__chips--center">
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
      title="When does your day usually end?"
      note="Bloom uses this to quietly close out the day."
      footer={
        <Foot
          onBack={onBack}
          tip="Nothing pings you at this time."
          next={<Next onClick={onNext} />}
        />
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
      <div className="acc-sheet__dialog">
        <div className="acc-sheet__body">
          <div className="acc-sheet__view">
            {/* The wizard's done state, worn by the summary: centred, actions
                in the pane, no footer row to Back out of. */}
            <div className="acc-sheet__pane acc-ob__pane--centred">
              <div className="acc-sheet__intro acc-sheet__intro--center">
                <h1 className="acc-sheet__title">That&rsquo;s the paperwork done.</h1>
                <p className="acc-sheet__sub acc-sheet__sub--balance">
                  Your students come next: names, plans, and their supports. A few minutes, or
                  later. Both are fine.
                </p>
              </div>
              <p className="acc-ob__summary acc-numeric">{summary}</p>
              <div className="acc-ob__actions">
                <button type="button" className="acc-btn acc-btn--primary" onClick={onRoster}>
                  Add my students
                </button>
                <button type="button" className="acc-btn acc-btn--quiet" onClick={onBoard}>
                  Later, open my board
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { Card };
