import { useEffect, useRef, useState } from 'react';
import PeriodFilter from './PeriodFilter.jsx';
import Caret from '../shared/Caret.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import { SEED_MODE } from '../../domain/constants.js';
import { formatDateLong } from '../../domain/dates.js';

/*
  How long the dialog holds each beat.

  Both are for the person, not the machine: the write is synchronous and lands
  inside a frame. WORK is long enough for the bar to be seen as a bar rather
  than a flicker; SETTLE lets the board's own cascade get under way behind the
  scrim before the dialog changes what it says, so the two do not fight for the
  same instant.
*/
/**
 * How long a filter chip takes to clear after it stops applying.
 *
 * `--acc-dur-normal`, plus a frame's grace. Matches `.acc-filterchip--leaving`.
 */
const CHIP_EXIT_MS = 300;

const COPY_WORK_MS = 620;
const COPY_SETTLE_MS = 260;

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
  const [confirm, setConfirm] = useState(null);
  /*
    A day with no board has no controls.

    Two ways that happens: a weekend or non-instructional date, which carries
    nothing to record at all, and a day nobody has started yet - a Thursday in
    three weeks, say. Both show an empty state where the lanes would be, so
    fold, sort, add, the roster count, the filter and Copy Yesterday were
    answering questions about lanes that are not there.

    Fold, sort, add, the roster count, the filter and Copy Yesterday all
    answered questions about a board that is not there - a sort order for no
    lanes, a count of students none of whom can be recorded today. Offering them
    made the empty state look like a board that had merely been filtered down to
    nothing.

    The filter chips stay. They are the answer to "why am I looking at this",
    and the date chip is how a teacher gets back.

    Note this takes Copy Yesterday away from the no-record case, which was one
    way to populate such a day. The empty state's own "Start a record for this
    day" is the other, and it is the one standing in front of the teacher.
  */
  const noBoard = model.noClassToday || !model.hasRecord;
  // null, or { step: 'working' } / { step: 'done', result }. See `copy`.
  const [phase, setPhase] = useState(null);
  const copyTimers = useRef([]);
  const disabled = readOnly || model.sealed;

  // Unmounting mid-copy must not leave a timer holding a setState. The write
  // itself is already committed by then; only the dialog's own steps are lost.
  useEffect(() => () => copyTimers.current.forEach(clearTimeout), []);

  /**
   * The chips, held on screen long enough to leave.
   *
   * Clearing a filter dropped its chip in the same frame the board rebuilt
   * around it, so the one element explaining WHY the board looked like that
   * vanished at the exact moment the board changed. Arriving was the same in
   * reverse.
   *
   * Keyed off a string of the ids rather than the array: `activeFilters` is
   * rebuilt every render, so depending on it directly would re-run this
   * forever.
   */
  const filterKey = activeFilters.map((f) => `${f.id}:${f.label}`).join('|');
  const [chips, setChips] = useState(() => activeFilters.map((f) => ({ ...f, leaving: false })));
  const chipTimers = useRef({});

  useEffect(() => () => Object.values(chipTimers.current).forEach(clearTimeout), []);

  useEffect(() => {
    const live = new Set(activeFilters.map((f) => f.id));

    setChips((prev) => {
      const going = prev.filter((c) => !live.has(c.id));

      going.forEach((c) => {
        if (chipTimers.current[c.id]) return;
        chipTimers.current[c.id] = setTimeout(() => {
          delete chipTimers.current[c.id];
          setChips((cur) => cur.filter((x) => x.id !== c.id));
        }, CHIP_EXIT_MS);
      });

      // Live chips first, in their own order, then whatever is on its way out.
      return [
        ...activeFilters.map((f) => ({ ...f, leaving: false })),
        ...going.map((c) => ({ ...c, leaving: true })),
      ];
    });

    // A chip that comes BACK while it was leaving keeps its timer, which would
    // then remove the live one. Cancel any timer whose filter has returned.
    activeFilters.forEach((f) => {
      if (chipTimers.current[f.id]) {
        clearTimeout(chipTimers.current[f.id]);
        delete chipTimers.current[f.id];
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

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

  /**
   * Ask, work, done: three states of one dialog rather than a dialog and a
   * toast in the corner.
   *
   * The old flow tore the dialog away on the click and repainted a whole board
   * of cards in the same frame, which is a lot of movement to explain with a
   * message that appears somewhere else. Holding the box open through the write
   * gives the change somewhere to happen behind, and gives the teacher one
   * place to look for what happened.
   *
   * The pauses are real waiting for a person, not for the machine. Copying a
   * day is a handful of object spreads and lands faster than a frame, so
   * without them the working state would flash by unread and the done state
   * would be indistinguishable from the jump this replaces.
   */
  const copy = (force) => {
    setPhase({ step: 'working' });

    copyTimers.current.push(
      setTimeout(() => {
        const result = onCopyPrevious(SEED_MODE.FULL, force);

        if (!result?.applied) {
          // Nothing was written, so there is nothing to celebrate. Close and
          // leave the board as it was.
          setPhase(null);
          return;
        }

        // The board is repainting behind the dialog right now. Let that land
        // before the box changes what it says, or both happen at once and the
        // whole point of the pause is lost.
        copyTimers.current.push(
          setTimeout(() => setPhase({ step: 'done', result }), COPY_SETTLE_MS)
        );
      }, COPY_WORK_MS)
    );
  };

  // Whether the dialog is asking a question or delivering bad news.
  const canProceed = Boolean(confirm?.applied || confirm?.reason === 'would-overwrite');

  const closeCopy = () => {
    copyTimers.current.forEach(clearTimeout);
    copyTimers.current = [];
    setConfirm(null);
    setPhase(null);
  };

  /**
   * What the one dialog says right now.
   *
   * Built as data so the three steps read as three states of the same thing
   * rather than three components that happen to look alike, and so the element
   * below stays a single mounted node across all of them.
   */
  const dialog = (() => {
    if (phase?.step === 'working') {
      return {
        step: 'working',
        title: 'Copying…',
        body: 'Bringing your last recorded day forward.',
        busy: true,
        onCancel: closeCopy,
      };
    }

    if (phase?.step === 'done') {
      const { copied, sourceDate } = phase.result;
      return {
        step: 'done',
        title: 'Copied',
        body: `${copied} entr${copied === 1 ? 'y is' : 'ies are'} now on this day, brought forward from ${formatDateLong(sourceDate)}.`,
        // No reassurance line. It belongs on the ask, where a teacher is
        // deciding and wants to know what they are not risking. Once it is done
        // there is nothing left to reassure about, and a tinted block under a
        // one-line result is just something else to read.
        // Nothing left to agree to, which turns the single remaining button
        // primary. See ConfirmDialog.
        confirmLabel: null,
        cancelLabel: 'Done',
        onCancel: closeCopy,
      };
    }

    if (!confirm) return null;

    return {
      step: 'ask',
      title: canProceed ? 'Copy your last recorded day?' : 'Nothing to copy',
      body:
        confirm.reason === 'no-source'
          ? 'There is no earlier day with anything on it to bring forward.'
          : confirm.reason === 'sealed'
            ? 'This day is closed out, so it cannot be changed.'
            : confirm.reason === 'would-overwrite'
              ? 'You have already recorded something today. Copying will replace it.'
              : `This brings ${confirm.copied} entr${confirm.copied === 1 ? 'y' : 'ies'} forward from ${formatDateLong(
                  confirm.sourceDate
                )} and records them as delivered today.`,
      reassurance: canProceed
        ? 'Notes and absences are not copied, and you can move any card afterwards.'
        : undefined,
      confirmLabel: !canProceed
        ? null
        : confirm.reason === 'would-overwrite'
          ? 'Replace it'
          : 'Copy them',
      cancelLabel: canProceed ? 'Cancel' : 'Close',
      /*
        No warn tone, even when it would replace today's work.

        Amber is this app's colour for destroying something, and it made the
        ordinary copy button mustard. Replacing is reversible - every entry
        stays a card the teacher can move - and the body already says plainly
        that it will replace. Colouring the button as a hazard on top of that
        is saying the same thing twice, in the one place a teacher would rather
        just get on with it.
      */
      tone: 'default',
      onCancel: closeCopy,
      onConfirm: () => {
        // The ask is answered; from here the same box reports on itself.
        setConfirm(null);
        if (canProceed) copy(true);
      },
    };
  })();

  return (
    <>
      <div className="acc-toolbar">
        {!noBoard && (
          <>
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
                sort === 'az'
                  ? 'Sorted A to Z. Switch to Z to A.'
                  : 'Sorted Z to A. Switch to A to Z.'
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
          </>
        )}

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

        {/*
          The chips go with the tools on a day that has no board.

          A date chip explains why the board looks narrowed - and on a Thursday
          three weeks out there is no board to have narrowed. "No record for
          this day" already says everything the chip would, and a lone tag
          floating over an empty state reads as a filter that is hiding
          something.

          The way back is the date control in the nav, which is always there.
        */}
        <div className="acc-toolbar__filters">
          {(noBoard ? [] : chips).map((filter) => (
            /*
              A slot around each chip, like the one around the sealed notice:
              the chip fades, the slot closes the width it occupied. Fading
              alone left the row holding a chip-sized hole until React dropped
              the element, and everything beside it lurched over in one frame.
            */
            <span
              className={`acc-chipslot${filter.leaving ? ' acc-chipslot--leaving' : ''}`}
              key={filter.id}
            >
              <span className={`acc-filterchip${filter.leaving ? ' acc-filterchip--leaving' : ''}`}>
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
        {!noBoard && (
          <PeriodFilter periods={periods} selected={selectedPeriodIds} onChange={onPeriodsChange} />
        )}

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
        {!noBoard && (
          <button
            type="button"
            className="acc-btn"
            onClick={askThenCopy}
            disabled={disabled}
            title="Bring across what you recorded on the last day you worked"
          >
            Copy Yesterday
          </button>
        )}

        {/*
          No P# button here any more. Grouping the roster by period was a toggle
          that a teacher should leave on every day - the board is read class by
          class - so it is simply how the board is ordered now. See useLaneSort.
        */}
      </div>

      {/*
        Ask, work, report: ONE dialog, mounted once, changing what it says.

        Rendered from a single element rather than three conditional ones so
        React keeps the same node across the steps. Three separate blocks would
        each play their own entrance, and the box would appear to leave and come
        back twice on the way through a single decision - which is the jarring
        thing this is meant to fix.

        There is no toast at the end for the same reason: a message in the
        corner reporting a change that happened in the middle of the screen asks
        the teacher to connect two things they cannot look at together.
      */}
      {dialog && (
        <ConfirmDialog
          title={dialog.title}
          body={dialog.body}
          reassurance={dialog.reassurance}
          confirmLabel={dialog.confirmLabel}
          cancelLabel={dialog.cancelLabel}
          tone={dialog.tone}
          busy={dialog.busy}
          // Names which of the three states this is, so the dialog crossfades
          // its contents and eases its height between them.
          step={dialog.step}
          // The ask hands over to the working step instead of closing, which is
          // what keeps this one box rather than two.
          dismissOnConfirm={false}
          onCancel={dialog.onCancel}
          onConfirm={dialog.onConfirm}
        />
      )}
    </>
  );
}
