import { memo } from 'react';
import { STATUS, DERIVED_STATUS, STATUS_LABEL } from '../../domain/constants.js';

const ORDER = [
  STATUS.USED,
  STATUS.USED_WITH_DETAIL,
  STATUS.UNASSIGNED,
  STATUS.NOT_USED,
  DERIVED_STATUS.ABSENT,
  DERIVED_STATUS.NOT_APPLICABLE,
  DERIVED_STATUS.NO_RECORD,
];

/** Replaces the lane body when collapsed, so a folded lane still tells you something. */
function SwimlaneSummaryStrip({ summary }) {
  const shown = ORDER.filter((s) => (summary.counts[s] || 0) > 0);

  return (
    <div className="acc-lane__strip">
      {shown.map((s) => (
        <span key={s} className={`acc-tally acc-tally--${s.replace(/_/g, '-')}`}>
          <span className="acc-tally__count acc-numeric">{summary.counts[s]}</span>
          <span className="acc-tally__label">{STATUS_LABEL[s]}</span>
        </span>
      ))}
      {shown.length === 0 && (
        <span className="acc-lane__strip-empty">No accommodations assigned</span>
      )}
    </div>
  );
}

export default memo(SwimlaneSummaryStrip);
