import { memo } from 'react';
import { Droppable } from '@hello-pangea/dnd';
import AccommodationCard from './AccommodationCard.jsx';

/**
 * One status column inside one student's swimlane.
 *
 * The droppable `type` is scoped per student (`lane-<studentId>`). That makes the
 * "a card belongs to exactly one student" rule an invariant enforced by the drag
 * library itself — other students' columns are not even highlighted during a
 * drag — rather than a rejection branch in onDragEnd that the user only
 * discovers by trying and failing.
 */
function StatusColumn({ studentId, status, label, cards, disabled, onOpenDetail }) {
  return (
    <Droppable
      droppableId={`drop:${studentId}:${status}`}
      type={`lane-${studentId}`}
      isDropDisabled={disabled}
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
                onOpenDetail={onOpenDetail}
              />
            ))}
            {provided.placeholder}
          </ul>
        </section>
      )}
    </Droppable>
  );
}

export default memo(StatusColumn);
