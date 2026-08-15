import { useCallback, useEffect, useRef, useState } from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import Swimlane from './Swimlane.jsx';
import CardDetailPopover from './CardDetailPopover.jsx';
import BoardToolbar from '../toolbar/BoardToolbar.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import RangeView from './RangeView.jsx';
import useCollapsedLanes from '../../hooks/useCollapsedLanes.js';
import useCardSelection from '../../hooks/useCardSelection.js';
import useCustomScrollbar from '../../hooks/useCustomScrollbar.js';
import useSlotWords from '../../hooks/useSlotWords.js';
import useDaySwap from '../../hooks/useDaySwap.js';
import { useData } from '../../context/DataContext.jsx';
import { useBoard } from '../../context/BoardContext.jsx';
import {
  setEntryStatus,
  setEntryUseCount,
  setStudentNotes,
  toggleStudentAbsent,
  setAssignmentDefault,
  setAssignmentNotRelevant,
  setStudentEnrollment,
  renameStudent,
  applyPatches,
} from '../../domain/mutations.js';
import CardContextMenu from './CardContextMenu.jsx';
import StudentContextMenu from './StudentContextMenu.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import AddAccommodationInline from './AddAccommodationInline.jsx';
import { ensureDay, copyFromPreviousDay, copyStudentFromPreviousDay } from '../../domain/seed.js';
import { amendStudentNotes } from '../../domain/resolve.js';
import { STATUS, SEED_MODE } from '../../domain/constants.js';
import {
  todayKey,
  formatDateLong,
  formatDateMedium,
  addDays,
  isWeekend,
} from '../../domain/dates.js';

/**
 * How long the sealed notice takes to withdraw when a day is re-opened.
 *
 * `--acc-dur-normal` (260ms) plus a frame's grace. Matches
 * `.acc-banner--leaving` in _app-shell.scss: if the two drift the notice either
 * disappears mid-slide or sits invisible for a beat afterwards.
 */
const BANNER_EXIT_MS = 300;

/**
 * And how long it takes to arrive when a day is closed out.
 *
 * `--acc-dur-slow` (420ms) plus a frame's grace. Longer than the exit, as
 * everywhere else in the app: things leave briskly and arrive with more room.
 * Matches `.acc-banner--entering`.
 */
const BANNER_ENTER_MS = 460;

/** `drop:<studentId>:<status>` → parts. */
function parseDroppable(id) {
  const [, studentId, status] = id.split(':');
  return { studentId, status };
}

export default function Board({ onAddStudent, onEditStudent, onPrintStudent }) {
  const { doc, mutate, readOnly } = useData();
  // "Period" or "block", from this teacher's grades. Presentation only.
  const words = useSlotWords();

  // Date, period filter and search live in BoardContext because the Bloom shell
  // splits those controls between the pill nav and the toolbar.
  const {
    dateKey,
    setDateKey,
    periodIds,
    setPeriodIds,
    search,
    setSearch,
    sort,
    toggleSort,
    range,
    setRange,
    rangeModel,
    model,
    periods,
  } = useBoard();

  const [detailCard, setDetailCard] = useState(null);
  // Set when a standing default needs its one-time boilerplate detail.
  const [defaultPrompt, setDefaultPrompt] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [laneMenu, setLaneMenu] = useState(null);
  const [confirmUnenrol, setConfirmUnenrol] = useState(null);
  const [confirmCopy, setConfirmCopy] = useState(null);
  const [dragging, setDragging] = useState(false);
  const { collapsed, toggle, setLane, collapseAll, expandAll } = useCollapsedLanes();
  const {
    selection,
    selectionCount,
    isSelected,
    handleClick: handleSelectClick,
    clear: clearSelection,
  } = useCardSelection();
  const { scrollRef, bar, onScroll, onThumbPointerDown } = useCustomScrollbar();

  /**
   * The date-change crossfade (§5.4). Everything under the toolbar renders
   * from `view`, which trails `model` by one fade when the DATE moves and is
   * identical to it the rest of the time. Same-day edits are never delayed.
   */
  const view = useDaySwap(dateKey, model, Boolean(rangeModel));

  /**
   * Mirror drag state onto <body> so global styles (grab cursor, empty-column
   * drop hints) can react to it.
   *
   * Driven by an effect rather than set imperatively in onDragStart/onDragEnd:
   * if a drag ends abnormally and onDragEnd never fires, an imperatively-set
   * attribute sticks and the entire app is left with a grabbing cursor and drop
   * hints showing. The cleanup makes that unleakable.
   */
  useEffect(() => {
    if (!dragging) return undefined;
    document.body.setAttribute('data-dragging', 'true');
    return () => document.body.removeAttribute('data-dragging');
  }, [dragging]);

  const locked = readOnly || model.sealed;

  /**
   * The sealed notice, held on screen long enough to leave.
   *
   * Closing out and re-opening change `sealed` on the day already in view, so
   * there is no swap phase to carry the banner - React simply stopped rendering
   * it and it vanished in a frame, having arrived on an animation.
   *
   * This mirrors what `useDaySwap` does for a date change, at the scale of one
   * element: hold it mounted through its own animation either way. A day change
   * still goes through the phase classes, which take precedence; this only
   * covers the case where the same day changes its mind.
   */
  const sealed = view.model.sealed;
  const swapping = view.phase !== 'idle';

  /*
    `held` is the ONLY reason the notice outlives `sealed` going false, and it
    is set only when the day is not swapping.

    Two mechanisms were both claiming this element and fighting over it. Moving
    to an unsealed day faded the notice out with the rest of the old day, then
    the seal-change lifecycle saw `sealed` flip at the swap and mounted it AGAIN
    to play its own exit - so it vanished, flashed back, slid away a second
    time, and the space under it jumped. During a swap the phase classes own it
    outright; the lifecycle only covers a day that changes its mind in place.
  */
  const [bannerHeld, setBannerHeld] = useState(false);
  const [bannerPhase, setBannerPhase] = useState(null);
  const bannerTimer = useRef(null);
  const wasSealed = useRef(sealed);

  useEffect(() => {
    if (wasSealed.current === sealed) return undefined;
    wasSealed.current = sealed;
    clearTimeout(bannerTimer.current);

    if (swapping) {
      // The day is changing under it. Nothing to hold and nothing to play.
      setBannerHeld(false);
      setBannerPhase(null);
      return undefined;
    }

    if (sealed) {
      setBannerPhase('entering');
      bannerTimer.current = setTimeout(() => setBannerPhase(null), BANNER_ENTER_MS);
      return undefined;
    }

    setBannerHeld(true);
    setBannerPhase('leaving');
    bannerTimer.current = setTimeout(() => {
      setBannerHeld(false);
      setBannerPhase(null);
    }, BANNER_EXIT_MS);
    return undefined;
  }, [sealed, swapping]);

  useEffect(() => () => clearTimeout(bannerTimer.current), []);

  // Shown while the day says so, or while it is still leaving.
  const bannerOn = sealed || bannerHeld;

  // --- mutations ----------------------------------------------------------

  const changeStatus = useCallback(
    (card, nextStatus, detail) => {
      if (locked) return;
      mutate((d) =>
        setEntryStatus(d, dateKey, card.studentId, card.assignmentId, nextStatus, { detail })
      );
    },
    [dateKey, locked, mutate]
  );

  /**
   * Moving into "Used with Detail" applies the status immediately, then asks for
   * the narrative. `revertTo` is carried so cancelling with an empty field puts
   * the card back where it came from rather than leaving a detail-less claim.
   */
  const handleStatusChange = useCallback(
    (card, nextStatus) => {
      if (locked) return;
      changeStatus(card, nextStatus);
      if (nextStatus === STATUS.USED_WITH_DETAIL) {
        setDetailCard({ ...card, status: nextStatus, revertTo: card.status });
      }
    },
    [changeStatus, locked]
  );

  const handleDragEnd = useCallback(
    (result) => {
      const { source, destination, draggableId } = result;
      if (!destination) return;
      if (source.droppableId === destination.droppableId) return;

      const from = parseDroppable(source.droppableId);
      const to = parseDroppable(destination.droppableId);

      // Per-lane droppable types make this unreachable, but a cross-student move
      // would corrupt whose record is whose, so it is guarded regardless.
      if (from.studentId !== to.studentId) return;

      // draggableId is `card:<studentId>:<assignmentId>`.
      const [, studentId, assignmentId] = draggableId.split(':');
      const lane = model.lanes.find((l) => l.studentId === studentId);
      const card = lane && findCard(lane, assignmentId);
      if (!card) return;

      // Dragging any selected card moves the whole selection in one drop.
      const group =
        selection.studentId === studentId && selection.ids.has(assignmentId)
          ? [...selection.ids].map((id) => findCard(lane, id)).filter((c) => c && !c.notRelevant)
          : [card];

      if (group.length > 1) {
        // One batch, so a group move is a single undo step rather than N.
        mutate((d) =>
          applyPatches(
            d,
            group.map((c) => ({
              op: 'setStatus',
              dateKey,
              studentId,
              assignmentId: c.assignmentId,
              status: to.status,
            }))
          )
        );
        clearSelection();
        // Detail is only asked for on the card actually grabbed - prompting
        // once per card would be a modal pile-up.
        if (to.status === STATUS.USED_WITH_DETAIL) {
          setDetailCard({ ...card, status: to.status, revertTo: card.status });
        }
        return;
      }

      clearSelection();
      handleStatusChange(card, to.status);
    },
    [handleStatusChange, model.lanes, selection, mutate, dateKey, clearSelection]
  );

  /**
   * Notes stay writable after the day is closed.
   *
   * Gated on `readOnly` rather than `locked`: a closed day refuses status
   * changes, which are the compliance claim, but a note is context around it and
   * teachers were re-opening whole days just to add a sentence. `readOnly` is
   * the document-level lock (a file written by a newer version) and that one
   * still means no.
   *
   * Which function does the writing is decided from the doc inside `mutate`,
   * not from a render-time flag, so a day that seals between the keystroke and
   * the debounced commit still takes the right path.
   */
  const commitNotes = useCallback(
    (studentId, text) => {
      if (readOnly) return;
      mutate((d) =>
        d.days?.[dateKey]?.sealed
          ? amendStudentNotes(d, dateKey, studentId, text)
          : setStudentNotes(d, dateKey, studentId, text)
      );
    },
    [dateKey, mutate, readOnly]
  );

  /**
   * Mark absent, and fold the lane away with them.
   *
   * An absent student has nothing to record: every card resolves to `absent`
   * and the columns stop accepting drops. Leaving the lane open spends a
   * screenful on a row that cannot be worked, in the one view where a teacher is
   * scanning for what still needs doing. Marking them present unfolds it again,
   * because now there IS something to do and a lane that stayed shut would be a
   * second click nobody asked for.
   *
   * The fold is decided from the state BEFORE the toggle. `toggleStudentAbsent`
   * flips whatever it finds, so reading the lane afterwards would race the
   * mutation - and `mutate` runs its updater at render time, not here.
   */
  const handleToggleAbsent = useCallback(
    (studentId, reason = null) => {
      if (locked) return;
      const wasAbsent = Boolean(model.lanes.find((l) => l.studentId === studentId)?.absent);
      // `reason` was being dropped on the floor: the lane menu passes the one
      // the teacher picked (Out sick, TDY, Left early), and it prints on the
      // report, so losing it loses the explanation for a thin day.
      mutate((d) => toggleStudentAbsent(d, dateKey, studentId, reason));
      setLane(studentId, !wasAbsent);
    },
    [dateKey, locked, model.lanes, mutate, setLane]
  );

  const saveDetail = useCallback(
    (text) => {
      if (!detailCard) return;
      changeStatus(detailCard, STATUS.USED_WITH_DETAIL, text);
      setDetailCard(null);
    },
    [changeStatus, detailCard]
  );

  const cancelDetail = useCallback(() => {
    if (detailCard && !detailCard.detail?.trim() && detailCard.revertTo) {
      changeStatus(detailCard, detailCard.revertTo);
    }
    setDetailCard(null);
  }, [changeStatus, detailCard]);

  const startRecord = useCallback(() => {
    mutate((d) => ensureDay(d, dateKey));
  }, [dateKey, mutate]);

  /**
   * Computed against the current document, THEN applied.
   *
   * It used to run inside the `mutate` updater and read the outcome straight
   * afterwards, which cannot work: React calls an updater when it re-renders,
   * not when you hand it over, so the outcome was still null by the time it was
   * returned. The toolbar treats a null result as "nothing to report" and
   * showed nothing, so every refusal - no earlier day, would-overwrite, sealed -
   * was silent, and the whole action looked broken whether or not it had copied.
   */
  /**
   * `apply: false` runs it as a dry run.
   *
   * `copyFromPreviousDay` is pure, so asking what a copy WOULD do costs nothing
   * and returns the source date and the number of entries. That is what lets
   * the confirmation name them before anything is written.
   */
  /**
   * Copy the last recorded day forward, and let the board show it arriving.
   *
   * `copyPulse` keys the lanes container, which restarts the cascade the lanes
   * already use when the date changes - so a copy fades its cards in rather
   * than swapping a whole board of statuses between two frames while the
   * teacher is looking at a dialog.
   *
   * This is the one non-date event that gets to re-cascade. The budget in §4.4
   * of the design doc rules out replaying it for search and filter, and rightly:
   * those change which lanes you can SEE. A copy changes what the record SAYS,
   * on every lane at once, which is exactly the case the animation exists for.
   */
  const [copyPulse, setCopyPulse] = useState(0);
  /*
    Whether that cascade is still running.

    Separate from the counter, and it has to be: the counter keys the container
    so a copy remounts it, but the CLASS must not outlive the animation. Left on
    permanently it out-specified the day-change fade below, so once a teacher had
    copied anything, every later date change played the copy's cascade instead of
    the crossfade - two different transitions for the same gesture depending on
    something they did ten minutes earlier.
  */
  const [copyCascading, setCopyCascading] = useState(false);
  const copyCascadeTimer = useRef(null);
  useEffect(() => () => clearTimeout(copyCascadeTimer.current), []);

  const copyPrevious = useCallback(
    (mode = SEED_MODE.FULL, force = false, { apply = true } = {}) => {
      const result = copyFromPreviousDay(doc, dateKey, { mode, force });
      if (apply && result.applied) {
        mutate(() => result.doc);
        setCopyPulse((n) => n + 1);
        setCopyCascading(true);
        clearTimeout(copyCascadeTimer.current);
        // The animation plus the last lane's delay, with a little room.
        copyCascadeTimer.current = setTimeout(() => setCopyCascading(false), 1000);
      }
      return result;
    },
    [doc, dateKey, mutate]
  );

  /** The same thing for one student, from their lane menu. */
  const copyPreviousForStudent = useCallback(
    (studentId, force = false, { apply = true } = {}) => {
      const result = copyStudentFromPreviousDay(doc, dateKey, studentId, { force });
      if (apply && result.applied) mutate(() => result.doc);
      return result;
    },
    [doc, dateKey, mutate]
  );

  /*
    Closing and re-opening a day used to live here, behind the sealed banner's
    own button. It is CloseOutDayButton's now - one control, in the header
    beside the date - so the handler and its two domain imports have gone with
    the button that called them.
  */

  // --- context menu -------------------------------------------------------

  const openContextMenu = useCallback((card, x, y) => setContextMenu({ card, x, y }), []);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleSetUseCount = useCallback(
    (card, count) => {
      if (locked) return;
      mutate((d) => setEntryUseCount(d, dateKey, card.studentId, card.assignmentId, count));
    },
    [dateKey, locked, mutate]
  );

  const handleSetNotRelevant = useCallback(
    (card, value) => {
      if (readOnly) return;
      mutate((d) =>
        setAssignmentNotRelevant(d, card.assignmentId, value, { applyToDate: dateKey })
      );
      clearSelection();
    },
    [dateKey, mutate, readOnly, clearSelection]
  );

  const commitDefault = useCallback(
    (card, status, detail) => {
      mutate((d) =>
        setAssignmentDefault(d, card.assignmentId, status, {
          detail,
          // Apply to the day in view too, so the change is visible immediately
          // rather than only showing up tomorrow.
          applyToDate: dateKey,
        })
      );
    },
    [dateKey, mutate]
  );

  /**
   * Set a standing default - and make it actually standing.
   *
   * The point of a default is that the teacher stops doing this. So when the
   * accommodation is one that requires a written detail, we ask for that detail
   * ONCE, here, and store it as the default's own text. Every day seeded from it
   * then arrives already written and never flags "detail needed" again.
   *
   * A single day can still be edited by clicking its card; this only sets what
   * each new day starts as.
   */
  const handleSetDefault = useCallback(
    (card, status) => {
      if (readOnly) return;

      const needsStandingDetail =
        status && card.requiresDetail && !(card.detail || '').trim() && !(card.defaultDetail || '');

      if (needsStandingDetail) {
        setDefaultPrompt({ card, status });
        return;
      }

      commitDefault(card, status, status ? card.detail || card.defaultDetail || '' : '');
    },
    [commitDefault, readOnly]
  );

  const saveDefaultDetail = useCallback(
    (text) => {
      if (!defaultPrompt) return;
      commitDefault(defaultPrompt.card, defaultPrompt.status, text);
      setDefaultPrompt(null);
    },
    [commitDefault, defaultPrompt]
  );

  /**
   * The "+ Add accommodation" affordance at the end of each Unassigned column.
   * Hidden on sealed days and for absent students - neither is a moment to be
   * adding new obligations.
   */
  const renderAddAccommodation = useCallback(
    (lane, columnId) => {
      if (columnId !== STATUS.UNASSIGNED) return null;
      if (locked || lane.absent) return null;
      return <AddAccommodationInline studentId={lane.studentId} dateKey={dateKey} />;
    },
    [locked, dateKey]
  );

  // --- render -------------------------------------------------------------

  /**
   * Every narrowing currently in force, each with its own way out.
   *
   * A list rather than the single chip this replaces. More than one of these can
   * be true at once - a period AND a date, say - and showing only the first left
   * the others invisible and unreachable.
   *
   * A date counts as a filter whenever it is not today. It narrows the board
   * exactly as a search does, and a teacher who wandered to a Tuesday in
   * September had nothing to tell them so except the date control itself, which
   * looks the same whichever day it holds.
   */
  const today = todayKey();
  const activeFilters = [];

  if (range) {
    activeFilters.push({
      id: 'dates',
      kind: 'Dates',
      // The medium form, not the report's long one. "Monday, July 20, 2026 –
      // Friday, July 24, 2026" is 43 characters in a chip that ellipsises at
      // 30, so the end of the range - the half a teacher is checking - was the
      // half that got cut.
      label:
        range.from === range.to
          ? formatDateMedium(range.from)
          : `${formatDateMedium(range.from)} – ${formatDateMedium(range.to)}`,
      // Clearing a range has to move the date too. The range replaces the day
      // board outright, so dropping it falls back to whatever `dateKey` was
      // underneath - some day the teacher last looked at, with no sign that is
      // where they now are. Today is the only answer that is never a surprise.
      onClear: () => {
        setRange(null);
        setDateKey(today);
      },
    });
  } else if (dateKey !== today) {
    activeFilters.push({
      id: 'date',
      kind: 'Date',
      label: formatDateMedium(dateKey),
      onClear: () => setDateKey(today),
    });
  }

  if (search.trim()) {
    activeFilters.push({
      id: 'student',
      kind: 'Student',
      label: search.trim(),
      onClear: () => setSearch(''),
    });
  }

  if (periodIds.length) {
    activeFilters.push({
      id: 'periods',
      kind: periodIds.length === 1 ? words.One : words.Many,
      label:
        periodIds.length === 1
          ? periods.find((p) => p.id === periodIds[0])?.name || words.One
          : `${periodIds.length} selected`,
      onClear: () => setPeriodIds([]),
    });
  }

  const toolbar = (
    <BoardToolbar
      periods={periods}
      selectedPeriodIds={periodIds}
      onPeriodsChange={setPeriodIds}
      /*
        The BUFFERED day, not the live one.

        Its content was reading `model` while its animation followed `view`, so
        picking a date re-rendered the strip as the new day and then played the
        old day's exit over it - stepping from a bare day to one with a board
        made the tools pop in, fade out, and come back. What it shows and what
        it is doing now agree.
      */
      model={view.model}
      readOnly={readOnly}
      onCopyPrevious={copyPrevious}
      onAddStudent={onAddStudent}
      activeFilters={activeFilters}
      sort={sort}
      onToggleSort={toggleSort}
      allFolded={model.lanes.length > 0 && model.lanes.every((l) => collapsed.has(l.studentId))}
      onToggleFoldAll={() =>
        model.lanes.every((l) => collapsed.has(l.studentId))
          ? expandAll()
          : collapseAll(model.lanes.map((l) => l.studentId))
      }
    />
  );

  return (
    <div className="acc-board">
      {/*
        From the buffered view, so it appears with the sealed day it describes
        rather than a fade ahead of it - and carrying the SAME phase class the
        day below it wears.

        It sits outside `.acc-board__day` because it belongs above the scroll
        area rather than inside it, which meant it was the one piece of the day
        that cut instead of fading: clear a date filter while on a closed day
        and the notice vanished in a frame while everything under it crossfaded.
        Sharing the phase puts it back in step without moving it.

        Nothing at all at rest. It used to fall back to `acc-fade-enter` when
        the phase cleared, which changes `animation-name` and therefore
        RESTARTS - so the notice cascaded into place and then immediately faded
        in again on top of itself. A first appearance is covered by the board's
        own arrival cascade, which now includes this banner.
      */}
      {bannerOn && (
        /*
          A slot around it, so the space closes as the notice leaves.

          Sliding the banner alone left its height reserved until React dropped
          it, and everything below snapped up in one frame at the end - the
          notice animated and the board it sits on cut. The slot is a grid whose
          single row runs 1fr to 0fr, which collapses without anyone having to
          measure a height or hard-code one.

          It follows the day's phase FIRST and the seal change second, in the
          same order the banner does. Keyed off the seal alone it did nothing
          when stepping between two days that were both closed out - `sealed`
          never changed, so the space opened at full height in one frame while
          the notice slid into it, which is the cut this was supposed to remove.
        */
        <div
          className={`acc-banner-slot${
            view.phase !== 'idle'
              ? ` acc-banner-slot--${view.phase === 'in' ? 'entering' : 'leaving'}`
              : bannerPhase
                ? ` acc-banner-slot--${bannerPhase}`
                : ''
          }`}
        >
          <div
            className={`acc-banner acc-banner--sealed${
              view.phase !== 'idle'
                ? ` acc-board__day--${view.phase}`
                : bannerPhase
                  ? ` acc-banner--${bannerPhase}`
                  : ''
            }`}
          >
            {/*
            Six words, centred, and nothing else.

            It carried its own Re-open button on the right for a while, which
            was the only way back before the nav had one. Now that Close out Day
            lives beside the date and turns into Re-open Day on a sealed day,
            this one was a second control doing the same job six inches away -
            with different capitalisation, which reads as two different things
            rather than one.

            What is left is a statement of fact, so it sits in the middle rather
            than at the left edge with an empty bar stretching away from it.
          */}
            <span>This day is closed out and read-only.</span>
          </div>
        </div>
      )}

      <DragDropContext
        onDragStart={() => setDragging(true)}
        onDragEnd={(result) => {
          setDragging(false);
          handleDragEnd(result);
        }}
      >
        {/*
          Pinned above the scroller rather than inside it.

          The toolbar used to be the first child of the scroll area, so the day,
          the period filter and the search scrolled away the moment a teacher
          moved down a roster of thirty - and those are the controls you reach
          for BECAUSE you are looking at a long list. Only the lanes move now.
        */}
        {/*
          Second rung of the day's cascade: notice, tools, students.

          It is a sibling of `.acc-board__day` rather than inside it - the tools
          must not scroll away with the rows - so like the banner it carries the
          phase class itself.

          It moves; it never goes MISSING. Absent-on-a-date-change was a
          separate fault: the strip held at opacity 0 for the whole out phase
          while that phase was 600ms long. The rungs are tight now and the phase
          is only as long as the ladder needs. The one time the tools are gone
          is a day with no board at all - see `noBoard` in BoardToolbar.
        */}
        <div
          className={`acc-board__top${
            view.phase !== 'idle' ? ` acc-board__day--${view.phase}` : ''
          }`}
        >
          {toolbar}
        </div>

        <div className="acc-board__scroll" ref={scrollRef} onScroll={onScroll}>
          {/*
            A range replaces the day board rather than filtering it. The kanban
            holds the day fixed by construction, so there is no arrangement of
            its columns that could show several.
          */}
          {rangeModel ? (
            <RangeView
              report={rangeModel}
              onPickDate={(date) => {
                setRange(null);
                setDateKey(date);
              }}
            />
          ) : (
            /*
              The day in view, rendered from the buffered `view` rather than
              the live model so a date change can fade the old day out before
              the new one fades in (§5.4). Lanes are keyed by student and are
              NOT re-staggered - only the wrapper's opacity moves.
            */
            <div
              className={`acc-board__day${
                view.phase !== 'idle' ? ` acc-board__day--${view.phase}` : ''
              }`}
            >
              {/*
                Two reasons a date carries no obligation, and they are the only
                two: it is a weekend, or the teacher marked it non-instructional.
                The copy used to say "none of your class periods meet on this
                day", which described a per-period timetable the app has never
                had and does not want - a period records which class somebody is
                in, not when it runs.
              */}
              {view.model.noClassToday ? (
                <EmptyState
                  title={
                    view.model.isNonInstructional
                      ? 'Not a school day'
                      : `${formatDateLong(view.dateKey)} is a weekend`
                  }
                  body={
                    view.model.isNonInstructional
                      ? 'This date is marked as non-instructional, so there are no accommodations to record. It prints as “n/a”.'
                      : 'Weekends carry nothing to record. It prints as “n/a”, not as a missed accommodation.'
                  }
                  actionLabel="Go to the last school day"
                  onAction={() => setDateKey(previousSchoolDay(view.dateKey, doc))}
                />
              ) : !view.model.hasRecord ? (
                <EmptyState
                  title="No record for this day"
                  // The single most important sentence in the product.
                  body="Nothing was recorded on this date. That is different from the accommodations not being delivered, and it prints as “no record”, never as “not used”."
                  actionLabel={readOnly ? null : 'Start a record for this day'}
                  onAction={startRecord}
                />
              ) : view.model.lanes.length === 0 ? (
                <EmptyState
                  title={search ? 'No students match that search' : 'No students yet'}
                  body={
                    search
                      ? `Nothing matches “${search}”. Try a last name, or clear the filters.`
                      : 'Add students and their accommodations to start tracking.'
                  }
                  actionLabel={search ? 'Clear search' : null}
                  onAction={() => setSearch('')}
                />
              ) : (
                /*
                  Keyed by the copy counter, so a copy remounts this container
                  and its fade plays again. Unchanged on every other render, so
                  ordinary edits never restart it.

                  Lane by lane, not all at once. Fading the container brought a
                  whole board of changed statuses in as a single block, which
                  reads as a pop even when it fades. The stagger comes from
                  `.acc-cascade`, already on this element; the animation the
                  delays drive is `--copied` in _app-shell.scss, which has to
                  out-specify the `rest` state's `animation: none` on the lanes.
                */
                <div
                  className={`acc-board__lanes acc-cascade${copyCascading ? ' acc-board__lanes--copied' : ''}`}
                  key={`lanes-${copyPulse}`}
                >
                  {view.model.lanes.map((lane) => (
                    <Swimlane
                      key={lane.studentId}
                      lane={lane}
                      collapsed={collapsed.has(lane.studentId)}
                      readOnly={locked}
                      notesReadOnly={readOnly}
                      onToggleCollapse={() => toggle(lane.studentId)}
                      onToggleAbsent={() => handleToggleAbsent(lane.studentId)}
                      onOpenDetail={setDetailCard}
                      onContextMenu={openContextMenu}
                      onLaneContextMenu={(l, mx, my) => setLaneMenu({ lane: l, x: mx, y: my })}
                      onSelectClick={handleSelectClick}
                      isSelected={isSelected}
                      selectionCount={selectionCount}
                      onNotesCommit={commitNotes}
                      renderColumnFooter={renderAddAccommodation}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {bar.height > 0 && (
          <div
            className={`acc-scrollbar${bar.visible ? ' acc-scrollbar--visible' : ''}`}
            style={{ top: `${bar.trackTop}px`, height: `${bar.trackHeight}px` }}
            aria-hidden="true"
          >
            <div
              className="acc-scrollbar__thumb"
              style={{ top: `${bar.top}px`, height: `${bar.height}px` }}
              onPointerDown={onThumbPointerDown}
            />
          </div>
        )}
      </DragDropContext>

      {laneMenu && (
        <StudentContextMenu
          onEditProfile={() => onEditStudent?.(laneMenu.lane.studentId)}
          onPrint={() => onPrintStudent?.(laneMenu.lane.studentId)}
          lane={laneMenu.lane}
          dateKey={dateKey}
          unenrolledFrom={
            doc.students.find((s) => s.id === laneMenu.lane.studentId)?.unenrolledFrom || null
          }
          x={laneMenu.x}
          y={laneMenu.y}
          onClose={() => setLaneMenu(null)}
          onRename={(name) => mutate((d) => renameStudent(d, laneMenu.lane.studentId, name))}
          onUnenrol={(from) => {
            // Re-enrolling is harmless and immediately visible, so it goes
            // straight through. Disenrolling changes every future day, so it asks.
            if (!from) {
              mutate((d) => setStudentEnrollment(d, laneMenu.lane.studentId, null));
              return;
            }
            setConfirmUnenrol({ lane: laneMenu.lane, from });
          }}
          onCopyPrevious={() => {
            // Dry run first: the question names the day and the count, and
            // nothing is written unless the answer is yes. Copying statuses
            // forward asserts delivery, so it is never a single click.
            const lane = laneMenu.lane;
            const preview = copyPreviousForStudent(lane.studentId, false, { apply: false });
            setConfirmCopy({ lane, preview });
          }}
        />
      )}

      {confirmUnenrol && (
        <ConfirmDialog
          title={`Disenroll ${confirmUnenrol.lane.displayName}?`}
          body={`They will stop appearing on the board from ${formatDateLong(
            confirmUnenrol.from
          )} onward, and will not be included in reports covering days after that.`}
          reassurance="Every day already recorded keeps their information exactly as it is, and you can re-enroll them at any time if this was a mistake."
          confirmLabel="Disenroll"
          tone="warn"
          onCancel={() => setConfirmUnenrol(null)}
          onConfirm={() => {
            mutate((d) =>
              setStudentEnrollment(d, confirmUnenrol.lane.studentId, confirmUnenrol.from)
            );
            setConfirmUnenrol(null);
          }}
        />
      )}

      {/*
        Named, counted and dated before anything is written. A copy asserts
        delivery on a day nobody has observed, which is the one class of change
        that should never happen from a single click on a compliance record.
      */}
      {confirmCopy && (
        <ConfirmDialog
          title={
            confirmCopy.preview.applied || confirmCopy.preview.reason === 'would-overwrite'
              ? `Copy ${confirmCopy.lane.displayName}'s last recorded day?`
              : `Nothing to copy for ${confirmCopy.lane.displayName}`
          }
          body={
            confirmCopy.preview.reason === 'no-source'
              ? 'There is no earlier day with anything recorded for them.'
              : confirmCopy.preview.reason === 'sealed'
                ? 'This day is closed out, so it cannot be changed.'
                : confirmCopy.preview.reason === 'would-overwrite'
                  ? `You have already recorded something for ${confirmCopy.lane.displayName} today. Copying will replace it.`
                  : `This brings ${confirmCopy.preview.copied} entr${
                      confirmCopy.preview.copied === 1 ? 'y' : 'ies'
                    } forward from ${formatDateLong(confirmCopy.preview.sourceDate)} and records them as delivered today.`
          }
          reassurance={
            confirmCopy.preview.applied || confirmCopy.preview.reason === 'would-overwrite'
              ? 'Only this student is affected, and you can move any card afterwards.'
              : undefined
          }
          confirmLabel={
            confirmCopy.preview.reason === 'would-overwrite' ? 'Replace it' : 'Copy them'
          }
          tone={confirmCopy.preview.reason === 'would-overwrite' ? 'warn' : 'default'}
          onCancel={() => setConfirmCopy(null)}
          onConfirm={() => {
            if (confirmCopy.preview.applied || confirmCopy.preview.reason === 'would-overwrite') {
              copyPreviousForStudent(confirmCopy.lane.studentId, true);
            }
            setConfirmCopy(null);
          }}
        />
      )}

      {contextMenu && (
        <CardContextMenu
          card={contextMenu.card}
          selectionCount={isSelected(contextMenu.card) ? selectionCount : 0}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          onMove={handleStatusChange}
          onSetUseCount={handleSetUseCount}
          onSetDefault={handleSetDefault}
          onSetNotRelevant={handleSetNotRelevant}
        />
      )}

      {detailCard && (
        <CardDetailPopover card={detailCard} onSave={saveDetail} onCancel={cancelDetail} />
      )}

      {defaultPrompt && (
        <CardDetailPopover
          standing
          card={defaultPrompt.card}
          onSave={saveDefaultDetail}
          onCancel={() => setDefaultPrompt(null)}
        />
      )}
    </div>
  );
}

/**
 * Walk back to the nearest weekday that is not marked non-instructional.
 * "Go to today" would be a dead end when today is the weekend the user is
 * already looking at.
 */
function previousSchoolDay(from, doc) {
  const skip = new Set(doc.schoolCalendar?.nonInstructionalDates || []);
  let cursor = addDays(from, -1);
  for (let i = 0; i < 14; i += 1) {
    if (!isWeekend(cursor) && !skip.has(cursor)) return cursor;
    cursor = addDays(cursor, -1);
  }
  return cursor;
}

function findCard(lane, assignmentId) {
  for (const cards of Object.values(lane.columns)) {
    const hit = cards.find((c) => c.assignmentId === assignmentId);
    if (hit) return hit;
  }
  return null;
}
