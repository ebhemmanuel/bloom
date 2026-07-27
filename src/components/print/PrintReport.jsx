import { REPORT_LEGEND, formatRate, formatRangeLabel } from '../../domain/report.js';
import { formatDateColumn, formatDateMedium, formatDateLong } from '../../domain/dates.js';
import { PRODUCT_NAME } from '../../domain/schema.js';

/**
 * The printed compliance record.
 *
 * The AUSTERE register: black on white, hairline rules, glyphs plus text. This
 * gets photocopied, scanned and read at arm's length, so nothing here may depend
 * on colour - and it shares no markup with the board, because the board is an
 * input surface and this is a document.
 */
export default function PrintReport({ report }) {
  const { teacher, from, to, dates, students, dayContext, totals, generatedAt } = report;

  return (
    <article className="acc-print">
      <header className="acc-print__head">
        <div>
          <h1 className="acc-print__title">Daily Accommodation Record</h1>
          <p className="acc-print__sub">
            {teacher?.displayName || 'Teacher'}
            {teacher?.school ? ` · ${teacher.school}` : ''}
            {teacher?.room ? ` · Room ${teacher.room}` : ''}
            {teacher?.subjects?.length ? ` · ${teacher.subjects.join(', ')}` : ''}
            {teacher?.gradeLevels?.length ? ` · Grade ${teacher.gradeLevels.join(', ')}` : ''}
          </p>
        </div>
        <div className="acc-print__meta">
          <p>
            <strong>{formatRangeLabel(from, to)}</strong>
          </p>
          <p>
            {dates.length} school day{dates.length === 1 ? '' : 's'} · {students.length} student
            {students.length === 1 ? '' : 's'}
          </p>
          <p>Generated {formatDateMedium(generatedAt.slice(0, 10))}</p>
        </div>
      </header>

      <section className="acc-print__legend" aria-label="Key">
        {REPORT_LEGEND.map((l) => (
          <span key={l.id}>
            <b>{l.glyph}</b> {l.label}
          </span>
        ))}
      </section>

      {students.length === 0 && <p className="acc-print__empty">No students in this selection.</p>}

      {students.map((s) => (
        <section className="acc-print__student" key={s.student.id}>
          <h2 className="acc-print__student-name">
            {s.displayName}
            <span className="acc-print__student-meta">
              {s.planType}
              {s.sasid ? ` · SASID ${s.sasid}` : ''}
              {s.periodNames.length ? ` · ${s.periodNames.join(', ')}` : ''}
            </span>
          </h2>

          {/*
            Why a row of n/a runs down part of this table. Printed, not implied:
            an auditor reading a gap should not have to ask anyone what it means.
          */}
          {(s.enrolledFrom || s.unenrolledFrom) && (
            <p className="acc-print__enrolment">
              {s.enrolledFrom && `Enrolled in this class ${formatDateLong(s.enrolledFrom)}.`}
              {s.enrolledFrom && s.unenrolledFrom ? ' ' : ''}
              {s.unenrolledFrom && `Left this class ${formatDateLong(s.unenrolledFrom)}.`} Days
              outside that are shown as not applicable and are excluded from the totals below.
            </p>
          )}

          <table className="acc-print__table">
            <thead>
              <tr>
                <th scope="col" className="acc-print__col-label">
                  Accommodation
                </th>
                {dates.map((d) => (
                  <th scope="col" key={d}>
                    {formatDateColumn(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.rows.map((row) => (
                <tr key={row.assignmentId}>
                  <th scope="row" className="acc-print__col-label">
                    {row.label}
                    {row.notRelevant && <em> (not relevant to this subject)</em>}
                  </th>
                  {row.cells.map((c) => (
                    <td key={c.date} title={c.status}>
                      {c.glyph}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <p className="acc-print__summary">
            Provided {s.summary.delivered} of {s.summary.counted} applicable ·{' '}
            <strong>{formatRate(s.summary.addressedRate)}</strong> addressed
            {s.summary.counts.refused ? ` (${s.summary.counts.refused} refused)` : ''}
            {s.summary.counts.absent ? ` · ${s.summary.counts.absent} absent` : ''}
            {s.summary.counts.teacher_absent
              ? ` · ${s.summary.counts.teacher_absent} teacher absent`
              : ''}
            {s.summary.counts.no_record ? ` · ${s.summary.counts.no_record} no record` : ''}
          </p>

          {s.details.length > 0 && (
            <div className="acc-print__detail-block">
              <h3>Detail provided</h3>
              <ul>
                {s.details.map((d, i) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <li key={`${d.date}-${i}`}>
                    <b>{formatDateMedium(d.date)}</b> - {d.label}: {d.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {s.notes.length > 0 && (
            <div className="acc-print__detail-block">
              <h3>Daily notes</h3>
              <ul>
                {s.notes.map((n) => (
                  <li key={n.date}>
                    <b>{formatDateMedium(n.date)}</b> - {n.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}

      {/*
        Whole-day context last, but before the signature: a thin week needs its
        explanation on the same document as the gaps.
      */}
      {dayContext.length > 0 && (
        <section className="acc-print__student">
          <h2 className="acc-print__student-name">Day notes</h2>
          <ul className="acc-print__daylist">
            {dayContext.map((d) => (
              <li key={d.date}>
                <b>{formatDateLong(d.date)}</b>
                {d.teacherAbsence && (
                  <span className="acc-print__absence">
                    {' '}
                    - Absence: {d.teacherAbsence.reason}
                    {d.teacherAbsence.text ? `: ${d.teacherAbsence.text}` : ''}
                  </span>
                )}
                {d.notes && <div className="acc-print__daynote">{d.notes}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="acc-print__foot">
        <div className="acc-print__sign">
          <span className="acc-print__sign-line" /> Signature
        </div>
        <div className="acc-print__sign">
          <span className="acc-print__sign-line" /> Date
        </div>
        <p className="acc-print__note">
          Overall: {totals.delivered} provided of {totals.counted} applicable ·{' '}
          {formatRate(totals.addressedRate)} addressed. Read from a local file on this computer and
          not transmitted. Produced by {PRODUCT_NAME}.
        </p>
      </footer>
    </article>
  );
}
