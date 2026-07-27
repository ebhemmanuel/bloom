import { memo } from 'react';

const PLAN_CLASS = { IEP: 'iep', 504: '504', Other: 'other' };

function Chevron({ open }) {
  return (
    <svg
      className={`acc-lane__chevron${open ? ' acc-lane__chevron--open' : ''}`}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
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
 * Swimlane header: disclosure, name, plan pill, progress readout, and the
 * mark-absent button pinned far right.
 */
function SwimlaneHeader({
  lane,
  collapsed,
  disabled,
  onToggleCollapse,
  onToggleAbsent,
  onContextMenu,
}) {
  const { summary } = lane;
  const recorded = summary.counts.used + summary.counts.used_with_detail;

  return (
    <header
      className="acc-lane__header"
      // Right-click anywhere on the header row, not just the text — the name is
      // a small target and the row is what reads as "this student".
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu?.(lane, event.clientX, event.clientY);
      }}
    >
      <button
        type="button"
        className="acc-lane__disclosure"
        aria-expanded={!collapsed}
        onClick={onToggleCollapse}
        title="Right-click for rename, absence and enrolment"
      >
        <Chevron open={!collapsed} />
        <span className="acc-lane__name">{lane.displayName}</span>
      </button>

      <span className={`acc-pill acc-pill--${PLAN_CLASS[lane.planType] || 'other'}`}>
        {lane.planType}
      </span>

      {lane.periodNames.length > 0 && (
        <span className="acc-lane__periods">{lane.periodNames.join(' · ')}</span>
      )}

      <span className="acc-lane__progress acc-numeric">
        {lane.absent ? (
          <span className="acc-lane__progress-absent">Absent</span>
        ) : (
          <>
            {recorded} of {summary.counted || lane.assignmentCount} recorded
          </>
        )}
      </span>

      {/* Right-aligned group: the needs-detail chip sits immediately left of
          Mark absent, replacing the old global warning pill. A per-lane warning
          points at the student it concerns instead of making the teacher hunt. */}
      <span className="acc-lane__right">
        {lane.detailsMissing > 0 && !lane.absent && (
          <span className="acc-lane__warn">
            <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
              <path
                d="M8 2.5 14.5 13.5h-13z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
              <path d="M8 6.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <circle cx="8" cy="11.4" r="0.7" fill="currentColor" />
            </svg>
            {lane.detailsMissing} need{lane.detailsMissing === 1 ? 's' : ''} detail
          </span>
        )}
      </span>

      {/* Far right, per spec. */}
      <button
        type="button"
        className={`acc-lane__absent${lane.absent ? ' acc-lane__absent--on' : ''}`}
        onClick={onToggleAbsent}
        disabled={disabled}
        aria-pressed={lane.absent}
        title={
          lane.absent
            ? `Mark ${lane.displayName} present`
            : `Mark ${lane.displayName} absent — excluded from compliance totals`
        }
      >
        {lane.absent ? 'Absent' : 'Mark absent'}
      </button>
    </header>
  );
}

export default memo(SwimlaneHeader);
