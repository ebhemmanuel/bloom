import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import SceneFrame from '../shared/SceneFrame.jsx';
import PrintReport from './PrintReport.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useBoard } from '../../context/BoardContext.jsx';
import { buildReport, resolveScope, schoolDaysIn, formatRangeLabel } from '../../domain/report.js';
import { todayKey } from '../../domain/dates.js';
import { pdfBridge, isDesktop } from '../../lib/bridge.js';

/**
 * Choose what to print, one question at a time. Built to
 * design_handoff_print_report/.
 *
 * Coverage, then periods, then a review of exactly what reaches the paper. It
 * was one 560px card holding scope cards, period chips, a summary line and
 * three actions, which put the least reversible thing in the app - a compliance
 * record someone will sign - behind the most crowded screen in it.
 *
 * Two scopes, not three. "Everything so far" already covers the year-end case:
 * at the end of the year, everything so far IS the year, so a separate whole
 * year option would be a third button doing what one of the others already
 * does.
 *
 * The periods step is skipped outright when the roster has none, and the dots
 * count two instead of three - a step that can only be answered one way is not
 * a step.
 */

const TIPS = {
  coverage: 'Everything so far is the safe default.',
  periods: 'Leave All periods selected for the full record.',
  review: 'Nothing is uploaded - the file is written on this computer.',
};

export default function PrintReportModal({ onClose, background, leaving = false }) {
  const { doc } = useData();
  const { periodIds, periods } = useBoard();

  const [step, setStep] = useState(0);
  const [kind, setKind] = useState('todate');
  const [from, setFrom] = useState(() => {
    const recorded = Object.keys(doc.days || {}).sort();
    return recorded[0] || todayKey();
  });
  const [to, setTo] = useState(() => todayKey());
  // Seeded from the board's own filter: printing what you are looking at is the
  // common case, and it can be widened here in one click.
  const [scopePeriods, setScopePeriods] = useState(periodIds);
  const [printing, setPrinting] = useState(false);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState(null);

  const STEPS = useMemo(
    () => (periods.length > 0 ? ['coverage', 'periods', 'review'] : ['coverage', 'review']),
    [periods.length]
  );
  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  const scope = kind === 'range' ? { kind: 'range', from, to } : { kind: 'todate' };
  const resolved = useMemo(() => resolveScope(doc, scope, new Date()), [doc, kind, from, to]);
  const days = useMemo(
    () => schoolDaysIn(doc, resolved.from, resolved.to),
    [doc, resolved.from, resolved.to]
  );
  const report = useMemo(
    () => buildReport(doc, { scope, periodIds: scopePeriods }),
    [doc, kind, from, to, scopePeriods]
  );

  const invalid = kind === 'range' && (!from || !to || from > to);
  const periodsLabel =
    scopePeriods.length === 0
      ? 'All periods'
      : periods
          .filter((p) => scopePeriods.includes(p.id))
          .map((p) => p.shortName)
          .join(', ');

  /**
   * Mount the report, let it lay out, then hand the window to the print path.
   *
   * The print stylesheet hides everything except this portal, so what reaches
   * the paper is the same DOM the review counted - there is no second render
   * that could drift from the numbers shown here.
   *
   * Two frames before printing, not one: the first commits the portal, the
   * second is the browser's own layout pass. Printing on the first produced a
   * blank first page often enough to matter.
   */
  const run = (action) => {
    setPrinting(true);
    setError(null);
    requestAnimationFrame(() =>
      requestAnimationFrame(async () => {
        try {
          const result = await action();
          if (result?.ok && result.path) setSaved(result.path);
          else if (result && !result.ok && !result.canceled) setError(result.reason || 'failed');
        } finally {
          setPrinting(false);
        }
      })
    );
  };

  // Portrait: the sheet runs dates down the page, so the growing axis is the
  // tall one. See the @page rule in the print styles.
  const doPrint = () => run(() => pdfBridge.print({ landscape: false }));
  const doSave = () =>
    run(() => pdfBridge.export({ from: resolved.from, to: resolved.to, landscape: false }));

  const blocked = printing || invalid || days.length === 0;

  const dots = saved ? null : (
    <div className="acc-wiz__dots">
      {STEPS.map((id, i) => (
        <button
          key={id}
          type="button"
          className={`acc-wiz__dot${i === step ? ' acc-wiz__dot--on' : ''}${
            i < step ? ' acc-wiz__dot--past' : ''
          }`}
          title={id}
          aria-label={id}
          aria-current={i === step ? 'step' : undefined}
          disabled={i >= step}
          onClick={() => i < step && setStep(i)}
        />
      ))}
    </div>
  );

  const footer = saved ? null : (
    <>
      {/* Hidden rather than removed on the first step, so the tip stays put. */}
      <div className="acc-sheet__footside">
        {step > 0 && (
          <button
            type="button"
            className="acc-btn acc-btn--quiet"
            onClick={() => setStep(Math.max(0, step - 1))}
          >
            Back
          </button>
        )}
      </div>

      <span className="acc-sheet__tip">{TIPS[current]}</span>

      {last ? (
        <div className="acc-print__actions">
          {/* Saving needs the desktop app; a browser tab cannot write a file. */}
          {isDesktop && (
            <button type="button" className="acc-btn" onClick={doSave} disabled={blocked}>
              Save as PDF
            </button>
          )}
          <button
            type="button"
            className="acc-btn acc-btn--primary"
            onClick={doPrint}
            disabled={blocked}
          >
            {printing ? 'Preparing…' : 'Print'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="acc-btn acc-btn--primary"
          onClick={() => setStep(step + 1)}
          disabled={invalid}
        >
          Next
        </button>
      )}
    </>
  );

  return (
    <>
      <SceneFrame
        label="Print report"
        background={background}
        leaving={leaving}
        onClose={onClose}
        wide
        head={dots}
        footer={footer}
      >
        <div className="acc-sheet__view" key={saved ? 'saved' : current}>
          {saved ? (
            <div className="acc-wiz__done">
              <span className="acc-wiz__tick" aria-hidden="true">
                ✓
              </span>
              <h1 className="acc-sheet__title acc-wiz__title--done">Saved</h1>
              <p className="acc-sheet__sub acc-sheet__sub--balance">
                The PDF covering <strong>{formatRangeLabel(resolved.from, resolved.to)}</strong> was
                written to {saved}. Nothing left this computer.
              </p>
              <div className="acc-wiz__doneactions">
                <button type="button" className="acc-btn acc-btn--primary" onClick={onClose}>
                  Done
                </button>
                <button
                  type="button"
                  className="acc-btn acc-btn--quiet"
                  onClick={() => pdfBridge.reveal(saved)}
                >
                  Open it
                </button>
              </div>
            </div>
          ) : current === 'coverage' ? (
            <div className="acc-sheet__pane acc-print__pane">
              <div className="acc-sheet__intro acc-sheet__intro--center">
                <h1 className="acc-sheet__title">What should this report cover?</h1>
                <p className="acc-sheet__sub">
                  The report is the printable compliance record: one page per student, dates down
                  the page, a column for each accommodation.
                </p>
              </div>

              <div className="acc-print__scopes" role="radiogroup" aria-label="Report range">
                <button
                  type="button"
                  role="radio"
                  aria-checked={kind === 'todate'}
                  className={`acc-print__scope${kind === 'todate' ? ' acc-print__scope--on' : ''}`}
                  onClick={() => setKind('todate')}
                >
                  <span className="acc-print__scope-title">Everything so far</span>
                  <span className="acc-print__scope-hint">
                    From your first record through today. At the end of the year this is the whole
                    year, so there is no separate whole-year option.
                  </span>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={kind === 'range'}
                  className={`acc-print__scope${kind === 'range' ? ' acc-print__scope--on' : ''}`}
                  onClick={() => setKind('range')}
                >
                  <span className="acc-print__scope-title">A range of dates</span>
                  <span className="acc-print__scope-hint">
                    For a review meeting, a quarter, or a single week. Set the first and last day on
                    the next line.
                  </span>
                </button>
              </div>

              {kind === 'range' && (
                <div className="acc-print__range">
                  <div className="acc-print__dates">
                    <label className="acc-print__datefield">
                      <span className="acc-wiz__label">From</span>
                      <input
                        type="date"
                        className="acc-print__date"
                        value={from}
                        max={to}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                    </label>
                    <label className="acc-print__datefield">
                      <span className="acc-wiz__label">To</span>
                      <input
                        type="date"
                        className="acc-print__date"
                        value={to}
                        min={from}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    </label>
                  </div>

                  {invalid ? (
                    <p className="acc-print__invalid">The end date is before the start date.</p>
                  ) : (
                    <p className="acc-wiz__hint">
                      Weekends and non-instructional days are left out automatically.
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : current === 'periods' ? (
            <div className="acc-sheet__pane acc-print__pane">
              <div className="acc-sheet__intro acc-sheet__intro--center">
                <h1 className="acc-sheet__title">Which periods should it include?</h1>
                <p className="acc-sheet__sub">
                  For a meeting about one class, narrow it to that period. This only changes what
                  prints - every period stays in the record.
                </p>
              </div>

              {/*
                Empty means all, which is also how the board's own filter reads.
                Turning the last period off returns to All rather than to a
                report with nobody on it.
              */}
              <div className="acc-print__chips">
                <button
                  type="button"
                  className={`acc-chip acc-chip--lg${scopePeriods.length === 0 ? ' acc-chip--on' : ''}`}
                  onClick={() => setScopePeriods([])}
                  aria-pressed={scopePeriods.length === 0}
                >
                  All periods
                </button>
                {periods.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`acc-chip acc-chip--lg${
                      scopePeriods.includes(p.id) ? ' acc-chip--on' : ''
                    }`}
                    onClick={() =>
                      setScopePeriods((prev) =>
                        prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                      )
                    }
                    aria-pressed={scopePeriods.includes(p.id)}
                    title={p.name}
                  >
                    {p.shortName}
                  </button>
                ))}
              </div>

              <p className="acc-wiz__hint">
                Students outside the chosen periods are left off this report.
              </p>
            </div>
          ) : (
            <div className="acc-sheet__pane acc-print__pane">
              <div className="acc-sheet__intro acc-sheet__intro--center">
                <h1 className="acc-sheet__title">Ready to print</h1>
                <p className="acc-sheet__sub">
                  Check the coverage - this is exactly what reaches the paper.
                </p>
              </div>

              <div className="acc-print__card">
                <div className="acc-print__cardhead">
                  <div className="acc-print__rangeline">
                    <span className="acc-print__range-label">
                      {formatRangeLabel(resolved.from, resolved.to)}
                    </span>
                    <span className="acc-wiz__edit">
                      <span className="acc-wiz__editlabel">Edit</span>
                      <button
                        type="button"
                        className="acc-wiz__editlink"
                        onClick={() => setStep(0)}
                      >
                        Coverage
                      </button>
                      {periods.length > 0 && (
                        <>
                          <span className="acc-wiz__editdot" aria-hidden="true" />
                          <button
                            type="button"
                            className="acc-wiz__editlink"
                            onClick={() => setStep(1)}
                          >
                            Periods
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                  <span className="acc-wiz__meta">
                    {days.length} school day{days.length === 1 ? '' : 's'} ·{' '}
                    {report.students.length} student{report.students.length === 1 ? '' : 's'} ·{' '}
                    {periodsLabel}
                  </span>
                </div>

                <div className="acc-print__cardbody">
                  <span className="acc-wiz__label">What prints</span>
                  <p className="acc-print__what">
                    One page per student: dates down the page, a column for each accommodation, and
                    the day&rsquo;s status shown by glyph and text so the sheet survives a
                    monochrome photocopier. Each student closes with their totals; the record closes
                    with a signature and date line.
                  </p>
                </div>
              </div>

              {/* Amber, never danger red. An empty range is a fact about the
                  dates, not a failure by the teacher. */}
              {days.length === 0 && (
                <p className="acc-print__empty">
                  There are no school days in this range, so there is nothing to print yet.
                </p>
              )}

              {error && (
                <p className="acc-print__error" role="status">
                  That didn&rsquo;t work ({error}). Your records are untouched - try again, or use
                  Print.
                </p>
              )}
            </div>
          )}
        </div>
      </SceneFrame>

      {/* Only in the document while printing, so it never affects normal layout. */}
      {printing &&
        createPortal(
          <div className="acc-print-root">
            <PrintReport report={report} />
          </div>,
          document.body
        )}
    </>
  );
}
