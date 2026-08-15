import { useState } from 'react';
import PeriodFilter from './PeriodFilter.jsx';
import Toast from '../shared/Toast.jsx';
import Caret from '../shared/Caret.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import { SEED_MODE } from '../../domain/constants.js';
import { formatDateMedium, formatDateLong } from '../../domain/dates.js';

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
 * Left: the roster and how much of it you can see - fold, sort, add a student.
 * Right: which slice you are looking at, and copying a day forward.
 *
 * The three-dot menu is gone. It held Copy yesterday, Close out day and the
 * day's notes: the first has its own button here, and the other two moved to
 * the header - closing out beside the date because both are about the DAY, and
 * the notes back to the menu bar. That left an unlabelled control guarding
 * nothing.
 *
 * The date is deliberately not here, for the same reason the close-out is not:
 * it sets which day the whole app is on, rather than how this board is laid
 * out, so it lives in the pill nav with the chrome.
 */
export default function BoardToolbar({
  periods,
  selectedPeriodIds,
  onPeriodsChange,
  model,
  readOnly,
  onCopyPrevious,
  onAddStudent,
  allFolded,
  onToggleFoldAll,
  activeFilters,
  sort,
  onToggleSort,
}) {
  const [notice, setNotice] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const disabled = readOnly || model.sealed;

  /**
   * Ask before writing, always.
   *
   * A dry run first, so the question can name the day it would copy and how
   * many entries it would bring - "copy 14 entries from Mon, 15 Sep?" is a
   * decision, where "copy yesterday?" is a guess. It only proceeds on a yes.
   *
   * This is not caution for its own sake. Copying statuses forward asserts
   * delivery on a day nobody has observed yet, and on a compliance record that
   * is the one class of change that should never happen from a single click.
   *
   * A dialog, not a corner toast. The toast this replaces carried the whole
   * confirmation - question, Copy button and all - in the bottom corner of a
   * board the teacher was looking at the top of, so the honest report of it was
   * that clicking the menu item did nothing. Refusals go through the same
   * dialog: every click gets an answer in the middle of the screen.
   */
  const askThenCopy = () => {
    const preview = onCopyPrevious(SEED_MODE.FULL, false, { apply: false });
    if (preview) setConfirm(preview);
  };

  const copy = (force) => {
    const result = onCopyPrevious(SEED_MODE.FULL, force);
    if (!result?.applied) return;
    setNotice({
      tone: 'ok',
      text: `Copied ${result.copied} entr${result.copied === 1 ? 'y' : 'ies'} from ${formatDateMedium(
        result.sourceDate
      )}.`,
    });
  };

  // Whether the dialog is asking a question or delivering bad news.
  const canProceed = Boolean(confirm?.applied || confirm?.reason === 'would-overwrite');

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

        {/*
          Which end of the alphabet the roster starts from. A toggle rather than
          a menu, because there are only two answers and a dropdown to choose
          between two things is a click spent on nothing.

          It sits with fold-all and add, on the left: all three are about the
          roster itself - how much of it you can see, how much of it there is,
          and in what order - rather than about which slice you are looking at.
        */}
        <button
          type="button"
          className="acc-btn acc-sortbtn"
          onClick={onToggleSort}
          aria-label={
            sort === 'az' ? 'Sorted A to Z. Switch to Z to A.' : 'Sorted Z to A. Switch to A to Z.'
          }
          title={sort === 'az' ? 'Sorted A to Z' : 'Sorted Z to A'}
        >
          <span className="acc-sortbtn__label">{sort === 'az' ? 'A-Z' : 'Z-A'}</span>
          <Caret up={sort === 'za'} />
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

        {/*
          What you are looking at, and a way out of each of it.

          The count stays put and the chips stand beside it. They used to
          REPLACE the count, which meant a filtered board could not tell you how
          many students it was showing - and only ever one appeared, so a period
          filter hid the fact that you were also on a date in September.

          A date is a filter here whenever it is not today. The date control
          itself looks identical whichever day it holds, so without this a
          teacher who wandered off today had nothing to tell them so.
        */}
        {/*
          A spacer on each side, so the chips ride in the middle of the row
          rather than trailing the roster count. They are the answer to "why am
          I not seeing everyone", which is a question asked while looking at the
          board, not while reading the controls on its left edge.
        */}
        <div className="acc-toolbar__spacer" />

        <div className="acc-toolbar__filters">
          {activeFilters.map((filter) => (
            <span className="acc-filterchip" key={filter.id}>
              <span className="acc-filterchip__kind">{filter.kind}</span>
              <span className="acc-filterchip__label">{filter.label}</span>
              <button
                type="button"
                className="acc-filterchip__clear"
                onClick={filter.onClear}
                aria-label={`Clear the ${filter.kind.toLowerCase()} filter`}
                title={
                  filter.id === 'date' || filter.id === 'dates'
                    ? 'Back to today'
                    : 'Show everyone again'
                }
              >
                {/* Drawn, not typed. The × character sits off its own centre and
                  carries the font's weight, so it never quite lines up inside a
                  circle this small. */}
                <svg viewBox="0 0 16 16" width="9" height="9" aria-hidden="true">
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </span>
          ))}
        </div>

        <div className="acc-toolbar__spacer" />

        {/*
          The period filter and the sort: the two things that decide which lanes
          exist and in what order. The date used to sit here too and has moved to
          the pill nav - it chooses which day the whole app is on, which is a
          bigger question than how this board is arranged.
        */}
        <PeriodFilter periods={periods} selected={selectedPeriodIds} onChange={onPeriodsChange} />

        {/*
          Copy yesterday, beside the period filter.

          Plain `.acc-btn` rather than `--quiet`: that variant is transparent
          with no border, which is right for a Back or a Cancel sitting next to
          a primary, and wrong here - on a row of white pills it read as a line
          of text somebody had left in the toolbar.

          Out of the three-dot menu, which is gone: close-out has its own button
          now and the day's notes went back to the menu bar, so the menu was
          guarding nothing.

          Still confirmed before it writes. See `askThenCopy` - the dialog names
          the day and the number of entries, because copying statuses forward
          asserts delivery on a day nobody has observed.
        */}
        <button
          type="button"
          className="acc-btn"
          onClick={askThenCopy}
          disabled={disabled}
          title="Bring across what you recorded on the last day you worked"
        >
          Copy Yesterday
        </button>

        {/*
          No P# button here any more. Grouping the roster by period was a toggle
          that a teacher should leave on every day - the board is read class by
          class - so it is simply how the board is ordered now. See useLaneSort.
        */}
      </div>

      {confirm && (
        <ConfirmDialog
          title={canProceed ? 'Copy your last recorded day?' : 'Nothing to copy'}
          body={
            confirm.reason === 'no-source'
              ? 'There is no earlier day with anything on it to bring forward.'
              : confirm.reason === 'sealed'
                ? 'This day is closed out, so it cannot be changed.'
                : confirm.reason === 'would-overwrite'
                  ? 'You have already recorded something today. Copying will replace it.'
                  : `This brings ${confirm.copied} entr${confirm.copied === 1 ? 'y' : 'ies'} forward from ${formatDateLong(
                      confirm.sourceDate
                    )} and records them as delivered today.`
          }
          reassurance={
            canProceed
              ? 'Notes and absences are not copied, and you can move any card afterwards.'
              : undefined
          }
          confirmLabel={
            !canProceed ? null : confirm.reason === 'would-overwrite' ? 'Replace it' : 'Copy them'
          }
          cancelLabel={canProceed ? 'Cancel' : 'Close'}
          tone={confirm.reason === 'would-overwrite' ? 'warn' : 'default'}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (canProceed) copy(true);
            setConfirm(null);
          }}
        />
      )}

      {notice && <Toast {...notice} onDismiss={() => setNotice(null)} />}
    </>
  );
}
