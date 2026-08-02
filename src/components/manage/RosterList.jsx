import { initialsOf } from '../../domain/initials.js';

const AVATARS = ['a', 'b', 'c', 'd', 'e'];

/**
 * The list of students a pass has named so far, a row each.
 *
 * One component, two callers: setup's roster screen and the add-student sheet.
 * They were the same list drawn twice and drifted, which is how the sheet ended
 * up showing a row of flat chips - no periods to correct, no supports to choose,
 * nothing to remove - while setup showed the real thing. Shared, they cannot
 * drift again.
 *
 * Periods arrive already normalised, because the two callers hold them
 * differently: setup has numbers it has not written to a document yet, the sheet
 * has real period records with ids. Neither shape belongs in here.
 *
 * @param {object} props
 * @param {Array<{id: string, name: string, plan: string, accoms: string[], periodKeys: Array<string|number>}>} props.students
 * @param {Array<{key: string|number, label: string, title: string}>} props.periods
 */
export default function RosterList({
  students,
  periods = [],
  flagged = [],
  onTogglePeriod,
  onEdit,
  onRemove,
}) {
  if (students.length === 0) return null;

  return (
    <div className="acc-ob__roster">
      {students.map((s, i) => (
        <div
          key={s.id}
          className={`acc-ob__student acc-fade-enter${
            flagged.includes(s.id) ? ' acc-ob__student--flagged' : ''
          }`}
        >
          {/*
            Avatar colours cycle rather than hash from the name. A hash would be
            prettier in theory and unreadable in practice: two students added in
            a row can collide, and the teacher reads these as a list, where
            "different from its neighbour" is the only property that helps.
          */}
          <span className={`acc-ob__avatar acc-ob__avatar--${AVATARS[i % AVATARS.length]}`}>
            {initialsOf(s.name)}
          </span>

          <span className="acc-ob__student-text">
            <span className="acc-ob__student-line">
              <span className="acc-ob__student-name">{s.name}</span>
              <span className={`acc-ob__plan acc-ob__plan--${String(s.plan).toLowerCase()}`}>
                {s.plan}
              </span>
            </span>
            <span className="acc-ob__student-meta">
              {s.accoms.length === 0
                ? 'No supports chosen yet'
                : `${s.accoms.length} support${s.accoms.length === 1 ? '' : 's'}`}
            </span>
          </span>

          {/*
            Which class they are in, per student. The next screen answers it for
            everyone just named; this is for the one who is only in P3.
          */}
          {periods.length > 0 && (
            <span className="acc-ob__student-periods">
              {periods.map((p) => {
                const on = (s.periodKeys || []).includes(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    className={`acc-ob__pchip${on ? ' acc-ob__pchip--on' : ''}`}
                    aria-pressed={on}
                    title={`${p.title}${on ? ' - click to remove' : ''}`}
                    onClick={() => onTogglePeriod(s.id, p.key)}
                  >
                    {p.label}
                  </button>
                );
              })}
            </span>
          )}

          <button type="button" className="acc-ob__outline" onClick={() => onEdit(s.id)}>
            Choose supports
          </button>
          <button
            type="button"
            className="acc-ob__remove"
            onClick={() => onRemove(s.id)}
            aria-label={`Remove ${s.name}`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
