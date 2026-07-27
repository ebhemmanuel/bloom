import { memo } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { STATUS, STATUS_LABEL } from '../../domain/constants.js';

/**
 * One accommodation for one student on one day.
 *
 * The WHOLE card is the drag handle, the way a Jira card behaves - you grab it
 * anywhere and drop it in a column. Status is changed by moving the card and
 * only by moving the card; there is no per-card status widget.
 *
 * Accessibility is covered without one: @hello-pangea/dnd gives the handle
 * keyboard dragging for free (Space to lift, arrows to move, Space to drop) with
 * live-region announcements, which is the same interaction model Jira ships.
 *
 * Clicking without dragging opens the detail editor - the library distinguishes a
 * click from a drag, so both live on the same element.
 *
 * Memoised on the fields that affect the render: with ~240 cards on a full board,
 * re-rendering all of them on every keystroke in the search box is the difference
 * between fluid and sluggish.
 */
/**
 * The card itself, given a Draggable's render props.
 *
 * Split out from the Draggable so the SAME markup can be rendered twice: once in
 * place, and once as the drag clone that has to live outside the board's
 * clipping ancestors. See CardDragClone in StatusColumn.
 */
export function CardShell({
  card,
  provided,
  snapshot,
  disabled,
  selected,
  selectionCount,
  onOpenDetail,
  onContextMenu,
  onSelectClick,
}) {
  const resolvedNotUsed = card.resolved === STATUS.NOT_USED;
  // Not this teacher's to deliver, so it cannot be moved either.
  const inert = disabled || card.notRelevant;

  const classes = [
    'acc-card',
    card.isCustom && 'acc-card--custom',
    resolvedNotUsed && 'acc-card--not-used',
    card.needsDetail && 'acc-card--needs-detail',
    card.notApplicable && !card.notRelevant && 'acc-card--na',
    card.notRelevant && 'acc-card--irrelevant',
    inert && 'acc-card--locked',
    card.defaultStatus && 'acc-card--defaulted',
    selected && 'acc-card--selected',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li
      ref={provided.innerRef}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      // The library's own transform. The ONLY permitted inline style in the
      // app - everything else is a BEM modifier, per CLAUDE.md.
      style={provided.draggableProps.style}
      className={`${classes}${snapshot.isDragging ? ' acc-card--dragging' : ''}`}
      onClick={(event) => {
        // A modifier click is a selection gesture, not "open the detail".
        if (onSelectClick?.(card, event)) return;
        if (!card.notRelevant) onOpenDetail?.(card);
      }}
      onContextMenu={(event) => {
        // Suppress the browser menu - right-click belongs to our own.
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) onContextMenu?.(card, event.clientX, event.clientY);
      }}
      aria-selected={selected || undefined}
      aria-label={`${card.label} - ${STATUS_LABEL[card.resolved] || ''}${
        card.useCount > 1 ? `, used ${card.useCount} times` : ''
      }`}
    >
      <span className="acc-card__grip" aria-hidden="true">
        <span />
      </span>

      {/* Pinned bottom-right of the card, outside the body flow. */}
      {card.useCount > 1 && (
        <span className="acc-card__count acc-numeric" title={`Used ${card.useCount} times today`}>
          ×{card.useCount}
        </span>
      )}

      {/* How many cards travel with this drag. */}
      {snapshot.isDragging && selectionCount > 1 && (
        <span className="acc-card__stack acc-numeric">{selectionCount}</span>
      )}

      <div className="acc-card__body">
        <p className="acc-card__label">{card.label}</p>

        <div className="acc-card__meta">
          {card.notRelevant && (
            <span className="acc-card__badge acc-card__badge--muted">Not relevant</span>
          )}
          {card.defaultStatus && (
            <span
              className="acc-card__badge acc-card__badge--default"
              title="Starts here every day"
            >
              Default
            </span>
          )}
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
      </div>
    </li>
  );
}

function AccommodationCard(props) {
  const { card, index, disabled } = props;
  const inert = disabled || card.notRelevant;

  return (
    <Draggable
      draggableId={`card:${card.studentId}:${card.assignmentId}`}
      index={index}
      isDragDisabled={inert}
    >
      {(provided, snapshot) => <CardShell {...props} provided={provided} snapshot={snapshot} />}
    </Draggable>
  );
}

export default memo(AccommodationCard, (a, b) => {
  if (a.selected !== b.selected || a.selectionCount !== b.selectionCount) return false;
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
    x.needsDetail === y.needsDetail &&
    x.useCount === y.useCount &&
    x.defaultStatus === y.defaultStatus &&
    x.notRelevant === y.notRelevant
  );
});
