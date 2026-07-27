import { memo } from 'react';
import SwimlaneHeader from './SwimlaneHeader.jsx';
import SwimlaneSummaryStrip from './SwimlaneSummaryStrip.jsx';
import StatusColumn from './StatusColumn.jsx';
import SwimlaneNotesCell from './SwimlaneNotesCell.jsx';
import { BOARD_COLUMNS } from '../../domain/constants.js';
import { formatDateMedium } from '../../domain/dates.js';

/**
 * One student's row: three status columns plus their notes cell.
 *
 * An absent student's columns are locked but their recorded statuses stay
 * visible — absence excludes them from the compliance denominator, it does not
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
  renderColumnFooter,
}) {
  const locked = readOnly || lane.absent || lane.preEnrolment;

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
        Nothing here counts toward the day — there was no obligation.
      */}
      {lane.preEnrolment ? (
        <p className="acc-lane__enrolnote">
          Enrolled {formatDateMedium(lane.enrolledFrom)} — nothing is recorded for this student
          before then.
        </p>
      ) : collapsed ? (
        <SwimlaneSummaryStrip summary={lane.summary} />
      ) : (
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
            disabled={readOnly}
            onCommit={(text) => onNotesCommit(lane.studentId, text)}
          />
        </div>
      )}
    </article>
  );
}

export default memo(Swimlane);
