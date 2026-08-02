import { useState } from 'react';
import { STARTER_SETS, itemsForSet, allStarterItems } from '../../domain/starterSets.js';

/**
 * What one student receives, chosen from the common wordings.
 *
 * The inside of setup's "Choose supports" screen, lifted out so the add-student
 * sheet can put the same accordions behind the same button on its own roster
 * rows. Only the frame differs: setup gives it a whole screen, the sheet shows
 * it in place of the name pane.
 *
 * Chosen labels rather than catalog items, because the two callers commit
 * differently and neither wants the other's ids. Resolving a label back to its
 * wording is `resolveStarterItem`'s job, at the point of writing.
 */
export default function SupportsPicker({ chosen, onToggle, onAddCustom }) {
  const [open, setOpen] = useState(STARTER_SETS[0].id);
  const [draft, setDraft] = useState('');

  const starterLabels = allStarterItems().map((i) => i.label);
  const custom = chosen.filter((a) => !starterLabels.includes(a));

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    onAddCustom(value);
    setDraft('');
  };

  return (
    <>
      <div className="acc-ob__groups">
        {STARTER_SETS.map((set) => {
          const items = itemsForSet(set.id);
          const count = items.filter((i) => chosen.includes(i.label)).length;
          const isOpen = open === set.id;

          return (
            <div key={set.id} className="acc-ob__accordion">
              <button
                type="button"
                className="acc-ob__accordion-head"
                onClick={() => setOpen(isOpen ? null : set.id)}
                aria-expanded={isOpen}
              >
                <span className="acc-ob__accordion-text">
                  <span className="acc-ob__accordion-label">{set.label}</span>
                  <span className="acc-ob__accordion-hint">{set.hint}</span>
                </span>
                {count > 0 && <span className="acc-ob__count acc-numeric">{count} selected</span>}
                <span
                  className={`acc-ob__chevron${isOpen ? ' acc-ob__chevron--open' : ''}`}
                  aria-hidden="true"
                >
                  ▾
                </span>
              </button>

              {isOpen && (
                <div className="acc-ob__accordion-body acc-fade-enter">
                  {items.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className={`acc-ob__chip acc-ob__chip--item${
                        chosen.includes(item.label) ? ' acc-ob__chip--on' : ''
                      }`}
                      onClick={() => onToggle(item.label)}
                      aria-pressed={chosen.includes(item.label)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Anything the plan words its own way, kept beside the starters rather
          than behind a second screen. */}
      <div className="acc-ob__chips acc-ob__chips--custom">
        {custom.map((label) => (
          <button
            key={label}
            type="button"
            className="acc-ob__chip acc-ob__chip--on acc-ob__chip--item"
            onClick={() => onToggle(label)}
            aria-label={`Remove ${label}`}
          >
            {label} ×
          </button>
        ))}
        <input
          className="acc-ob__chip-input acc-ob__chip-input--wide"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Something specific to this student…"
          aria-label="Add a custom accommodation"
        />
      </div>
    </>
  );
}
