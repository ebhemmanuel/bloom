import { itemsForSet, STARTER_SETS } from '../../domain/starterSets.js';

/**
 * The two ways into a list of accommodations: paste the plan, or tick a starter
 * set. Shared by the add-student and edit-student sheets.
 *
 * It lives in its own file because both wizards ask the same question and any
 * answer to it - the bracket-safe splitter, the New / Already in your list
 * tagging, the six sets - would otherwise exist twice and drift once.
 *
 * State is the caller's. Which route was chosen, what was pasted and what was
 * ticked all belong to the flow around this, which is what decides when to
 * commit them.
 */
export default function AccommodationChooser({
  mode,
  onMode,
  paste,
  onPaste,
  parsed,
  picked,
  onTogglePick,
  onToggleSet,
  openSet,
  onOpenSet,
}) {
  return (
    <>
      {mode === null && (
        <div className="acc-wiz__chooser">
          <button type="button" className="acc-wiz__choice" onClick={() => onMode('paste')}>
            <span className="acc-wiz__choice-name">Paste from the IEP</span>
            <span className="acc-wiz__choice-body">
              Copy the accommodation cells straight out of the spreadsheet - one per line, or
              separated by commas.
            </span>
          </button>
          <button type="button" className="acc-wiz__choice" onClick={() => onMode('starter')}>
            <span className="acc-wiz__choice-name">Pick from a starter set</span>
            <span className="acc-wiz__choice-body">
              Common wordings in six categories, ready to tick. A quick start when the plan is not
              in front of you.
            </span>
          </button>
        </div>
      )}

      {mode !== null && (
        <div className="acc-wiz__back">
          <button type="button" className="acc-wiz__backlink" onClick={() => onMode(null)}>
            &lsaquo; Choose a different way
          </button>
        </div>
      )}

      {mode === 'paste' && (
        <>
          <div className="acc-wiz__field">
            <span className="acc-wiz__label">Paste their accommodations</span>
            <textarea
              className="acc-paste acc-wiz__paste"
              value={paste}
              onChange={(e) => onPaste(e.target.value)}
              rows={6}
              placeholder={
                'Copy the accommodation cells straight out of the IEP spreadsheet and paste here.\n\n' +
                'One per line, or separated by commas.'
              }
              aria-label="Paste their accommodations"
            />
            <span className="acc-wiz__hint">
              Commas inside brackets are safe - “Preferential seating (front, near instruction)”
              stays in one piece.
            </span>
          </div>

          {parsed.items.length > 0 && (
            <div className="acc-preview">
              <p className="acc-preview__summary">
                {parsed.items.length} accommodation{parsed.items.length === 1 ? '' : 's'} found
                {parsed.duplicates.length > 0 && `, ${parsed.duplicates.length} duplicate skipped`}
              </p>
              <ul className="acc-preview__list">
                {parsed.items.map((item) => (
                  <li key={item.label} className="acc-preview__item">
                    <span className="acc-preview__label">{item.label}</span>
                    <span
                      className={`acc-preview__tag acc-preview__tag--${item.isNew ? 'new' : 'reuse'}`}
                    >
                      {item.isNew ? 'New' : 'Already in your list'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {mode === 'starter' && (
        <div className="acc-starters">
          {STARTER_SETS.map((set) => {
            const items = itemsForSet(set.id);
            const chosen = items.filter((i) => picked.some((p) => p.label === i.label)).length;
            const isOpen = openSet === set.id;

            return (
              <div key={set.id} className="acc-starter">
                <button
                  type="button"
                  className="acc-starter__head"
                  onClick={() => onOpenSet(isOpen ? null : set.id)}
                  aria-expanded={isOpen}
                >
                  <span className="acc-starter__name">{set.label}</span>
                  <span className="acc-starter__hint">{set.hint}</span>
                  {chosen > 0 && <span className="acc-starter__badge acc-numeric">{chosen}</span>}
                  <span className="acc-starter__chevron">{isOpen ? '−' : '+'}</span>
                </button>

                {isOpen && (
                  <div className="acc-starter__body">
                    <button
                      type="button"
                      className="acc-btn acc-btn--small acc-btn--quiet"
                      onClick={() => onToggleSet(set.id)}
                    >
                      {chosen === items.length ? 'Clear all' : 'Select all'}
                    </button>
                    <div className="acc-wiz__chips">
                      {items.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          className={`acc-chip acc-chip--wrap${
                            picked.some((p) => p.label === item.label) ? ' acc-chip--on' : ''
                          }`}
                          onClick={() => onTogglePick(item)}
                          aria-pressed={picked.some((p) => p.label === item.label)}
                        >
                          {item.label}
                          {item.requiresDetail && <span className="acc-chip__count">detail</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
