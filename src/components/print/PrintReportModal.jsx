import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../shared/Modal.jsx';
import PrintReport from './PrintReport.jsx';
import { useData } from '../../context/DataContext.jsx';
import { useBoard } from '../../context/BoardContext.jsx';
import { buildReport, resolveScope, schoolDaysIn, formatRangeLabel } from '../../domain/report.js';
import { todayKey } from '../../domain/dates.js';
import { pdfBridge, isDesktop } from '../../lib/bridge.js';

/**
 * Choose what to print.
 *
 * Two scopes, not three. "Everything so far" already covers the year-end case:
 * at the end of the year, everything so far IS the year, so a separate
 * "whole year" option would be a third button that does the same thing as one
 * that is already there.
 */
export default function PrintReportModal({ onClose }) {
  const { doc } = useData();
  const { periodIds, periods } = useBoard();

  const [kind, setKind] = useState('todate');
  const [from, setFrom] = useState(() => {
    const recorded = Object.keys(doc.days || {}).sort();
    return recorded[0] || todayKey();
  });
  const [to, setTo] = useState(() => todayKey());
  const [scopePeriods, setScopePeriods] = useState(periodIds);
  const [printing, setPrinting] = useState(false);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState(null);

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

  /**
   * Mount the report, let it lay out, then hand the window to the print path.
   *
   * The print stylesheet hides everything except this portal, so what reaches
   * the paper is the same DOM the preview counted - there is no second render
   * that could drift from the numbers shown here.
   *
   * Two frames before printing, not one: the first commits the portal, the
   * second is the browser's own layout pass. Printing on the first produced a
   * blank first page often enough to matter.
   */
  const run = (action) => {
    setPrinting(true);
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

  return (
    <>
      <Modal title="Print report" subtitle="What should this cover?" onClose={onClose}>
        <div className="acc-printopts">
          <div className="acc-printopts__scopes" role="radiogroup" aria-label="Report range">
            <button
              type="button"
              role="radio"
              aria-checked={kind === 'todate'}
              className={`acc-printopts__scope${kind === 'todate' ? ' acc-printopts__scope--on' : ''}`}
              onClick={() => setKind('todate')}
            >
              <span className="acc-printopts__scope-title">Everything so far</span>
              <span className="acc-printopts__scope-hint">
                From your first record through today. At the end of the year this is the whole year.
              </span>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={kind === 'range'}
              className={`acc-printopts__scope${kind === 'range' ? ' acc-printopts__scope--on' : ''}`}
              onClick={() => setKind('range')}
            >
              <span className="acc-printopts__scope-title">A range of dates</span>
              <span className="acc-printopts__scope-hint">
                For a review meeting, a quarter, or a single week.
              </span>
            </button>
          </div>

          {kind === 'range' && (
            <div className="acc-printopts__range acc-enter">
              <label className="acc-field">
                <span className="acc-field__label">From</span>
                <input
                  type="date"
                  className="acc-field__input"
                  value={from}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="acc-field">
                <span className="acc-field__label">To</span>
                <input
                  type="date"
                  className="acc-field__input"
                  value={to}
                  min={from}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
            </div>
          )}

          {periods.length > 0 && (
            <div className="acc-field">
              <span className="acc-field__label">Which periods?</span>
              <div className="acc-chipset">
                <button
                  type="button"
                  className={`acc-chip${scopePeriods.length === 0 ? ' acc-chip--on' : ''}`}
                  onClick={() => setScopePeriods([])}
                  aria-pressed={scopePeriods.length === 0}
                >
                  All
                </button>
                {periods.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`acc-chip${scopePeriods.includes(p.id) ? ' acc-chip--on' : ''}`}
                    onClick={() =>
                      setScopePeriods((prev) =>
                        prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                      )
                    }
                    aria-pressed={scopePeriods.includes(p.id)}
                  >
                    {p.shortName}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="acc-printopts__summary">
            {invalid ? (
              <span className="acc-printopts__invalid">The end date is before the start date.</span>
            ) : (
              <>
                <strong>{formatRangeLabel(resolved.from, resolved.to)}</strong> · {days.length}{' '}
                school day{days.length === 1 ? '' : 's'} · {report.students.length} student
                {report.students.length === 1 ? '' : 's'}
              </>
            )}
          </p>

          {saved && (
            <p className="acc-printopts__saved acc-fade-enter" role="status">
              Saved to <strong>{saved}</strong>.{' '}
              <button type="button" className="acc-linkbtn" onClick={() => pdfBridge.reveal(saved)}>
                Open it
              </button>
            </p>
          )}
          {error && (
            <p className="acc-printopts__error" role="status">
              That didn’t work ({error}). Your records are untouched - try again, or use Print.
            </p>
          )}

          <div className="acc-printopts__actions">
            <button type="button" className="acc-btn acc-btn--quiet" onClick={onClose}>
              Cancel
            </button>
            {/* Saving needs the desktop app; a browser tab cannot write a file. */}
            {isDesktop && (
              <button
                type="button"
                className="acc-btn"
                onClick={doSave}
                disabled={printing || invalid || days.length === 0}
              >
                Save as PDF
              </button>
            )}
            <button
              type="button"
              className="acc-btn acc-btn--primary"
              onClick={doPrint}
              disabled={printing || invalid || days.length === 0}
            >
              {printing ? 'Preparing…' : 'Print'}
            </button>
          </div>
        </div>
      </Modal>

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
