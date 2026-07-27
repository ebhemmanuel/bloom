import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../context/DataContext.jsx';
import { dataBridge } from '../../lib/bridge.js';
import { createEmptyDoc, PRODUCT_NAME } from '../../domain/schema.js';
import { newTeacherId } from '../../domain/ids.js';
import { isoTimestamp, todayKey } from '../../domain/dates.js';
import { SUBJECT_OPTIONS, GRADE_OPTIONS } from '../../domain/constants.js';

const STEPS = ['welcome', 'about', 'location', 'done'];

/** Aurora field. Each blob blooms in on its own delay, then drifts forever. */
function AuroraField() {
  return (
    <div className="acc-bloomfield" aria-hidden="true">
      <span className="acc-bloomfield__blob acc-bloomfield__blob--1" />
      <span className="acc-bloomfield__blob acc-bloomfield__blob--2" />
      <span className="acc-bloomfield__blob acc-bloomfield__blob--3" />
      <span className="acc-bloomfield__blob acc-bloomfield__blob--4" />
    </div>
  );
}

function WelcomeStep({ onNext }) {
  return (
    <div className="acc-ob__screen acc-ob__screen--welcome">
      <div className="acc-ob__hero">
        <p className="acc-ob__eyebrow">{PRODUCT_NAME}</p>
        <h1 className="acc-ob__title">Hi there.</h1>
        <p className="acc-ob__lede">
          {PRODUCT_NAME} is a calm place to keep a daily record of the support you give your
          students. A few quiet minutes at the end of the day.
        </p>
        <p className="acc-ob__fine">
          Everything you write stays on this computer.
          <br />
          Nothing is ever sent anywhere.
        </p>
        <button type="button" className="acc-ob__cta" onClick={onNext}>
          Let&rsquo;s get started
        </button>
      </div>
    </div>
  );
}

/** Chip row used for both subjects and grades. */
function Chips({ options, selected, onToggle, columns }) {
  return (
    <div className={`acc-ob__chips${columns ? ' acc-ob__chips--grid' : ''}`}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`acc-ob__chip${selected.includes(option) ? ' acc-ob__chip--on' : ''}`}
          onClick={() => onToggle(option)}
          aria-pressed={selected.includes(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function AboutStep({ draft, setDraft, onNext }) {
  const [custom, setCustom] = useState('');

  const toggle = (key, value) =>
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(value) ? d[key].filter((x) => x !== value) : [...d[key], value],
    }));

  const addCustom = () => {
    const value = custom.trim();
    if (!value) return;
    setDraft((d) =>
      d.subjects.some((s) => s.toLowerCase() === value.toLowerCase())
        ? d
        : { ...d, subjects: [...d.subjects, value] }
    );
    setCustom('');
  };

  const extras = draft.subjects.filter((s) => !SUBJECT_OPTIONS.includes(s));

  return (
    <div className="acc-ob__screen">
      <div className="acc-ob__panel">
        <h2 className="acc-ob__heading">A little about you</h2>

        <label className="acc-ob__field">
          <span className="acc-ob__label">What should we call you?</span>
          <input
            className="acc-ob__input"
            value={draft.displayName}
            onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))}
            placeholder="Ms. Rivera"
            aria-label="Your name"
            autoFocus
          />
          {/* Shows exactly where the name will end up, so it is obvious this is
              for the paperwork rather than a login. */}
          <span className="acc-ob__preview">
            {PRODUCT_NAME} · Daily Accommodation Record ·{' '}
            <strong>{draft.displayName.trim() || 'your name'}</strong>
          </span>
        </label>

        <div className="acc-ob__field">
          <span className="acc-ob__label">What do you teach?</span>
          <Chips
            options={SUBJECT_OPTIONS}
            selected={draft.subjects}
            onToggle={(v) => toggle('subjects', v)}
          />
          {extras.length > 0 && (
            <div className="acc-ob__chips">
              {extras.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="acc-ob__chip acc-ob__chip--on"
                  onClick={() => toggle('subjects', s)}
                  aria-pressed
                >
                  {s} ×
                </button>
              ))}
            </div>
          )}
          <div className="acc-inputgroup acc-inputgroup--lg">
            <input
              className="acc-inputgroup__input"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustom();
                }
              }}
              placeholder="Something else…"
              aria-label="Add a subject"
            />
            <button
              type="button"
              className="acc-inputgroup__action"
              onClick={addCustom}
              disabled={!custom.trim()}
            >
              Add
            </button>
          </div>
        </div>

        <div className="acc-ob__field">
          <span className="acc-ob__label">Which grades?</span>
          <Chips
            options={GRADE_OPTIONS}
            selected={draft.gradeLevels}
            onToggle={(v) => toggle('gradeLevels', v)}
            columns
          />
        </div>

        <button
          type="button"
          className="acc-ob__cta"
          onClick={onNext}
          disabled={!draft.displayName.trim()}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function LocationStep({ onChoose, busy, error }) {
  const [options, setOptions] = useState([]);

  useEffect(() => {
    dataBridge.suggestLocations().then(setOptions);
  }, []);

  const browse = async () => {
    const picked = await dataBridge.pickFolder();
    if (picked.canceled) return;
    onChoose(picked.dirPath);
  };

  return (
    <div className="acc-ob__screen">
      <div className="acc-ob__panel">
        <h2 className="acc-ob__heading">Where should your records live?</h2>
        <p className="acc-ob__sub">
          Your students&rsquo; information is saved as a single file on this computer. It is never
          sent anywhere.
        </p>

        <ul className="acc-ob__locations">
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className={`acc-ob__location${option.synced ? ' acc-ob__location--advisory' : ''}`}
                onClick={() => onChoose(option.dirPath)}
                disabled={busy || !option.writable}
              >
                <span className="acc-ob__location-top">
                  <span className="acc-ob__location-label">{option.label}</span>
                  {option.id === 'local' && !option.synced && (
                    <span className="acc-ob__tag">Recommended</span>
                  )}
                </span>
                <span className="acc-ob__location-hint">{option.hint}</span>
                <code className="acc-ob__location-path">{option.dirPath}</code>

                {option.synced && (
                  <span className="acc-ob__location-advisory">
                    This folder syncs to {option.provider}. Your students&rsquo; information would
                    be copied off this computer.
                  </span>
                )}
                {option.existingFile && (
                  <span className="acc-ob__location-found">
                    An existing record was found here — we&rsquo;ll open it.
                  </span>
                )}
                {!option.writable && (
                  <span className="acc-ob__location-advisory">
                    This computer won&rsquo;t let us save here ({option.reason}).
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <button type="button" className="acc-ob__ghost" onClick={browse} disabled={busy}>
          Choose a different folder…
        </button>

        {error && <p className="acc-ob__error">{error}</p>}
      </div>
    </div>
  );
}

function DoneStep({ summary, onOpen }) {
  return (
    <div className="acc-ob__screen">
      <div className="acc-ob__done">
        <h2 className="acc-ob__done-title">You&rsquo;re all set</h2>
        <div className="acc-ob__done-pill acc-numeric">{summary}</div>
        <p className="acc-ob__done-body">
          Periods, your roster, and your accommodation list come next — a few minutes, whenever
          you&rsquo;re ready.
        </p>
        <button type="button" className="acc-ob__cta" onClick={onOpen}>
          Open my board
        </button>
      </div>
    </div>
  );
}

/**
 * First-run setup.
 *
 * Everything is collected into local state and only committed at the end, so a
 * teacher can move back and forth without half a profile being written to disk —
 * and so the data location, which has to exist before anything can be saved, is
 * chosen as part of the same continuous flow rather than as a gate in front of it.
 */
export default function OnboardingFlow({ needsLocation }) {
  const { setDoc } = useData();

  const [step, setStep] = useState('welcome');
  const [draft, setDraft] = useState({ displayName: '', subjects: [], gradeLevels: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Skip the location step entirely when a folder is already configured.
  const steps = useMemo(
    () => STEPS.filter((s) => s !== 'location' || needsLocation),
    [needsLocation]
  );

  const index = steps.indexOf(step);

  const advance = () => setStep(steps[Math.min(index + 1, steps.length - 1)]);

  const chooseLocation = async (dirPath) => {
    setBusy(true);
    setError(null);
    const result = await dataBridge.chooseLocation(dirPath);
    setBusy(false);
    if (!result.ok) {
      setError(
        result.reason === 'NOT_WRITABLE'
          ? 'That folder is not writable. Try another.'
          : 'That folder could not be used. Try another.'
      );
      return;
    }
    advance();
  };

  const finish = () => {
    const now = new Date();
    const doc = createEmptyDoc(now);
    const teacherId = newTeacherId();

    doc.teachers = [
      {
        id: teacherId,
        displayName: draft.displayName.trim(),
        subjects: draft.subjects,
        gradeLevels: draft.gradeLevels,
        school: '',
        room: '',
        createdAt: isoTimestamp(now),
      },
    ];
    doc.settings.activeTeacherId = teacherId;
    doc.settings.onboardingCompletedAt = isoTimestamp(now);
    doc.settings.lastKnownDate = todayKey(now);

    setDoc(doc);
  };

  const summary =
    [
      draft.subjects.length
        ? `${draft.subjects.length} subject${draft.subjects.length === 1 ? '' : 's'}`
        : null,
      draft.gradeLevels.length
        ? `${draft.gradeLevels.length} grade${draft.gradeLevels.length === 1 ? '' : 's'}`
        : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Ready to go';

  return (
    <div className="acc-ob">
      <div className="acc-ob__backdrop" aria-hidden="true" />
      <AuroraField />

      {/* Progress segments, hidden on the welcome screen so the first thing you
          see is a greeting rather than a form with a length. */}
      {step !== 'welcome' && (
        <div className="acc-ob__progress" aria-label="Setup progress">
          {steps.map((s, i) => (
            <span key={s} className={`acc-ob__seg${i <= index ? ' acc-ob__seg--on' : ''}`} />
          ))}
        </div>
      )}

      {step === 'welcome' && <WelcomeStep onNext={advance} />}
      {step === 'about' && <AboutStep draft={draft} setDraft={setDraft} onNext={advance} />}
      {step === 'location' && <LocationStep onChoose={chooseLocation} busy={busy} error={error} />}
      {step === 'done' && <DoneStep summary={summary} onOpen={finish} />}
    </div>
  );
}
