/**
 * Ambient-register empty state: warm, one sentence, one action.
 *
 * Used for the two states that matter most - "no record for this day" and "no
 * students match" - so the wording carries real weight. See the design doc §5.11.
 */
export default function EmptyState({ title, body, actionLabel, onAction }) {
  return (
    <div className="acc-empty acc-enter">
      <div className="acc-empty__glow" aria-hidden="true" />
      <div className="acc-empty__content">
        <h2 className="acc-empty__title">{title}</h2>
        <p className="acc-empty__body">{body}</p>
        {actionLabel && onAction && (
          <button type="button" className="acc-btn acc-btn--primary" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
