import { STATUS_LABEL, STATUS_GLYPH, planClassOf } from '../../domain/constants.js';
import { formatDateColumn, formatDateMedium } from '../../domain/dates.js';
import { formatRate } from '../../domain/report.js';

/**
 * The board across a span of days.
 *
 * The kanban answers "what happened today", and no arrangement of its columns
 * answers "what happened across these days" - the day is the thing it holds
 * fixed. So a range switches the surface: one row per accommodation, one column
 * per school day, every cell saying what that day resolved to.
 *
 * It is fed by `buildReport`, the same function the printed record uses. That is
 * deliberate. A teacher checking a week on screen and then printing it must not
 * be able to get two different answers, and sharing the model is the only way to
 * guarantee that rather than hope for it.
 *
 * Read-only, on purpose. A cell here is a summary of a day, and editing a day
 * from a summary hides the context that makes the edit correct - whether the
 * student was absent, whether the teacher was out, what the note said. Clicking
 * one takes you to that day instead, where all of it is visible.
 */
export default function RangeView({ report, onPickDate }) {
  const { dates, students } = report;

  if (dates.length === 0) {
    return <p className="acc-range__empty">No school days in that span.</p>;
  }

  if (students.length === 0) {
    return <p className="acc-range__empty">No students match the current filter.</p>;
  }

  return (
    <div className="acc-range">
      {students.map((s) => (
        <section className="acc-range__student" key={s.student.id}>
          <header className="acc-range__head">
            <h3 className="acc-range__name">{s.displayName}</h3>
            <span className={`acc-pill acc-pill--${planClassOf(s.planType)}`}>{s.planType}</span>
            {s.periodNames.length > 0 && (
              <span className="acc-range__periods">{s.periodNames.join(' · ')}</span>
            )}
            <span className="acc-range__rate acc-numeric">
              {s.summary.delivered} of {s.summary.counted} · {formatRate(s.summary.addressedRate)}
            </span>
          </header>

          <div className="acc-range__scroll">
            <table className="acc-range__table">
              <thead>
                <tr>
                  <th scope="col" className="acc-range__rowhead">
                    Accommodation
                  </th>
                  {dates.map((d) => (
                    <th scope="col" key={d} className="acc-range__datehead">
                      {formatDateColumn(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.rows.map((row) => (
                  <tr key={row.assignmentId}>
                    <th scope="row" className="acc-range__rowhead">
                      {row.label}
                      {row.notRelevant && <span className="acc-range__tag">not relevant</span>}
                    </th>
                    {row.cells.map((c) => (
                      <td key={c.date} className="acc-range__cell">
                        {/*
                          Every cell names its own date and status. The glyph
                          alone is a shorthand; a teacher scanning a fortnight
                          should be able to hover any square and be told exactly
                          which day it is and what it says.
                        */}
                        <button
                          type="button"
                          className={`acc-range__mark acc-range__mark--${c.status.replace(/_/g, '-')}`}
                          title={`${formatDateMedium(c.date)} · ${STATUS_LABEL[c.status] || c.status}`}
                          aria-label={`${row.label}, ${formatDateMedium(c.date)}: ${
                            STATUS_LABEL[c.status] || c.status
                          }. Open this day.`}
                          onClick={() => onPickDate(c.date)}
                        >
                          {STATUS_GLYPH[c.status] || '·'}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
