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
        {/*
          Keyed by their own text, so they re-render only when the words
          actually change.

          Stepping between two days that both have no record changes nothing on
          this screen except, sometimes, a date in the heading - and fading the
          whole block, button included, animated a lot of things that had not
          moved. Keying on the string means React replaces the node only when
          there is something new to read, and the entrance animation plays then
          and only then.
        */}
        <h2 className="acc-empty__title acc-fade-enter" key={title}>
          {title}
        </h2>
        <p className="acc-empty__body acc-fade-enter" key={body}>
          {body}
        </p>
        {actionLabel && onAction && (
          <button type="button" className="acc-btn acc-btn--primary" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
