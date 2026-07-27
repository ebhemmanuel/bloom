import { memo } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { STATUS, STATUS_LABEL } from '../../domain/constants.js';

/**
 * One accommodation for one student on one day.
 *
 * The WHOLE card is the drag handle, the way a Jira card behaves — you grab it
 * anywhere and drop it in a column. Status is changed by moving the card and
 * only by moving the card; there is no per-card status widget.
 *
 * Accessibility is covered without one: @hello-pangea/dnd gives the handle
 * keyboard dragging for free (Space to lift, arrows to move, Space to drop) with
 * live-region announcements, which is the same interaction model Jira ships.
 *
 * Clicking without dragging opens the detail editor — the library distinguishes a
 * click from a drag, so both live on the same element.
 *
 * Memoised on the fields that affect the render: with ~240 cards on a full board,
 * re-rendering all of them on every keystroke in the search box is the difference
 * between fluid and sluggish.
 */
function AccommodationCard({ card, index, disabled, onOpenDetail }) {
  const resolvedNotUsed = card.resolved === STATUS.NOT_USED;

  const classes = [
    'acc-card',
    card.isCustom && 'acc-card--custom',
    resolvedNotUsed && 'acc-card--not-used',
    card.needsDetail && 'acc-card--needs-detail',
    card.notApplicable && 'acc-card--na',
    disabled && 'acc-card--locked',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Draggable
      draggableId={`card:${card.studentId}:${card.assignmentId}`}
      index={index}
      isDragDisabled={disabled}
    >
      {(provided, snapshot) => (
        <li
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          // The library's own transform. The ONLY permitted inline style in the
          // app — everything else is a BEM modifier, per CLAUDE.md.
          style={provided.draggableProps.style}
          className={`${classes}${snapshot.isDragging ? ' acc-card--dragging' : ''}`}
          onClick={() => onOpenDetail(card)}
          aria-label={`${card.label} — ${STATUS_LABEL[card.resolved] || ''}`}
        >
          <p className="acc-card__label">{card.label}</p>

          <div className="acc-card__meta">
            {card.isCustom && <span className="acc-card__badge">One-off</span>}
            {card.hasDetail && (
              <span className="acc-card__detail-chip" title={card.detail}>
                Detail added
              </span>
            )}
            {card.needsDetail && (
              <span className="acc-card__detail-chip acc-card__detail-chip--missing">
                Detail needed
              </span>
            )}
            {resolvedNotUsed && (
              <span className="acc-card__resolved">{STATUS_LABEL[STATUS.NOT_USED]}</span>
            )}
          </div>
        </li>
      )}
    </Draggable>
  );
}

export default memo(AccommodationCard, (a, b) => {
  const x = a.card;
  const y = b.card;
  return (
    a.index === b.index &&
    a.disabled === b.disabled &&
    x.assignmentId === y.assignmentId &&
    x.status === y.status &&
    x.resolved === y.resolved &&
    x.label === y.label &&
    x.detail === y.detail &&
    x.needsDetail === y.needsDetail
  );
});
