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
/**
 * Which of the two views is showing. There is no third state any more: the
 * screen opens on the paste box, because a teacher reaching this step has the
 * plan in front of them and the starter sets are the fallback for when they do
 * not. The fork that used to stand in front of both was a screen spent choosing
 * how to answer rather than answering.
 */
export const routeOf = (mode) => (mode === 'starter' ? 'starter' : 'paste');

export default function AccommodationChooser({
  mode,
  paste,
  onPaste,
  parsed,
  picked,
  onTogglePick,
  onToggleSet,
  openSet,
  onOpenSet,
  // Suppressed while the paste box is holding their own list for editing - the
  // box IS the list there, and showing it twice invites editing the wrong one.
  hidePicked = false,
}) {
  const route = routeOf(mode);

  return (
    <>
      {/*
        What this student already has, under whichever view is open.

        It used to sit at the fork, so taking a route hid it - and a screen that
        opened on the starter sets looked like nothing had been chosen at all.
        Both views now carry it, where it can be read and removed.
      */}
      {!hidePicked && picked.length > 0 && (
        <div className="acc-wiz__field">
          <span className="acc-wiz__label">
            {picked.length} chosen so far - click one to take it off
          </span>
          <div className="acc-wiz__chips">
            {picked.map((item) => (
              <button
                key={item.label}
                type="button"
                className="acc-chip acc-chip--wrap acc-chip--on"
                onClick={() => onTogglePick(item)}
                aria-label={`Remove ${item.label}`}
              >
                {item.label}
                <span className="acc-chip__count" aria-hidden="true">
                  ×
                </span>
              </button>
            ))}
          </div>
          <span className="acc-wiz__hint">
            Pasting and the presets both add to this list. Nothing is written until the review.
          </span>
        </div>
      )}

      {/*
        No back-link up here. Getting out of a route is the same kind of move as
        Back, so it IS Back: the footer's left-hand button says "Choose a
        different way" while a route is open. A second, differently-styled way
        backwards floating above the content was one control too many, and the
        one place a teacher already looks for it is the bottom left.
      */}

      {route === 'paste' && (
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

      {route === 'starter' && (
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
