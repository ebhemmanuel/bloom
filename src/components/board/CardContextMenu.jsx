import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  BOARD_COLUMNS,
  STATUS,
  STATUS_LABEL,
  USE_COUNT_OPTIONS,
  COUNTABLE_STATUSES,
  DEFAULTABLE_STATUSES,
} from '../../domain/constants.js';

/**
 * Custom right-click menu for a card.
 *
 * Three groups:
 *   1. Move to a track (the columns), for when dragging is not convenient.
 *   2. Used more than once — a repeat count, only on statuses where usage
 *      actually happened.
 *   3. Set as this student's standing default, so the accommodation is pre-set
 *      every new day for the rest of the year.
 */
export default function CardContextMenu({
  card,
  selectionCount = 0,
  x,
  y,
  onClose,
  onMove,
  onSetUseCount,
  onSetDefault,
  onSetNotRelevant,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    // Any scroll invalidates the anchor position, so close rather than float.
    window.addEventListener('scroll', onClose, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  // Clamp against the viewport using the menu's known footprint, per the spec.
  // No measure-then-reposition pass: that renders once at the raw point and
  // corrects on the next frame, which shows as a visible jump.
  const left = Math.min(x, window.innerWidth - 276);
  const top = Math.min(y, window.innerHeight - 360);

  // An irrelevant card has no status to count or default — every other group is
  // meaningless while it is excluded from this class.
  const countable = !card.notRelevant && COUNTABLE_STATUSES.includes(card.status);
  const defaultable = !card.notRelevant && DEFAULTABLE_STATUSES.includes(card.status);

  /**
   * Rendered into <body>, NOT in place.
   *
   * The board card carries `backdrop-filter`, which creates a containing block
   * for fixed-position descendants — so a `position: fixed` menu rendered inside
   * it is positioned against the board rather than the viewport, and lands far
   * from the card that was clicked. A portal is the only way to get true
   * viewport coordinates back.
   */
  return createPortal(
    <>
      {/* Full-screen catcher: any click, or another right-click, dismisses. */}
      <div
        className="acc-ctx__overlay"
        onMouseDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="acc-ctx acc-ctx--enter"
        role="menu"
        aria-label={`Actions for ${card.label}`}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ '--acc-ctx-left': `${left}px`, '--acc-ctx-top': `${top}px` }}
      >
        <p className="acc-ctx__title">
          {selectionCount > 1 ? `${selectionCount} cards selected` : card.label}
        </p>

        <div className="acc-ctx__group" role="group" aria-label="Move to">
          <p className="acc-ctx__heading">Move to</p>
          {BOARD_COLUMNS.map((col) => (
            <button
              key={col.id}
              type="button"
              role="menuitem"
              className={`acc-ctx__item${card.status === col.id ? ' acc-ctx__item--current' : ''}`}
              onClick={() => {
                onMove(card, col.id);
                onClose();
              }}
            >
              <span className={`acc-ctx__swatch acc-ctx__swatch--${col.id.replace(/_/g, '-')}`} />
              {col.label}
              {card.status === col.id && <span className="acc-ctx__check">✓</span>}
            </button>
          ))}
        </div>

        {countable && (
          <div className="acc-ctx__group" role="group" aria-label="Times used">
            <p className="acc-ctx__heading">Used more than once</p>
            <div className="acc-ctx__counts">
              {USE_COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="menuitemradio"
                  aria-checked={card.useCount === n}
                  className={`acc-ctx__count${card.useCount === n ? ' acc-ctx__count--on' : ''}`}
                  onClick={() => {
                    onSetUseCount(card, n);
                    onClose();
                  }}
                >
                  {n === 1 ? 'Once' : `×${n}`}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="acc-ctx__group" role="group" aria-label="This subject">
          <p className="acc-ctx__heading">This subject</p>
          <button
            type="button"
            role="menuitem"
            className="acc-ctx__item"
            onClick={() => {
              onSetNotRelevant(card, !card.notRelevant);
              onClose();
            }}
          >
            {card.notRelevant ? 'Counts for this subject again' : 'Not relevant to subject'}
          </button>
          <p className="acc-ctx__note">
            Excluded from this class&rsquo;s totals — it resolves as not applicable, never as Not
            Used.
          </p>
        </div>

        <div className="acc-ctx__group" role="group" aria-label="Standing default">
          <p className="acc-ctx__heading">Every day this year</p>

          {defaultable && card.defaultStatus !== card.status && (
            <button
              type="button"
              role="menuitem"
              className="acc-ctx__item"
              onClick={() => {
                onSetDefault(card, card.status);
                onClose();
              }}
            >
              Always start as “{STATUS_LABEL[card.status]}”
            </button>
          )}

          {card.defaultStatus && (
            <button
              type="button"
              role="menuitem"
              className="acc-ctx__item acc-ctx__item--danger"
              onClick={() => {
                onSetDefault(card, null);
                onClose();
              }}
            >
              Stop defaulting to “{STATUS_LABEL[card.defaultStatus]}”
            </button>
          )}

          {!defaultable && !card.defaultStatus && (
            <p className="acc-ctx__note">
              Move the card to Used or Used with Detail first, then set it as the default.
            </p>
          )}

          {card.defaultStatus === card.status && (
            <p className="acc-ctx__note">Already the default. New days start here automatically.</p>
          )}

          {defaultable && card.requiresDetail && (
            <p className="acc-ctx__note acc-ctx__note--warn">
              This accommodation needs a written detail each time, so a default can only pre-set the
              status — you will still need to describe what you provided.
            </p>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
