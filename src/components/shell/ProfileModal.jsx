import { useEffect, useState } from 'react';
import { useData } from '../../context/DataContext.jsx';
import { updateTeacher, updateSettings, setTermStart } from '../../domain/mutations.js';
import { needsLicenceFor, schoolYearOf } from '../../domain/licensing.js';
import DateField from '../shared/DateField.jsx';
import {
  BACKGROUND_STYLES,
  DEFAULT_BACKGROUND_STYLE,
  DEFAULT_CYCLE_END_TIME,
  DEFAULT_REMINDERS,
  DEFAULT_UPDATES,
  DEFAULT_LOW_PERFORMANCE,
  CYCLE_END_OPTIONS,
  UPDATE_CHECK_TIMES,
  REMINDER_OPTIONS,
  SUBJECT_OPTIONS,
  GRADE_OPTIONS,
} from '../../domain/constants.js';
import SceneFrame from '../shared/SceneFrame.jsx';
import { updateBridge, licenceBridge, isDesktop } from '../../lib/bridge.js';

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

/**
 * Four tabs, not three.
 *
 * The handoff put the report header and what you teach on one screen, and at
 * ten subjects and thirteen grades that screen ran past the frame - three
 * fields, then two wrapping chip fields under them. They are also two different
 * questions: who signs the report, and what you teach. One each.
 */
const SECTIONS = [
  { id: 'you', label: 'You' },
  { id: 'classes', label: 'Classes' },
  { id: 'day', label: 'Your day' },
  { id: 'notify', label: 'Reminders' },
  { id: 'look', label: 'Appearance' },
];

/**
 * What went wrong, in the teacher's words rather than the verifier's.
 *
 * `unsigned-build` is deliberately not surfaced. It means the copy was built
 * with no public key compiled in, which is my mistake and nothing a teacher can
 * act on, so it reads as the generic case and sends them to a reply instead.
 */
function keyErrorText(reason) {
  if (reason === 'malformed')
    return 'That does not look like a full key, check nothing was cut off when you copied it.';
  return 'That key was not recognised. Reply to the email it came in and I will sort it out.';
}

const TIPS = {
  you: 'Everything here saves as it changes - close whenever.',
  classes: 'Used on the report header, and to suggest catalogs. Nothing else.',
  day: 'Applies from today. Sealed days never change.',
  notify: 'All off unless you turn them on.',
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
  const updates = settings.updates || DEFAULT_UPDATES;
  // The manual check's own state: in flight, and what it found.
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(null);

  /*
    The licence, read once from the main process.

    Held here rather than in the record: who paid for the software has no place
    in a compliance document, and it is verified against a key compiled into the
    binary rather than against anything in the file.
  */
  const [licence, setLicence] = useState(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [keyError, setKeyError] = useState(null);
  // The year they tried to start without a licence, held while we explain.
  const [wantsYear, setWantsYear] = useState(null);
  /*
    Which half of the ask they are on: the offer, or the key.

    Two screens rather than one because they are separated by a trip to a
    browser and an email. A single screen would have to show a price and an
    empty key field at the same time, which reads as "pay, and also paste the
    thing you do not have yet".
  */
  const [gateStep, setGateStep] = useState('offer');
  /*
    Whether a Payment Link is configured in this build. Null until main answers,
    which in practice is long before the gate can appear: reaching it takes a
    date change, and this resolves on mount.
  */
  const [canBuy, setCanBuy] = useState(null);

  useEffect(() => {
    licenceBridge?.get?.().then((l) => setLicence(l || null));
    licenceBridge?.canBuy?.().then((v) => setCanBuy(Boolean(v)));
  }, []);
  const lowPerformance = settings.lowPerformance ?? DEFAULT_LOW_PERFORMANCE;
  const termStart = doc.schoolCalendar?.termStart || '';

  /**
   * Take a key, from either place it can be pasted.
   *
   * One function because a key that works in the gate must work under Reminders
   * and vice versa, and because clearing `wantsYear` on success is what turns
   * the ask back into the year they were trying to start in the first place.
   */
  const activateKey = async (raw) => {
    const result = await licenceBridge.set(raw.trim());
    if (!result?.ok) {
      setKeyError(result?.reason || 'invalid');
      return false;
    }
    setLicence(result.licence);
    setKeyDraft('');
    setKeyError(null);
    setWantsYear(null);
    setGateStep('offer');
    return true;
  };

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

  /*
    The ask, and the only one in the app.

    It replaces the whole screen rather than sitting on it, because it is a
    decision rather than an error - and it says what is NOT happening as
    plainly as what is. A teacher who closes this keeps everything: the year
    they recorded stays open, editable and printable forever. All they cannot do
    is begin a second one.
  */
  if (wantsYear) {
    const year = schoolYearOf(wantsYear);
    const offering = gateStep === 'offer';

    return (
      <SceneFrame
        label="A second school year"
        background={background}
        leaving={leaving}
        onClose={onClose}
        footer={
          offering ? (
            <>
              <div className="acc-sheet__footside">
                <button
                  type="button"
                  className="acc-btn acc-btn--quiet"
                  onClick={() => setWantsYear(null)}
                >
                  Not now
                </button>
                {/* Only worth offering separately when the other button buys. */}
                {canBuy && (
                  <button
                    type="button"
                    className="acc-btn acc-btn--quiet"
                    onClick={() => setGateStep('key')}
                  >
                    I have a key
                  </button>
                )}
              </div>
              <span className="acc-sheet__tip">
                {year}-{year + 1} would be your second year.
              </span>
              {canBuy ? (
                <button
                  type="button"
                  className="acc-btn acc-btn--primary"
                  onClick={async () => {
                    await licenceBridge?.buy?.();
                    setGateStep('key');
                  }}
                >
                  Continue to payment
                </button>
              ) : (
                <button
                  type="button"
                  className="acc-btn acc-btn--primary"
                  onClick={() => setGateStep('key')}
                >
                  I have a key
                </button>
              )}
            </>
          ) : (
            <>
              <div className="acc-sheet__footside">
                <button
                  type="button"
                  className="acc-btn acc-btn--quiet"
                  onClick={() => {
                    setGateStep('offer');
                    setKeyError(null);
                  }}
                >
                  Back
                </button>
              </div>
              <span className="acc-sheet__tip">
                Checked on this computer. Nothing is sent anywhere to verify it.
              </span>
              <button
                type="button"
                className="acc-btn acc-btn--primary"
                disabled={!keyDraft.trim()}
                onClick={() => activateKey(keyDraft)}
              >
                Activate
              </button>
            </>
          )
        }
      >
        {/* Keyed so the entrance replays across the two halves of the ask. */}
        <div className="acc-sheet__view" key={gateStep}>
          {offering ? (
            <div className="acc-sheet__pane">
              <div className="acc-sheet__intro acc-sheet__intro--center">
                <h1 className="acc-sheet__title">Ready for another year?</h1>
                <p className="acc-sheet__sub acc-sheet__sub--balance">
                  Your first school year is free, and it stays that way. Everything you have
                  recorded is yours to open, edit and print for as long as you keep the file,
                  whatever you decide here.
                </p>
              </div>

              <p className="acc-set__pitch">
                Starting {year}-{year + 1} is a one-time $29. No subscription, no expiry, and it
                works on a computer that never touches the internet.
              </p>

              <span className="acc-set__hint acc-set__hint--center">
                {canBuy
                  ? 'Payment opens in your own browser, on Stripe. Bloom itself stays offline, and never sees your card.'
                  : 'Nothing is taken away if you close this. You can come back in November.'}
              </span>
            </div>
          ) : (
            <div className="acc-sheet__pane">
              <div className="acc-sheet__intro acc-sheet__intro--center">
                <h1 className="acc-sheet__title">Paste your key</h1>
                <p className="acc-sheet__sub acc-sheet__sub--balance">
                  {canBuy
                    ? 'Your browser is open on the payment page. The key arrives by email straight after, and it is yours for good: keep that email and the same key works on any computer you move to.'
                    : 'It came by email when you bought Bloom. Keep that email, because pasting the same key again is all a new computer needs.'}
                </p>
              </div>

              <div className="acc-set__field">
                {/* The row is what makes flex:1 on the key input mean "fill the
                    width" rather than "stretch downwards". */}
                <div className="acc-set__row">
                  <input
                    className="acc-set__input acc-set__input--key"
                    value={keyDraft}
                    onChange={(e) => {
                      setKeyDraft(e.target.value);
                      setKeyError(null);
                    }}
                    placeholder="BLOOM-…"
                    aria-label="Licence key"
                    spellCheck={false}
                    autoFocus
                  />
                </div>
                <span className="acc-set__hint acc-set__hint--center">
                  {keyError
                    ? keyErrorText(keyError)
                    : 'One long line starting with BLOOM-. A line break from your email is fine.'}
                </span>
              </div>
            </div>
          )}
        </div>
      </SceneFrame>
    );
  }

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
          </div>
        )}

        {section === 'classes' && (
          <div className="acc-sheet__pane acc-sheet__pane--wide acc-set__pane">
            <div className="acc-sheet__intro acc-sheet__intro--center">
              <h1 className="acc-sheet__title">What you teach</h1>
              <p className="acc-sheet__sub acc-sheet__sub--balance">
                Your subjects and the grades you see. Both print on the report header, and both
                shape which starter sets get suggested.
              </p>
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
                  Pick as many as you teach. Use + for anything not on the list.
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
                  Every grade you see, not only the one you teach most.
                </span>
              </div>
            </div>
          </div>
        )}

        {section === 'day' && (
          <div className="acc-sheet__pane acc-sheet__pane--wide acc-set__pane">
            {/* Centred, because what is under it is two halves either side of a
                rule: a left-aligned heading over a symmetrical pair reads as
                belonging to the left one. */}
            <div className="acc-sheet__intro acc-sheet__intro--center">
              <h1 className="acc-sheet__title">Your day</h1>
              <p className="acc-sheet__sub">
                When the day closes out, and the day your year starts from.
              </p>
            </div>

            {/*
              Two halves of one question - when a day ends, when the year began.
              They are the same size of answer and belong side by side; stacked,
              the date field sat a long way under the times for no reason.
            */}
            <div className="acc-wiz__split">
              <div className="acc-wiz__cell acc-wiz__cell--end">
                <span className="acc-set__label">End of school day</span>
                {/*
                  Taps rather than the time field this used to be. Typing 15:30
                  into a picker is a decision about formatting; choosing from
                  the times a school day actually ends is a decision about your
                  day.
                */}
                <div className="acc-set__chips acc-wiz__chips--end">
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
                  After this, anything still unassigned shows as Not Used. Today stays editable
                  until the date rolls over.
                </span>
              </div>

              <span className="acc-wiz__rule" aria-hidden="true" />

              {/*
                What "start of the year" actually means.

                It was never asked for: setup stamped the day it ran on, and
                every screen that said "start of the year" meant that - a date
                the teacher never chose and could not see. The year is laid out
                from here, the report opens here, and a student with no
                enrolment date of their own counts from here.
              */}
              <div className="acc-wiz__cell">
                <span className="acc-set__label">First day of class</span>
                <DateField
                  value={termStart}
                  /*
                    The only gated action in the app.

                    Moving this within the year already recorded is a correction
                    and always free. Moving it into a year the record has never
                    seen is starting a second school year, which is the one
                    thing a licence buys. See domain/licensing.js - and note
                    that refusing here changes nothing: every day already in the
                    file stays editable, printable and exportable regardless.
                  */
                  onChange={(next) => {
                    if (readOnly) return;
                    if (needsLicenceFor(doc, next, Boolean(licence))) {
                      setWantsYear(next);
                      return;
                    }
                    mutate((d) => setTermStart(d, next));
                  }}
                  placeholder="Not set yet"
                  label="First day of class"
                  disabled={readOnly}
                />
                <span className="acc-set__hint">
                  Moving this re-lays the year behind you. Nothing already recorded is changed or
                  removed - days outside the term simply stop being asked about.
                </span>
              </div>
            </div>
          </div>
        )}

        {/*
          Reminders, on their own.

          They were the tail of "Your day", which put a question about when the
          day ends next to a list of things the app might say to you - two
          different kinds of decision under one heading, and the one with six
          toggles always won the screen.
        */}
        {section === 'notify' && (
          <div className="acc-sheet__pane acc-sheet__pane--wide acc-set__pane">
            <div className="acc-sheet__intro">
              <h1 className="acc-sheet__title">Reminders</h1>
              <p className="acc-sheet__sub">
                You get enough pings already. These stay off unless you turn them on.
              </p>
            </div>

            <div className="acc-set__field">
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
                Nothing here is ever urgent, and none of it leaves this computer.
              </span>
            </div>

            {/*
              The one thing in this app that reaches the network, said plainly
              and in the section about what the app tells you.

              It is a receive-only check: a request for the latest version
              number, carrying no body and nothing about a student, answered
              with a version and a link. Nothing downloads or installs itself.
              A district that forbids even that turns it off here and the app
              works exactly as before.
            */}
            {isDesktop && (
              <div className="acc-set__field">
                <span className="acc-wiz__label">New versions</span>

                <button
                  type="button"
                  className={`acc-set__toggle${updates.enabled ? ' acc-set__toggle--on' : ''}`}
                  aria-pressed={updates.enabled}
                  disabled={readOnly}
                  onClick={() => setSetting({ updates: { ...updates, enabled: !updates.enabled } })}
                >
                  <span className="acc-set__toggle-text">
                    <span className="acc-set__toggle-title">Check once a day</span>
                    <span className="acc-set__toggle-body">
                      Asks GitHub whether a newer version exists. It sends nothing about you or your
                      students, and never installs anything by itself.
                    </span>
                  </span>
                  <span className="acc-set__track" aria-hidden="true">
                    <span className="acc-set__knob" />
                  </span>
                </button>

                {updates.enabled && (
                  <div className="acc-set__chips">
                    {UPDATE_CHECK_TIMES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`acc-chip acc-chip--lg${updates.checkAt === t ? ' acc-chip--on' : ''}`}
                        aria-pressed={updates.checkAt === t}
                        disabled={readOnly}
                        onClick={() => setSetting({ updates: { ...updates, checkAt: t } })}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}

                {/* The manual check, which never uses the cached answer. */}
                <div className="acc-set__row">
                  <button
                    type="button"
                    className="acc-btn acc-btn--small"
                    disabled={checking}
                    onClick={async () => {
                      setChecking(true);
                      setChecked(await updateBridge.check());
                      setChecking(false);
                    }}
                  >
                    {checking ? 'Checking…' : 'Check now'}
                  </button>

                  {checked && (
                    <span className="acc-set__hint">
                      {!checked.ok
                        ? `Could not reach GitHub (${checked.reason}). Nothing is wrong with your records.`
                        : checked.available
                          ? `Version ${String(checked.latest).replace(/^v/i, '')} is out. You are on ${checked.current}.`
                          : `You are on the latest version (${checked.current}).`}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/*
              The licence.

              Under Reminders because this is the other place the app talks to
              the teacher about itself rather than about their students, and it
              is not worth a tab of its own: most people will look at it twice
              ever - once when they buy, once if they change computers.

              Checked here on this machine against a key built into the app. No
              request goes anywhere, and it does not expire.
            */}
            {isDesktop && (
              <div className="acc-set__field">
                <span className="acc-wiz__label">Licence</span>

                {licence ? (
                  <>
                    <span className="acc-set__licensed">Licensed to {licence.name}</span>
                    <span className="acc-set__hint">
                      {licence.email} · issued {licence.issued}. Keep the email it came in: pasting
                      the same key again is all a new computer needs.
                    </span>
                  </>
                ) : (
                  <>
                    <div className="acc-set__row">
                      <input
                        className="acc-set__input acc-set__input--key"
                        value={keyDraft}
                        onChange={(e) => {
                          setKeyDraft(e.target.value);
                          setKeyError(null);
                        }}
                        placeholder="BLOOM-…"
                        aria-label="Licence key"
                        spellCheck={false}
                        disabled={readOnly}
                      />
                      <button
                        type="button"
                        className="acc-btn acc-btn--small"
                        disabled={readOnly || !keyDraft.trim()}
                        onClick={() => activateKey(keyDraft)}
                      >
                        Activate
                      </button>
                    </div>
                    <span className="acc-set__hint">
                      {keyError
                        ? keyErrorText(keyError)
                        : 'Your first school year is free, with every student. A licence is only needed to start a second year, and it never expires.'}
                    </span>
                  </>
                )}
              </div>
            )}
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

            {/*
              On by default, and the copy has to earn turning it off rather than
              sell it. A teacher on a machine that can afford the motion gets
              something nicer; a teacher on one that cannot should not have to
              work out why the board felt slow.
            */}
            <div className="acc-set__field">
              <span className="acc-set__label">Performance</span>
              <div className="acc-set__toggles">
                <button
                  type="button"
                  className={`acc-set__toggle${lowPerformance ? ' acc-set__toggle--on' : ''}`}
                  aria-pressed={lowPerformance}
                  disabled={readOnly}
                  onClick={() => setSetting({ lowPerformance: !lowPerformance })}
                >
                  <span className="acc-set__toggle-text">
                    <span className="acc-set__toggle-title">Low performance mode</span>
                    <span className="acc-set__toggle-body">
                      Everything happens instantly. No fades, no cascades, no drifting scene. Leave
                      it on if this computer is older or feels slow.
                    </span>
                  </span>
                  <span className="acc-set__track" aria-hidden="true">
                    <span className="acc-set__knob" />
                  </span>
                </button>
              </div>
              <span className="acc-set__hint">
                It is on to begin with, because a board that stutters is worse than one that does
                not move. Turning it off brings the motion back straight away.
              </span>
            </div>
          </div>
        )}
      </div>
    </SceneFrame>
  );
}
