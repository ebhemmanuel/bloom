import { useEffect, useRef, useState } from 'react';
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
 * Day-level actions, tucked behind a three-dot menu.
 *
 * "Copy yesterday" and "Close out day" are consequential and infrequent — one
 * rewrites the whole board, the other seals it read-only. Keeping them out of
 * the always-visible row means neither is a stray click away while a teacher is
 * moving cards.
 */
function OverflowMenu({ disabled, hasRecord, onCopyPrevious, onCloseOutDay }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="acc-overflow" ref={ref}>
      <button
        type="button"
        className={`acc-btn acc-btn--round${open ? ' acc-btn--on' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Day actions"
        title="Day actions"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="3.5" cy="8" r="1.35" fill="currentColor" />
          <circle cx="8" cy="8" r="1.35" fill="currentColor" />
          <circle cx="12.5" cy="8" r="1.35" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div className="acc-overflow__menu acc-enter" role="menu">
          <button
            type="button"
            role="menuitem"
            className="acc-overflow__item"
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              onCopyPrevious(SEED_MODE.STRUCTURE, false);
            }}
          >
            <span>Copy yesterday</span>
            <span className="acc-overflow__hint">
              Same cards as the last recorded day, all unassigned
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="acc-overflow__item"
            disabled={disabled || !hasRecord}
            onClick={() => {
              setOpen(false);
              onCloseOutDay();
            }}
          >
            <span>Close out day</span>
            <span className="acc-overflow__hint">
              Seals it read-only; anything unassigned records as Not Used
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The board's tools, as a single floating row above the first lane.
 *
 * Left: what you are looking at and how much of it — roster count, add, fold.
 * Right: what you are looking at it FOR — the date, the period filter, and the
 * consequential day actions behind a three-dot menu.
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
  onAddStudent,
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

        <button
          type="button"
          className="acc-btn acc-btn--round"
          onClick={onAddStudent}
          disabled={readOnly}
          aria-label="Add student"
          title="Add a student and paste their accommodations"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <span className="acc-toolbar__count acc-numeric">
          {model.laneCount} student{model.laneCount === 1 ? '' : 's'}
        </span>

        {/* Equal spacers either side keep the date optically centred in the row
            regardless of how wide the clusters beside it grow. */}
        <div className="acc-toolbar__spacer" />

        <DatePicker
          dateKey={dateKey}
          onChange={onDateChange}
          nonInstructionalDates={nonInstructionalDates}
        />

        <div className="acc-toolbar__spacer" />

        <PeriodFilter periods={periods} selected={selectedPeriodIds} onChange={onPeriodsChange} />

        <OverflowMenu
          disabled={disabled}
          hasRecord={model.hasRecord}
          onCopyPrevious={copy}
          onCloseOutDay={onCloseOutDay}
        />
      </div>

      {notice && <Toast {...notice} onDismiss={() => setNotice(null)} />}
    </>
  );
}
