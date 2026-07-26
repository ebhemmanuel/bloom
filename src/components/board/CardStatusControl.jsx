import { memo } from 'react';
import { BOARD_COLUMNS, STATUS } from '../../domain/constants.js';

const SHORT = {
  [STATUS.UNASSIGNED]: '–',
  [STATUS.USED]: 'Used',
  [STATUS.USED_WITH_DETAIL]: 'Detail',
};

/**
 * Three-button segmented control, present on every card.
 *
 * Co-equal with dragging, not a fallback. Dragging is the requested interaction
 * and should be excellent, but a teacher triaging 240 cards at 3:55pm will tap
 * buttons, and touchscreen and motor-impaired users need them. Keyboard drag
 * exists too, but a single click beats lift-arrow-arrow-drop every time.
 */
function CardStatusControl({ status, disabled, onChange, label }) {
  return (
    <div className="acc-card-status" role="radiogroup" aria-label={`Status for ${label}`}>
      {BOARD_COLUMNS.map((col) => {
        const active = status === col.id;
        return (
          <button
            key={col.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            className={`acc-card-status__btn acc-card-status__btn--${col.id.replace(/_/g, '-')}${
              active ? ' acc-card-status__btn--active' : ''
            }`}
            onClick={() => !active && onChange(col.id)}
            title={col.label}
          >
            {SHORT[col.id]}
          </button>
        );
      })}
    </div>
  );
}

export default memo(CardStatusControl);
