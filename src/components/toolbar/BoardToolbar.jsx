import { useState } from 'react';
import DatePicker from './DatePicker.jsx';
import PeriodFilter from './PeriodFilter.jsx';
import StudentSearch from './StudentSearch.jsx';
import SaveStatusPill from '../shared/SaveStatusPill.jsx';
import { SEED_MODE } from '../../domain/constants.js';

export default function BoardToolbar({
  dateKey,
  onDateChange,
  nonInstructionalDates,
  periods,
  selectedPeriodIds,
  onPeriodsChange,
  search,
  onSearchChange,
  model,
  readOnly,
  onCopyPrevious,
  onCloseOutDay,
  onCollapseAll,
  onExpandAll,
}) {
  const [notice, setNotice] = useState(null);
  const disabled = readOnly || model.sealed;

  const copy = (mode, force) => {
    const result = onCopyPrevious(mode, force);
    if (!result) return;

    if (result.applied) {
      setNotice({
        tone: 'ok',
        text:
          mode === SEED_MODE.FULL
            ? `Copied ${result.copied} entr${result.copied === 1 ? 'y' : 'ies'} from ${result.sourceDate}.`
            : `Set up today's cards from ${result.sourceDate}. Statuses start unassigned.`,
      });
      return;
    }

    if (result.reason === 'would-overwrite') {
      setNotice({
        tone: 'confirm',
        text: "You've already recorded something today. Copying will overwrite it.",
        onConfirm: () => copy(mode, true),
      });
    } else if (result.reason === 'no-source') {
      setNotice({ tone: 'warn', text: 'No earlier day with a record to copy from.' });
    } else if (result.reason === 'sealed') {
      setNotice({ tone: 'warn', text: 'This day is closed out.' });
    }
  };

  return (
    <>
      <div className="acc-toolbar">
        <DatePicker
          dateKey={dateKey}
          onChange={onDateChange}
          nonInstructionalDates={nonInstructionalDates}
        />

        <PeriodFilter periods={periods} selected={selectedPeriodIds} onChange={onPeriodsChange} />

        <StudentSearch
          value={search}
          onChange={onSearchChange}
          matchCount={model.laneCount}
          hiddenCount={model.hiddenBySearch}
        />

        <div className="acc-toolbar__actions">
          <button type="button" className="acc-btn acc-btn--quiet" onClick={onCollapseAll}>
            Fold all
          </button>
          <button type="button" className="acc-btn acc-btn--quiet" onClick={onExpandAll}>
            Unfold all
          </button>

          <button
            type="button"
            className="acc-btn"
            onClick={() => copy(SEED_MODE.STRUCTURE, false)}
            disabled={disabled}
            title="Set up today's cards the same as the last recorded day. Statuses start unassigned."
          >
            Copy yesterday
          </button>

          <button
            type="button"
            className="acc-btn"
            onClick={onCloseOutDay}
            disabled={disabled || !model.hasRecord}
            title="Finish this day. Anything still unassigned is recorded as Not Used."
          >
            Close out day
          </button>
        </div>

        <SaveStatusPill />
      </div>

      {model.detailsMissing > 0 && (
        <div className="acc-banner acc-banner--warn acc-fade-enter">
          {model.detailsMissing} card{model.detailsMissing === 1 ? '' : 's'} marked “used with
          detail” {model.detailsMissing === 1 ? 'has' : 'have'} no detail written. Those print as an
          unsupported claim.
        </div>
      )}

      {notice && (
        <div className={`acc-banner acc-banner--${notice.tone} acc-fade-enter`}>
          <span>{notice.text}</span>
          <span className="acc-banner__actions">
            {notice.onConfirm && (
              <button
                type="button"
                className="acc-btn acc-btn--small"
                onClick={() => {
                  const run = notice.onConfirm;
                  setNotice(null);
                  run();
                }}
              >
                Overwrite anyway
              </button>
            )}
            <button
              type="button"
              className="acc-btn acc-btn--small acc-btn--quiet"
              onClick={() => setNotice(null)}
            >
              Dismiss
            </button>
          </span>
        </div>
      )}
    </>
  );
}
