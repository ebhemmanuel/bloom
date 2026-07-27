import { memo } from 'react';
import SwimlaneHeader from './SwimlaneHeader.jsx';
import SwimlaneSummaryStrip from './SwimlaneSummaryStrip.jsx';
import StatusColumn from './StatusColumn.jsx';
import SwimlaneNotesCell from './SwimlaneNotesCell.jsx';
import { BOARD_COLUMNS } from '../../domain/constants.js';

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
  onNotesCommit,
}) {
  const locked = readOnly || lane.absent;

  return (
    <article
      className={[
        'acc-lane',
        lane.absent && 'acc-lane--absent',
        collapsed && 'acc-lane--collapsed',
        readOnly && 'acc-lane--readonly',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <SwimlaneHeader
        lane={lane}
        collapsed={collapsed}
        disabled={readOnly}
        onToggleCollapse={onToggleCollapse}
        onToggleAbsent={onToggleAbsent}
      />

      {collapsed ? (
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
              onOpenDetail={onOpenDetail}
              onContextMenu={onContextMenu}
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
