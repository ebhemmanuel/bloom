import { memo } from 'react';
import { createPortal } from 'react-dom';
import { Droppable } from '@hello-pangea/dnd';
import AccommodationCard, { CardShell } from './AccommodationCard.jsx';

/**
 * One status column inside one student's swimlane.
 *
 * The droppable `type` is scoped per student (`lane-<studentId>`). That makes the
 * "a card belongs to exactly one student" rule an invariant enforced by the drag
 * library itself — other students' columns are not even highlighted during a
 * drag — rather than a rejection branch in onDragEnd that the user only
 * discovers by trying and failing.
 */
function StatusColumn({
  studentId,
  status,
  label,
  cards,
  disabled,
  isSelected,
  selectionCount,
  onOpenDetail,
  onContextMenu,
  onSelectClick,
  footer,
}) {
  // Visual order within this column, for Shift+click range selection.
  const columnIds = cards.map((c) => c.assignmentId);

  return (
    <Droppable
      droppableId={`drop:${studentId}:${status}`}
      type={`lane-${studentId}`}
      isDropDisabled={disabled}
      /**
       * The dragged card is rendered as a CLONE, portalled to <body>.
       *
       * While dragging, the library positions the item `fixed`. The board card
       * carries `backdrop-filter`, which makes it a containing block for fixed
       * descendants, and each lane sets `overflow: hidden` for its rounded
       * corners — so an in-place drag element gets clipped by its own lane and
       * simply vanishes. Rendering the clone outside both is the fix.
       */
      renderClone={(provided, snapshot, rubric) =>
        createPortal(
          <CardShell
            card={cards[rubric.source.index]}
            provided={provided}
            snapshot={snapshot}
            disabled={disabled}
            selected={isSelected(cards[rubric.source.index])}
            selectionCount={selectionCount}
          />,
          document.body
        )
      }
    >
      {(provided, snapshot) => (
        <section
          className={`acc-column acc-column--${status.replace(/_/g, '-')}${
            snapshot.isDraggingOver ? ' acc-column--over' : ''
          }`}
          aria-label={`${label} — ${cards.length}`}
        >
          <header className="acc-column__header">
            <span className="acc-subhead">{label}</span>
            <span className="acc-column__count acc-numeric">{cards.length}</span>
          </header>

          <ul ref={provided.innerRef} {...provided.droppableProps} className="acc-column__list">
            {cards.map((card, index) => (
              <AccommodationCard
                key={card.assignmentId}
                card={card}
                index={index}
                disabled={disabled}
                selected={isSelected(card)}
                selectionCount={selectionCount}
                onOpenDetail={onOpenDetail}
                onContextMenu={onContextMenu}
                onSelectClick={(c, event) => onSelectClick(c, event, columnIds)}
              />
            ))}
            {provided.placeholder}
            {footer}
          </ul>
        </section>
      )}
    </Droppable>
  );
}

export default memo(StatusColumn);
