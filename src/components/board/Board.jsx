import { useCallback, useEffect, useMemo, useState } from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import Swimlane from './Swimlane.jsx';
import CardDetailPopover from './CardDetailPopover.jsx';
import BoardToolbar from '../toolbar/BoardToolbar.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import useCollapsedLanes from '../../hooks/useCollapsedLanes.js';
import { useData } from '../../context/DataContext.jsx';
import { buildBoardModel, periodOptions } from '../../domain/selectors.js';
import { setEntryStatus, setStudentNotes, toggleStudentAbsent } from '../../domain/mutations.js';
import { ensureDay, copyFromPreviousDay } from '../../domain/seed.js';
import { sealDay } from '../../domain/resolve.js';
import { STATUS, SEED_MODE } from '../../domain/constants.js';
import { todayKey, formatDateLong, addDays, isWeekend } from '../../domain/dates.js';

/** `drop:<studentId>:<status>` → parts. */
function parseDroppable(id) {
  const [, studentId, status] = id.split(':');
  return { studentId, status };
}

export default function Board() {
  const { doc, mutate, readOnly } = useData();

  const [dateKey, setDateKey] = useState(() => todayKey());
  const [periodIds, setPeriodIds] = useState([]);
  const [search, setSearch] = useState('');
  const [detailCard, setDetailCard] = useState(null);
  const [dragging, setDragging] = useState(false);
  const { collapsed, toggle, collapseAll, expandAll } = useCollapsedLanes();

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

  const model = useMemo(
    () => buildBoardModel(doc, { dateKey, periodIds, search }),
    [doc, dateKey, periodIds, search]
  );

  const periods = useMemo(() => periodOptions(doc), [doc]);
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

      handleStatusChange(card, to.status);
    },
    [handleStatusChange, model.lanes]
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

  // --- render -------------------------------------------------------------

  return (
    <div className="acc-board">
      <BoardToolbar
        dateKey={dateKey}
        onDateChange={setDateKey}
        nonInstructionalDates={doc.schoolCalendar?.nonInstructionalDates || []}
        periods={periods}
        selectedPeriodIds={periodIds}
        onPeriodsChange={setPeriodIds}
        search={search}
        onSearchChange={setSearch}
        model={model}
        readOnly={readOnly}
        onCopyPrevious={copyPrevious}
        onCloseOutDay={closeOutDay}
        onCollapseAll={() => collapseAll(model.lanes.map((l) => l.studentId))}
        onExpandAll={expandAll}
      />

      {model.sealed && (
        <div className="acc-banner acc-banner--sealed acc-fade-enter">
          This day is closed out and read-only. Use <strong>Amend</strong> on a card to correct it —
          the change is logged.
        </div>
      )}

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
        <DragDropContext
          onDragStart={() => setDragging(true)}
          onDragEnd={(result) => {
            setDragging(false);
            handleDragEnd(result);
          }}
        >
          <div className="acc-board__scroll">
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
                  onNotesCommit={commitNotes}
                />
              ))}
            </div>
          </div>
        </DragDropContext>
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
