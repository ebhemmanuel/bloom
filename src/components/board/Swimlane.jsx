import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import SwimlaneHeader from './SwimlaneHeader.jsx';
import SwimlaneSummaryStrip from './SwimlaneSummaryStrip.jsx';
import StatusColumn from './StatusColumn.jsx';
import SwimlaneNotesCell from './SwimlaneNotesCell.jsx';
import { BOARD_COLUMNS } from '../../domain/constants.js';
import { formatDateMedium } from '../../domain/dates.js';

/**
 * How long a lane takes to collapse or open, matching `--acc-dur-normal`.
 *
 * ONE number for both directions and both halves. The body shrinking and the
 * summary strip growing have to finish together, or whichever lands last moves
 * the board on its own after the other has stopped.
 */
const LANE_MS = 260;

/**
 * One student's row: three status columns plus their notes cell.
 *
 * An absent student's columns are locked but their recorded statuses stay
 * visible - absence excludes them from the compliance denominator, it does not
 * erase what was already noted.
 */
function Swimlane({
  lane,
  collapsed,
  readOnly,
  onToggleCollapse,
  onToggleAbsent,
  onOpenDetail,
  onContextMenu,
  onLaneContextMenu,
  onSelectClick,
  isSelected,
  selectionCount,
  onNotesCommit,
  notesReadOnly,
  renderColumnFooter,
}) {
  const locked = readOnly || lane.absent || lane.preEnrolment;

  /*
    Notes outlive the close-out. `readOnly` here already carries the sealed day,
    so the notes cell takes `notesReadOnly` instead: the document-level lock
    only. Absent and pre-enrolment still apply, because a note about a day a
    student was not there belongs on the day notes, not in their lane.
  */
  const notesLocked = notesReadOnly ?? readOnly;

  /*
    The collapse, animated rather than swapped.

    Marking a student absent collapses their lane, and the body was simply
    replaced by the summary strip in the same frame - a full-height row became a
    thin one instantly, and every lane below it jumped up by the difference. The
    open direction was the same cut in reverse.

    Same shape as the sealed notice: the body is held mounted while a grid row
    above it closes, and only then does the strip take its place. `collapsed` is
    the prop; `showBody` is what is actually on screen, which outlives it by the
    length of the animation.

    Laid out before paint, for the reason the notice documents - a plain effect
    paints one frame of the state being left, which is the cut itself.
  */
  const [phase, setPhase] = useState(null);
  const wasCollapsed = useRef(collapsed);
  const slotTimer = useRef(null);

  useLayoutEffect(() => {
    if (wasCollapsed.current === collapsed) return undefined;
    wasCollapsed.current = collapsed;
    clearTimeout(slotTimer.current);
    setPhase(collapsed ? 'shut' : 'open');
    slotTimer.current = setTimeout(() => setPhase(null), LANE_MS);
    return undefined;
  }, [collapsed]);

  /*
    Both halves are on screen together for the length of the change, and only
    then does the one being left unmount.

    Collapsing the body alone overshot: it shrank all the way to nothing, so the
    lane bottomed out at just its header and the lane beneath rose into it,
    then the strip mounted at full height in one frame and shoved everything
    back down. That is the crash-and-settle.

    Growing the strip by exactly as much as the body loses keeps the lane's
    total height continuous the whole way, in both directions.
  */
  const showBody = !collapsed || phase === 'shut';
  const showStrip = collapsed || phase === 'open';

  // The strip runs the opposite way to the body: as one closes the other opens.
  const bodyPhase = phase;
  const stripPhase = phase === 'shut' ? 'open' : phase === 'open' ? 'shut' : null;

  useEffect(() => () => clearTimeout(slotTimer.current), []);

  return (
    <article
      className={[
        'acc-lane',
        lane.absent && 'acc-lane--absent',
        lane.preEnrolment && 'acc-lane--preenrolment',
        collapsed && 'acc-lane--collapsed',
        readOnly && 'acc-lane--readonly',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <SwimlaneHeader
        lane={lane}
        collapsed={collapsed}
        disabled={readOnly || lane.preEnrolment}
        onToggleCollapse={onToggleCollapse}
        onToggleAbsent={onToggleAbsent}
        onContextMenu={onLaneContextMenu}
      />

      {/*
        Not in this class yet on this date. Shown rather than hidden: a lane that
        silently disappears from an October board leaves the teacher wondering
        whether they lost a student, where a locked one with a date answers it.
        Nothing here counts toward the day - there was no obligation.
      */}
      {lane.preEnrolment ? (
        <p className="acc-lane__enrolnote">
          Enrolled {formatDateMedium(lane.enrolledFrom)} - nothing is recorded for this student
          before then.
        </p>
      ) : (
        <>
          {showStrip && (
            <div className={`acc-lane__slot${stripPhase ? ` acc-lane__slot--${stripPhase}` : ''}`}>
              <SwimlaneSummaryStrip summary={lane.summary} />
            </div>
          )}

          {showBody && (
            <div
              className={`acc-lane__slot acc-lane__slot--body${
                bodyPhase ? ` acc-lane__slot--${bodyPhase}` : ''
              }`}
            >
              <div className="acc-lane__body">
                {BOARD_COLUMNS.map((col) => (
                  <StatusColumn
                    key={col.id}
                    studentId={lane.studentId}
                    status={col.id}
                    label={col.label}
                    cards={lane.columns[col.id]}
                    disabled={locked}
                    isSelected={isSelected}
                    selectionCount={selectionCount}
                    onOpenDetail={onOpenDetail}
                    onContextMenu={onContextMenu}
                    onSelectClick={onSelectClick}
                    footer={renderColumnFooter?.(lane, col.id)}
                  />
                ))}

                <SwimlaneNotesCell
                  studentName={lane.displayName}
                  value={lane.notes}
                  disabled={notesLocked || lane.absent || lane.preEnrolment}
                  onCommit={(text) => onNotesCommit(lane.studentId, text)}
                />
              </div>
            </div>
          )}
        </>
      )}
    </article>
  );
}

export default memo(Swimlane);
