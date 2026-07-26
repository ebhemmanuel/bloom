import { memo } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import CardStatusControl from './CardStatusControl.jsx';
import { STATUS, STATUS_LABEL } from '../../domain/constants.js';

/**
 * One accommodation for one student on one day.
 *
 * Memoised on the fields that actually affect the render — with 240 cards on a
 * full board, re-rendering all of them on every keystroke in the search box is
 * the difference between fluid and sluggish.
 */
function AccommodationCard({ card, index, disabled, onStatusChange, onOpenDetail }) {
  const resolvedNotUsed = card.resolved === STATUS.NOT_USED;

  const classes = [
    'acc-card',
    card.isCustom && 'acc-card--custom',
    resolvedNotUsed && 'acc-card--not-used',
    card.needsDetail && 'acc-card--needs-detail',
    card.notApplicable && 'acc-card--na',
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
          // The library's transform. The ONLY permitted inline style in the app —
          // everything else is a BEM modifier, per CLAUDE.md.
          style={provided.draggableProps.style}
          className={`${classes}${snapshot.isDragging ? ' acc-card--dragging' : ''}`}
        >
          <div className="acc-card__grip" {...provided.dragHandleProps} aria-hidden="true">
            <span />
            <span />
          </div>

          <div className="acc-card__body">
            <p className="acc-card__label">{card.label}</p>

            <div className="acc-card__meta">
              {card.isCustom && <span className="acc-card__badge">One-off</span>}
              {card.hasDetail && (
                <button
                  type="button"
                  className="acc-card__detail-chip"
                  onClick={() => onOpenDetail(card)}
                  title={card.detail}
                >
                  Detail added
                </button>
              )}
              {card.needsDetail && (
                <button
                  type="button"
                  className="acc-card__detail-chip acc-card__detail-chip--missing"
                  onClick={() => onOpenDetail(card)}
                >
                  Detail needed
                </button>
              )}
              {resolvedNotUsed && (
                <span className="acc-card__resolved">{STATUS_LABEL[STATUS.NOT_USED]}</span>
              )}
            </div>
          </div>

          <CardStatusControl
            status={card.status}
            disabled={disabled}
            label={card.label}
            onChange={(next) => onStatusChange(card, next)}
          />
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
