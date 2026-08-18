import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../context/DataContext.jsx';
import { dataBridge } from '../../lib/bridge.js';
import { slotWords } from '../../domain/vocabulary.js';
import { buildOnboardedDoc } from '../../domain/onboarding.js';
import { todayKey } from '../../domain/dates.js';
import {
  DEFAULT_CYCLE_END_TIME,
  DEFAULT_REMINDERS,
  DEFAULT_LOW_PERFORMANCE,
  CYCLE_END_OPTIONS,
  GRADE_OPTIONS,
} from '../../domain/constants.js';
import OnboardingAmbient from './OnboardingAmbient.jsx';
import { IntroStep, OutroStep } from './steps/OpeningSteps.jsx';
import { NameStep, TeachStep, PeriodsStep, DayStep, SetStep } from './steps/ProfileSteps.jsx';
import { RosterStep, SupportsStep, EMPTY_ROSTER_DRAFT } from './steps/RosterSteps.jsx';
import LocationStep from './steps/LocationStep.jsx';

/**
 * First-run setup.
 *
 * One question per screen, and only the name is required. Everything is held in
 * local state and committed exactly once, at the end, by `buildOnboardedDoc`.
 * That is deliberate: a teacher who closes the laptop on the periods screen
 * should leave nothing behind, because a half-written profile would make the
 * next launch skip onboarding and open a board built on it.
 *
 * The ambient scene mounts once and never remounts. Screens change in front of a
 * background that does not, which is what makes moving between questions feel
 * like turning your head rather than loading a page.
 */

/** Which progress segment each phase lights, out of six. */
const SEGMENTS = {
  name: 1,
  teach: 2,
  periods: 3,
  location: 4,
  day: 4,
  set: 5,
  roster: 6,
  accom: 6,
};

/** Long enough for the outgoing screen to clear before the next one arrives. */
const CROSSFADE_MS = 560;

/**
 * How long the outro runs before the board takes over.
 *
 * The three status lines land at 1400/2000/2600ms and the last needs to sit for
 * a beat, so the handoff starts at 3900ms. See the outro-to-board spec in
 * design_handoff_onboarding_v2 for the choreography on the other side.
 */
const OUTRO_MS = 3900;

/**
 * How long the outro takes to clear before the board arrives.
 *
 * It used to be cut away: the document was written, the route swapped, and the
 * whole screen vanished in one frame with the board's cascade starting under
 * nothing. The same 460ms fade the full-screen sheets leave on, so the handoff
 * reads as one gesture rather than two screens changing places.
 *
 * Only the CONTENT fades. The aurora behind it is the same scene the board
 * draws, and fading it would put a hole in the middle of the handoff.
 */
const OUTRO_FADE_MS = 460;

/** "3, 4, 5" becomes "3-5". A list of thirteen grades is not a summary. */
function summariseGrades(grades) {
  const idx = grades
    .map((g) => GRADE_OPTIONS.indexOf(g))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);

  const parts = [];
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j += 1;
    parts.push(j > i ? `${GRADE_OPTIONS[idx[i]]}-${GRADE_OPTIONS[idx[j]]}` : GRADE_OPTIONS[idx[i]]);
    i = j + 1;
  }
  return parts.join(', ');
}

export default function OnboardingFlow({ needsLocation }) {
  const { setDoc, reload } = useData();

  const [phase, setPhase] = useState('intro');
  // The screen on its way out. Both are rendered at once for the crossfade.
  const [leaving, setLeaving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // The last beat of setup: the outro clearing before the board takes over.
  const [outroLeaving, setOutroLeaving] = useState(false);

  /*
    The teacher's own word for a slot, derived here rather than through the
    usual hook.

    `useSlotWords` reads the document, and onboarding is the one place there
    isn't one yet - it is building the thing the hook would read. The grades
    were answered two screens earlier and live in `answers`, so the words follow
    from those directly.
  */
  const [answers, setAnswers] = useState({
    lowPerformance: DEFAULT_LOW_PERFORMANCE,
    name: '',
    subjects: [],
    grades: [],
    periods: [],
    periodNames: {},
    endTime: DEFAULT_CYCLE_END_TIME,
    /*
      The first day of class. Seeded with today so a teacher who walks past the
      question still gets a working year, but it is theirs to set - "start of
      the year" has to mean a date somebody chose.
    */
    termStart: todayKey(),
    reminders: { ...DEFAULT_REMINDERS },
    students: [],
  });
  const [editingId, setEditingId] = useState(null);

  // The teacher's own word for a slot, from the grades answered two screens
  // back. Derived here rather than via useSlotWords because that hook reads the
  // document, and onboarding is the one place there is not one yet.
  const words = slotWords({ gradeLevels: answers.grades });

  /**
   * The roster flow's own place in itself, held HERE rather than inside the
   * step.
   *
   * Choosing supports for one student is a different phase, so the roster step
   * unmounts to show it - and with the state inside, coming back reset the
   * flow and lost the accommodations already chosen for the pass. Lifted, the
   * trip is a detour rather than a restart.
   */
  const [rosterDraft, setRosterDraft] = useState(EMPTY_ROSTER_DRAFT);
  const patchRosterDraft = (changes) => setRosterDraft((d) => ({ ...d, ...changes }));

  const timers = useRef([]);
  const after = (fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const go = (next) => {
    setLeaving(phase);
    setPhase(next);
    after(() => setLeaving(null), CROSSFADE_MS);
  };

  const patch = (changes) => setAnswers((a) => ({ ...a, ...changes }));

  const toggleIn = (key, value) =>
    setAnswers((a) => ({
      ...a,
      [key]: a[key].includes(value) ? a[key].filter((x) => x !== value) : [...a[key], value],
    }));

  const updateStudent = (id, fn) =>
    setAnswers((a) => ({ ...a, students: a.students.map((s) => (s.id === id ? fn(s) : s)) }));

  const chooseLocation = async (dirPath) => {
    setBusy(true);
    setError(null);
    const result = await dataBridge.chooseLocation(dirPath);
    if (!result.ok) {
      setBusy(false);
      setError(
        result.reason === 'NOT_WRITABLE'
          ? 'That folder is not writable. Try another.'
          : 'That folder could not be used. Try another.'
      );
      return;
    }

    /*
      A record is already in that folder: OPEN it. Do not carry on.

      Carrying on is what lost people their year. The step pointed at a folder
      that already held data.json, the questions continued as if it were empty,
      and the handover at the end wrote a fresh document over it. Every teacher
      who set up under the app's old name and then launched the new one walked
      straight down this path.

      Reloading reads what is there. If it is a finished record it has
      onboardingCompletedAt and the board opens; setup is simply over. If it is
      somehow not, the loader says needs-onboarding and we are back here with
      the folder pointed at - and still nothing has been written over.
    */
    if (result.existing) {
      await reload();
      setBusy(false);
      return;
    }

    setBusy(false);
    go('set');
  };

  /**
   * The handover itself: writing the document swaps the route, so this is the
   * exact frame setup stops existing.
   *
   * Guarded and held in a ref, because two things race to call it - the fade
   * finishing and the timer behind it - and whichever arrives first should be
   * the only one that lands. The ref keeps the timer's copy current with the
   * answers rather than the ones that existed when it was scheduled.
   */
  const handedOver = useRef(false);
  const handOver = () => {
    if (handedOver.current) return;
    handedOver.current = true;
    setDoc(buildOnboardedDoc(answers, new Date()), {
      firstRun: true,
    });
  };
  const handOverRef = useRef(handOver);
  handOverRef.current = handOver;

  /**
   * Commit, then hand over.
   *
   * The document is written as the outro starts rather than after it, so the
   * three status lines describe work that is genuinely happening. If the write
   * were held until the end, the outro would be a loading screen for nothing.
   *
   * The outro CLEARS before the board takes over. It used to be cut: the route
   * swapped in the same frame the document was written, so setup did not leave,
   * it was deleted, and the board's cascade started under nothing.
   *
   * The fade's own end is what hands over - see `onAnimationEnd` on the stack -
   * with a timer behind it for the case where no animation runs at all, which
   * is what a hidden window does. Two timers 460ms apart would not survive
   * that: a background tab clamps them into the same tick and the fade never
   * gets a frame.
   */
  const finish = () => {
    go('outro');
    after(() => setOutroLeaving(true), OUTRO_MS - OUTRO_FADE_MS);
    after(() => handOverRef.current(), OUTRO_MS + 240);
  };

  const displayName = answers.name.trim() || 'Ms. Rivera';
  const firstName = answers.name.trim() || 'friend';
  const editing = answers.students.find((s) => s.id === editingId) || null;

  const summary = useMemo(() => {
    const timeLabel =
      CYCLE_END_OPTIONS.find((t) => t.value === answers.endTime)?.label || answers.endTime;
    const parts = [displayName];
    if (answers.subjects.length) parts.push(answers.subjects.slice(0, 3).join(', '));
    if (answers.grades.length) parts.push(`Grades ${summariseGrades(answers.grades)}`);
    if (answers.periods.length) {
      parts.push(
        `${answers.periods.length} ${answers.periods.length === 1 ? words.one : words.many}`
      );
    }
    parts.push(`Day ends ${timeLabel}`);
    return parts.join(' · ');
  }, [answers, displayName]);

  const segment = SEGMENTS[phase] || 0;

  /**
   * Rendered for whichever phase is arriving AND whichever is leaving.
   *
   * Keeping both mounted for the length of the crossfade is what lets one screen
   * clear as the next arrives. `--leaving` picks the exit animation.
   */
  const screen = (key) => {
    if (phase !== key && leaving !== key) return null;
    const isLeaving = leaving === key;
    const body = renderScreen(key);
    return (
      <div
        key={key}
        className={`acc-ob__stage${isLeaving ? ' acc-ob__stage--leaving' : ' acc-ob__stage--entering'}`}
        aria-hidden={isLeaving || undefined}
      >
        {body}
      </div>
    );
  };

  function renderScreen(key) {
    switch (key) {
      case 'intro':
        return <IntroStep onNext={() => go('name')} />;
      case 'name':
        return (
          <NameStep
            value={answers.name}
            onChange={(name) => patch({ name })}
            onNext={() => answers.name.trim() && go('teach')}
          />
        );
      case 'teach':
        return (
          <TeachStep
            name={firstName}
            subjects={answers.subjects}
            grades={answers.grades}
            onToggle={toggleIn}
            onAddSubject={(s) =>
              setAnswers((a) =>
                a.subjects.includes(s) ? a : { ...a, subjects: [...a.subjects, s] }
              )
            }
            onBack={() => go('name')}
            onNext={() => go('periods')}
          />
        );
      case 'periods':
        return (
          <PeriodsStep
            words={words}
            periods={answers.periods}
            periodNames={answers.periodNames}
            onToggle={(n) =>
              setAnswers((a) => ({
                ...a,
                periods: a.periods.includes(n)
                  ? a.periods.filter((x) => x !== n)
                  : [...a.periods, n].sort((x, y) => x - y),
              }))
            }
            onRename={(n, value) =>
              setAnswers((a) => ({ ...a, periodNames: { ...a.periodNames, [n]: value } }))
            }
            onBack={() => go('teach')}
            onNext={() => go('day')}
          />
        );
      case 'day':
        return (
          <DayStep
            endTime={answers.endTime}
            termStart={answers.termStart}
            reminders={answers.reminders}
            onPickTime={(endTime) => patch({ endTime })}
            onTermStart={(termStart) => patch({ termStart })}
            onToggleReminder={(id) =>
              setAnswers((a) => ({
                ...a,
                reminders: { ...a.reminders, [id]: !a.reminders[id] },
              }))
            }
            onBack={() => go('periods')}
            onNext={() => go(needsLocation ? 'location' : 'set')}
          />
        );
      case 'location':
        return <LocationStep onChoose={chooseLocation} busy={busy} error={error} />;
      case 'set':
        return (
          <SetStep
            summary={summary}
            lowPerformance={answers.lowPerformance}
            onLowPerformance={(on) => patch({ lowPerformance: on })}
            onRoster={() => go('roster')}
            onBoard={finish}
          />
        );
      case 'roster':
        return (
          <RosterStep
            words={words}
            students={answers.students}
            periods={answers.periods}
            periodNames={answers.periodNames}
            // So "no date of their own" can be shown as the date it is, rather
            // than as the words "start of year".
            termStart={answers.termStart}
            onTogglePeriod={(id, n) =>
              updateStudent(id, (s) => ({
                ...s,
                periods: (s.periods || []).includes(n)
                  ? (s.periods || []).filter((p) => p !== n)
                  : [...(s.periods || []), n].sort((a, b) => a - b),
              }))
            }
            draft={rosterDraft}
            onDraft={patchRosterDraft}
            // The id comes from the step, which is what lets it tell the
            // students of THIS pass from the ones already on the list.
            onAdd={({ id, name, plan }) =>
              setAnswers((a) => ({
                ...a,
                students: [
                  ...a.students,
                  {
                    id,
                    name,
                    plan,
                    accoms: [],
                    periods: [],
                    /*
                      Mid-year, a student being typed in today most likely
                      joined today, so that is the default rather than the
                      start of the year - which would manufacture days of "not
                      used" nobody owed them. Clear it from their row if they
                      have been here all along.
                    */
                    enrolledFrom: a.termStart && todayKey() > a.termStart ? todayKey() : null,
                  },
                ],
              }))
            }
            onRemove={(id) =>
              setAnswers((a) => ({ ...a, students: a.students.filter((s) => s.id !== id) }))
            }
            // Renaming in place on the review, so a typo is fixed where it is
            // noticed rather than by starting the pass again.
            onRename={(id, value) => updateStudent(id, (s) => ({ ...s, name: value }))}
            onEdit={(id) => {
              setEditingId(id);
              go('accom');
            }}
            /*
              The two shared screens of the add-student flow, answered once for
              everyone named. Unioned rather than assigned over: a period or a
              support chosen for one student from the list survives the shared
              answer.
            */
            /*
              The two shared screens, answered once for the students just named
              and unioned onto them - so a period or a support chosen for one
              from the list survives, and an earlier pass keeps its own answers
              rather than collecting this one's.
            */
            onApplyToPending={({
              ids,
              periods: chosen,
              removePeriods = [],
              setPeriods,
              enrolledFrom,
              accoms,
              replaceAccoms,
            }) =>
              setAnswers((a) => ({
                ...a,
                students: a.students.map((s) =>
                  ids.includes(s.id)
                    ? {
                        ...s,
                        /*
                          `setPeriods` REPLACES, and is what "same for all"
                          sends: the teacher has said these students sit in the
                          same class, so they end up with that list rather than
                          each keeping their own. Otherwise added and removed,
                          so unticking can actually take one off.
                        */
                        periods: setPeriods
                          ? [...setPeriods].sort((x, y) => x - y)
                          : [...new Set([...(s.periods || []), ...chosen])]
                              .filter((n) => !removePeriods.includes(n))
                              .sort((x, y) => x - y),
                        /*
                          `undefined` leaves what they had; a real value, blank
                          included, is an answer. Unlike the periods this is a
                          single field, so an untouched pass must not overwrite
                          a date that came from somewhere else.
                        */
                        enrolledFrom:
                          enrolledFrom === undefined
                            ? s.enrolledFrom || null
                            : enrolledFrom || null,
                        /*
                          Union when a pass hands the same answer to everyone it
                          named; REPLACE when the accommodations step is asking
                          about this student alone, because there the chooser is
                          their list and unticking has to be able to remove.
                        */
                        accoms: replaceAccoms
                          ? [...new Set(accoms)]
                          : [...new Set([...(s.accoms || []), ...accoms])],
                      }
                    : s
                ),
              }))
            }
            onBack={() => go('set')}
            onBoard={finish}
          />
        );
      case 'accom':
        if (!editing) return null;
        return (
          <SupportsStep
            student={editing}
            periods={answers.periods}
            periodNames={answers.periodNames}
            termStart={answers.termStart}
            onTogglePeriod={(id, n) =>
              updateStudent(id, (s) => ({
                ...s,
                periods: (s.periods || []).includes(n)
                  ? (s.periods || []).filter((p) => p !== n)
                  : [...(s.periods || []), n].sort((a, b) => a - b),
              }))
            }
            onEnrolledFrom={(id, value) =>
              updateStudent(id, (s) => ({ ...s, enrolledFrom: value || null }))
            }
            onToggle={(label) =>
              updateStudent(editing.id, (s) => ({
                ...s,
                accoms: s.accoms.includes(label)
                  ? s.accoms.filter((x) => x !== label)
                  : [...s.accoms, label],
              }))
            }
            onAddCustom={(label) =>
              updateStudent(editing.id, (s) =>
                s.accoms.includes(label) ? s : { ...s, accoms: [...s.accoms, label] }
              )
            }
            /* The paste box editing their own list rather than adding to it:
               what comes out of it IS the list, deletions included. */
            onReplaceAccoms={(labels) =>
              updateStudent(editing.id, (s) => ({ ...s, accoms: [...new Set(labels)] }))
            }
            onDone={() => go('roster')}
          />
        );
      case 'outro':
        return (
          <OutroStep
            words={words}
            name={firstName}
            studentCount={answers.students.length}
            leaving={leaving === 'outro'}
          />
        );
      default:
        return null;
    }
  }

  const PHASES = [
    'intro',
    'name',
    'teach',
    'periods',
    'day',
    'location',
    'set',
    'roster',
    'accom',
    'outro',
  ];

  return (
    <div className={`acc-ob${outroLeaving ? ' acc-ob--leaving' : ''}`} data-phase={phase}>
      <OnboardingAmbient phase={phase} />

      {/*
        The fade ending is the handover. `e.target === e.currentTarget` because
        every status line and blooming petal inside this stack also ends an
        animation here, and only this one means setup is done.
      */}
      <div
        className="acc-ob__stack"
        onAnimationEnd={(e) => {
          if (outroLeaving && e.target === e.currentTarget) handOver();
        }}
      >
        {segment > 0 && (
          <div className="acc-ob__progress" role="presentation">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className={`acc-ob__seg${i < segment ? ' acc-ob__seg--on' : ''}`} />
            ))}
          </div>
        )}

        {PHASES.map((p) => screen(p))}
      </div>
    </div>
  );
}
