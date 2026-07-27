import { useState } from 'react';
import DatePicker from './DatePicker.jsx';
import PeriodFilter from './PeriodFilter.jsx';
import Toast from '../shared/Toast.jsx';
import { SEED_MODE } from '../../domain/constants.js';

function Chevron({ down }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      className={`acc-foldall__chevron${down ? ' acc-foldall__chevron--down' : ''}`}
    >
      <path
        d="M6 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The board's tools, as a single floating row above the first lane.
 *
 * No longer a bordered bar — it sits on the board surface inside the scroll area,
 * so the lanes read as the primary content and the tools as something resting on
 * top of them.
 *
 * Left: fold-all, date, copy-yesterday. Right: close-out, periods.
 */
export default function BoardToolbar({
  dateKey,
  onDateChange,
  nonInstructionalDates,
  periods,
  selectedPeriodIds,
  onPeriodsChange,
  model,
  readOnly,
  onCopyPrevious,
  onCloseOutDay,
  allFolded,
  onToggleFoldAll,
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
        tone: 'warn',
        text: "You've already recorded something today. Copying will overwrite it.",
        confirmLabel: 'Overwrite anyway',
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
        <button
          type="button"
          className="acc-btn acc-btn--round"
          onClick={onToggleFoldAll}
          aria-label={allFolded ? 'Unfold all students' : 'Fold all students'}
          title={allFolded ? 'Unfold all students' : 'Fold all students'}
        >
          <Chevron down={!allFolded} />
        </button>

        <DatePicker
          dateKey={dateKey}
          onChange={onDateChange}
          nonInstructionalDates={nonInstructionalDates}
        />

        <button
          type="button"
          className="acc-btn"
          onClick={() => copy(SEED_MODE.STRUCTURE, false)}
          disabled={disabled}
          title="Set up today's cards the same as the last recorded day. Statuses start unassigned."
        >
          Copy yesterday
        </button>

        <div className="acc-toolbar__spacer" />

        <button
          type="button"
          className="acc-btn"
          onClick={onCloseOutDay}
          disabled={disabled || !model.hasRecord}
          title="Finish this day. Anything still unassigned is recorded as Not Used."
        >
          Close out day
        </button>

        <PeriodFilter periods={periods} selected={selectedPeriodIds} onChange={onPeriodsChange} />
      </div>

      {notice && <Toast {...notice} onDismiss={() => setNotice(null)} />}
    </>
  );
}
