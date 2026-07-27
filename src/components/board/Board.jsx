import { useCallback, useEffect, useState } from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import Swimlane from './Swimlane.jsx';
import CardDetailPopover from './CardDetailPopover.jsx';
import BoardToolbar from '../toolbar/BoardToolbar.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import useCollapsedLanes from '../../hooks/useCollapsedLanes.js';
import useCardSelection from '../../hooks/useCardSelection.js';
import useCustomScrollbar from '../../hooks/useCustomScrollbar.js';
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
import { ensureDay, copyFromPreviousDay } from '../../domain/seed.js';
import { sealDay } from '../../domain/resolve.js';
import { STATUS, SEED_MODE } from '../../domain/constants.js';
import { todayKey, formatDateLong, addDays, isWeekend } from '../../domain/dates.js';

/** `drop:<studentId>:<status>` → parts. */
function parseDroppable(id) {
  const [, studentId, status] = id.split(':');
  return { studentId, status };
}

export default function Board({ onAddStudent }) {
  const { doc, mutate, readOnly } = useData();

  // Date, period filter and search live in BoardContext because the Bloom shell
  // splits those controls between the pill nav and the toolbar.
  const { dateKey, setDateKey, periodIds, setPeriodIds, search, setSearch, model, periods } =
    useBoard();

  const [detailCard, setDetailCard] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [laneMenu, setLaneMenu] = useState(null);
  const [confirmUnenrol, setConfirmUnenrol] = useState(null);
  const [dragging, setDragging] = useState(false);
  const { collapsed, toggle, collapseAll, expandAll } = useCollapsedLanes();
  const {
    selection,
    selectionCount,
    isSelected,
    handleClick: handleSelectClick,
    clear: clearSelection,
  } = useCardSelection();
  const { scrollRef, bar, onScroll, onThumbPointerDown } = useCustomScrollbar();

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
        // Detail is only asked for on the card actually grabbed — prompting
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

  const commitNotes = useCallback(
    (studentId, text) => {
      if (readOnly) return;
      mutate((d) => setStudentNotes(d, dateKey, studentId, text));
    },
    [dateKey, mutate, readOnly]
  );

  const handleToggleAbsent = useCallback(
    (studentId) => {
      if (locked) return;
      mutate((d) => toggleStudentAbsent(d, dateKey, studentId));
    },
    [dateKey, locked, mutate]
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

  const copyPrevious = useCallback(
    (mode = SEED_MODE.STRUCTURE, force = false) => {
      let outcome = null;
      mutate((d) => {
        const result = copyFromPreviousDay(d, dateKey, { mode, force });
        outcome = result;
        return result.applied ? result.doc : d;
      });
      return outcome;
    },
    [dateKey, mutate]
  );

  const closeOutDay = useCallback(() => {
    mutate((d) => sealDay(d, dateKey, new Date(), 'user'));
  }, [dateKey, mutate]);

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

  const handleSetDefault = useCallback(
    (card, status) => {
      if (readOnly) return;
      mutate((d) =>
        setAssignmentDefault(d, card.assignmentId, status, {
          detail: card.detail || '',
          // Apply to the day in view too, so the change is visible immediately
          // rather than only showing up tomorrow.
          applyToDate: dateKey,
        })
      );
    },
    [dateKey, mutate, readOnly]
  );

  /**
   * The "+ Add accommodation" affordance at the end of each Unassigned column.
   * Hidden on sealed days and for absent students — neither is a moment to be
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

  const toolbar = (
    <BoardToolbar
      dateKey={dateKey}
      onDateChange={setDateKey}
      nonInstructionalDates={doc.schoolCalendar?.nonInstructionalDates || []}
      periods={periods}
      selectedPeriodIds={periodIds}
      onPeriodsChange={setPeriodIds}
      model={model}
      readOnly={readOnly}
      onCopyPrevious={copyPrevious}
      onCloseOutDay={closeOutDay}
      onAddStudent={onAddStudent}
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
      {model.sealed && (
        <div className="acc-banner acc-banner--sealed acc-fade-enter">
          This day is closed out and read-only. Use <strong>Amend</strong> on a card to correct it —
          the change is logged.
        </div>
      )}

      {/* The toolbar lives INSIDE the scroll area, so the container's padding
          applies to it and nothing sits flush against the top edge. */}
      <DragDropContext
        onDragStart={() => setDragging(true)}
        onDragEnd={(result) => {
          setDragging(false);
          handleDragEnd(result);
        }}
      >
        <div className="acc-board__scroll" ref={scrollRef} onScroll={onScroll}>
          {toolbar}

          {model.noClassToday ? (
            <EmptyState
              title={
                model.isNonInstructional
                  ? 'Not a school day'
                  : `No classes meet on ${formatDateLong(dateKey)}`
              }
              body={
                model.isNonInstructional
                  ? 'This date is marked as non-instructional, so there are no accommodations to record. It prints as “n/a”.'
                  : 'None of your class periods meet on this day, so there is nothing to record. It prints as “n/a”, not as a missed accommodation.'
              }
              actionLabel="Go to the last school day"
              onAction={() => setDateKey(previousSchoolDay(dateKey, doc))}
            />
          ) : !model.hasRecord ? (
            <EmptyState
              title="No record for this day"
              // The single most important sentence in the product.
              body="Nothing was recorded on this date. That is different from the accommodations not being delivered, and it prints as “no record”, never as “not used”."
              actionLabel={readOnly ? null : 'Start a record for this day'}
              onAction={startRecord}
            />
          ) : model.lanes.length === 0 ? (
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
            <div className="acc-board__lanes acc-cascade">
              {model.lanes.map((lane) => (
                <Swimlane
                  key={lane.studentId}
                  lane={lane}
                  collapsed={collapsed.has(lane.studentId)}
                  readOnly={locked}
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
          lane={laneMenu.lane}
          dateKey={dateKey}
          unenrolledFrom={
            doc.students.find((s) => s.id === laneMenu.lane.studentId)?.unenrolledFrom || null
          }
          x={laneMenu.x}
          y={laneMenu.y}
          onClose={() => setLaneMenu(null)}
          onRename={(name) => mutate((d) => renameStudent(d, laneMenu.lane.studentId, name))}
          onToggleAbsent={(reason) => handleToggleAbsent(laneMenu.lane.studentId, reason)}
          onUnenrol={(from) => {
            // Re-enrolling is harmless and immediately visible, so it goes
            // straight through. Unenrolling changes every future day, so it asks.
            if (!from) {
              mutate((d) => setStudentEnrollment(d, laneMenu.lane.studentId, null));
              return;
            }
            setConfirmUnenrol({ lane: laneMenu.lane, from });
          }}
        />
      )}

      {confirmUnenrol && (
        <ConfirmDialog
          title={`Unenrol ${confirmUnenrol.lane.displayName}?`}
          body={`They will stop appearing on the board from ${formatDateLong(
            confirmUnenrol.from
          )} onward, and will not be included in reports covering days after that.`}
          reassurance="Every day already recorded keeps their information exactly as it is, and you can re-enrol them at any time if this was a mistake."
          confirmLabel="Unenrol"
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
