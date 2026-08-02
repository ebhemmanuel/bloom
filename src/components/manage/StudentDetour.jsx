import { formatDateMedium } from '../../domain/dates.js';
import { initialsOf } from '../../domain/initials.js';
import SupportsPicker from './SupportsPicker.jsx';

// The same map the board and the sheets use, so a plan reads identically here.
const PLAN_CLASS = { IEP: 'iep', 504: '504', Other: 'other' };

export const DETOUR_STEPS = 3;

/**
 * One student, described on their own: class details, supports, confirm.
 *
 * What "Choose supports" opens. It used to be the accommodation list and
 * nothing else, which left the two facts most likely to differ per student -
 * which class they sit in, and when they joined it - answerable only for the
 * whole group. The shared screens still exist for the group; this is the same
 * three questions asked about one person.
 *
 * Three panes, no frame. Setup gives it a screen and the add-student sheet
 * shows it in place of the name pane, so each caller owns its own footer and
 * passes the pane it wants. `detourTip` and `detourLabel` keep those footers
 * saying the same thing.
 *
 * @param {object} props
 * @param {{id: string, name: string, plan: string, periodKeys: Array<string|number>, enrolledFrom: string, accoms: string[]}} props.student
 * @param {Array<{key: string|number, label: string, title: string}>} props.periods
 */
export default function StudentDetour({
  sub,
  student,
  periods = [],
  onTogglePeriod,
  onEnrolledFrom,
  onToggle,
  onAddCustom,
}) {
  if (sub === 0) {
    return (
      <div className="acc-sheet__pane acc-sheet__pane--wide">
        <div className="acc-sheet__intro acc-sheet__intro--center">
          <h1 className="acc-sheet__title">Class details for {student.name}</h1>
          <p className="acc-sheet__sub acc-sheet__sub--balance">
            Set what you know and skip the rest - all of this is editable later.
          </p>
        </div>

        <div className="acc-wiz__split">
          <div className="acc-wiz__cell acc-wiz__cell--end">
            <span className="acc-wiz__label">Which periods?</span>
            <div className="acc-wiz__chips acc-wiz__chips--end">
              {periods.map((p) => {
                const on = (student.periodKeys || []).includes(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    className={`acc-chip acc-chip--lg${on ? ' acc-chip--on' : ''}`}
                    aria-pressed={on}
                    title={p.title}
                    onClick={() => onTogglePeriod(student.id, p.key)}
                  >
                    {p.label}
                  </button>
                );
              })}
              {periods.length === 0 && (
                <span className="acc-wiz__hint">
                  You did not name any periods, so there is nothing to pick here.
                </span>
              )}
            </div>
            <span className="acc-wiz__hint">Just this student, whatever the group answer was.</span>
          </div>

          <span className="acc-wiz__rule" aria-hidden="true" />

          <div className="acc-wiz__cell">
            <span className="acc-wiz__label">Newly enrolled?</span>
            <input
              type="date"
              className="acc-wiz__date"
              value={student.enrolledFrom || ''}
              onChange={(e) => onEnrolledFrom(student.id, e.target.value)}
              aria-label={`First day in this class for ${student.name}`}
            />
            <span className="acc-wiz__hint">
              {student.enrolledFrom
                ? `Every day before ${formatDateMedium(student.enrolledFrom)} reads “not applicable - enrolled ${formatDateMedium(student.enrolledFrom)}”, so nothing is recorded against them for a class they were not in yet.`
                : 'Leave blank if they have been in this class since the start of the year.'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (sub === 1) {
    return (
      <div className="acc-sheet__pane acc-sheet__pane--wide">
        <div className="acc-sheet__intro">
          <h1 className="acc-sheet__title">What does {student.name} receive?</h1>
          <p className="acc-sheet__sub">
            Start from the common wordings below. The plan&rsquo;s exact language wins, edit
            anything later to match it.
          </p>
        </div>

        <SupportsPicker chosen={student.accoms} onToggle={onToggle} onAddCustom={onAddCustom} />
      </div>
    );
  }

  const chosen = periods.filter((p) => (student.periodKeys || []).includes(p.key));

  return (
    <div className="acc-sheet__pane">
      <div className="acc-sheet__intro acc-sheet__intro--center">
        <h1 className="acc-sheet__title">{student.name}, as you have described them</h1>
        <p className="acc-sheet__sub acc-sheet__sub--balance">
          Confirm these and you are back at the list. Nothing here is final - every part of it stays
          editable from the board.
        </p>
      </div>

      <div className="acc-wiz__card">
        <div className="acc-wiz__cardhead">
          <span className="acc-wiz__disc" aria-hidden="true">
            {initialsOf(student.name)}
          </span>
          <div className="acc-wiz__identity">
            <div className="acc-wiz__nameline">
              <span className="acc-wiz__cardname">{student.name}</span>
              <span className={`acc-pill acc-pill--${PLAN_CLASS[student.plan] || 'other'}`}>
                {student.plan}
              </span>
            </div>
            <span className="acc-wiz__meta">
              {chosen.length ? chosen.map((p) => p.label).join(', ') : 'All your periods'}
              {' · '}
              {student.enrolledFrom
                ? `Enrolled ${formatDateMedium(student.enrolledFrom)}`
                : 'Start of year'}
            </span>
          </div>
        </div>

        <div className="acc-wiz__accoms">
          <div className="acc-wiz__accomhead">
            <span className="acc-wiz__label">
              {student.accoms.length
                ? `${student.accoms.length} accommodation${student.accoms.length === 1 ? '' : 's'}`
                : 'Accommodations'}
            </span>
          </div>

          {student.accoms.length > 0 ? (
            <div className="acc-wiz__chips">
              {student.accoms.map((label) => (
                <span key={label} className="acc-wiz__accom">
                  {label}
                </span>
              ))}
            </div>
          ) : (
            <span className="acc-wiz__empty">None yet - add them any time from the board.</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** One line of guidance per pane, so both footers read the same. */
export function detourTip(sub, student) {
  if (sub === 0) return 'Just this student - the group answer stays where it is.';
  if (sub === 1) {
    return student.accoms.length === 0
      ? 'Nothing chosen yet, that is fine'
      : `${student.accoms.length} support${student.accoms.length === 1 ? '' : 's'} chosen`;
  }
  return 'This confirms them and takes you back to the list.';
}

export function detourLabel(sub) {
  return sub === DETOUR_STEPS - 1 ? 'Confirm' : 'Continue';
}
