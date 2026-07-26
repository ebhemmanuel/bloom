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
function SwimlaneHeader({ lane, collapsed, disabled, onToggleCollapse, onToggleAbsent }) {
  const { summary } = lane;
  const recorded = summary.counts.used + summary.counts.used_with_detail;

  return (
    <header className="acc-lane__header">
      <button
        type="button"
        className="acc-lane__disclosure"
        aria-expanded={!collapsed}
        onClick={onToggleCollapse}
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

      {lane.detailsMissing > 0 && !lane.absent && (
        <span className="acc-lane__warn">
          {lane.detailsMissing} need{lane.detailsMissing === 1 ? 's' : ''} detail
        </span>
      )}

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
