import { memo } from 'react';

import { planClassOf } from '../../domain/constants.js';

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
  return (
    <header
      className="acc-lane__header"
      // Right-click anywhere on the header row, not just the text - the name is
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

      <span className={`acc-pill acc-pill--${planClassOf(lane.planType)}`}>{lane.planType}</span>

      {/*
        Right-aligned group, immediately left of Mark absent: which periods, and
        any warning.

        These trailed the name before, which put several things in a row against
        the left edge and left the student's own name competing for the eye.
        Everything that reports on the lane now gathers at the far end, so the
        left is the name and nothing else.

        The "N of M recorded" readout that used to sit here is gone. The columns
        underneath already say it, card by card, and a running count next to a
        student's name reads as a score they are being kept at.
      */}
      <span className="acc-lane__right">
        {lane.periodNames.map((p) => (
          <span key={p} className="acc-lane__pchip">
            {p}
          </span>
        ))}

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
            : `Mark ${lane.displayName} absent - excluded from compliance totals`
        }
      >
        {lane.absent ? 'Absent' : 'Mark absent'}
      </button>
    </header>
  );
}

export default memo(SwimlaneHeader);
