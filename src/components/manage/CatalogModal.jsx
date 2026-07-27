import { useMemo, useState } from 'react';
import Modal from '../shared/Modal.jsx';
import { useData } from '../../context/DataContext.jsx';
import {
  renameCatalogEntry,
  setCatalogArchived,
  updateCatalogEntry,
  addCatalogEntry,
} from '../../domain/mutations.js';
import { STARTER_SETS, itemsForSet } from '../../domain/starterSets.js';
import { CATEGORIES } from '../../domain/constants.js';
import { normalizeSearch } from '../../domain/selectors.js';

/**
 * The shared accommodation list — the presets every student picks from.
 *
 * Renaming here moves every student using that wording together, which is the
 * point: one district rewording should not require editing thirty students. Days
 * already recorded keep their own label snapshot, so old reports still read
 * exactly as they were signed.
 *
 * Nothing deletes. Archiving hides a preset from future pickers while leaving
 * every assignment and every day that references it intact.
 */
export default function CatalogModal({ onClose }) {
  const { doc, mutate, readOnly } = useData();

  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameText, setRenameText] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [openSet, setOpenSet] = useState(null);

  const usageCount = useMemo(() => {
    const counts = new Map();
    for (const a of doc.assignments) {
      if (a.source !== 'catalog' || !a.catalogId) continue;
      counts.set(a.catalogId, (counts.get(a.catalogId) || 0) + 1);
    }
    return counts;
  }, [doc.assignments]);

  const rows = useMemo(() => {
    const q = normalizeSearch(query);
    return doc.catalog
      .filter((c) => showArchived || !c.archived)
      .filter((c) => !q || normalizeSearch(c.label).includes(q))
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [doc.catalog, query, showArchived]);

  const existing = useMemo(
    () => new Set(doc.catalog.map((c) => c.label.toLowerCase())),
    [doc.catalog]
  );

  return (
    <Modal
      wide
      title="Accommodation presets"
      subtitle="The shared list every student picks from. Renaming one updates it everywhere it is used."
      onClose={onClose}
    >
      <div className="acc-catmod">
        <div className="acc-catmod__bar">
          <input
            className="acc-field__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search presets…"
            aria-label="Search presets"
            autoFocus
          />
          <label className="acc-catmod__toggle">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>
        </div>

        <ul className="acc-catmod__list">
          {rows.map((c) => {
            const used = usageCount.get(c.id) || 0;
            return (
              <li
                key={c.id}
                className={`acc-catmod__row${c.archived ? ' acc-catmod__row--archived' : ''}`}
              >
                {renamingId === c.id ? (
                  <form
                    className="acc-catmod__rename"
                    onSubmit={(e) => {
                      e.preventDefault();
                      mutate((d) => renameCatalogEntry(d, c.id, renameText));
                      setRenamingId(null);
                    }}
                  >
                    <input
                      className="acc-field__input acc-field__input--inline"
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && setRenamingId(null)}
                      aria-label="New wording"
                      autoFocus
                    />
                    <button type="submit" className="acc-btn acc-btn--small">
                      Save
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="acc-catmod__label">{c.label}</span>

                    <select
                      className="acc-catmod__cat"
                      value={c.category}
                      disabled={readOnly}
                      aria-label={`Category for ${c.label}`}
                      onChange={(e) =>
                        mutate((d) => updateCatalogEntry(d, c.id, { category: e.target.value }))
                      }
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.label}
                        </option>
                      ))}
                    </select>

                    <label
                      className="acc-catmod__detail"
                      title="Requires a written detail each time"
                    >
                      <input
                        type="checkbox"
                        checked={c.requiresDetail}
                        disabled={readOnly}
                        onChange={(e) =>
                          mutate((d) =>
                            updateCatalogEntry(d, c.id, {
                              requiresDetail: e.target.checked,
                              // A narrative accommodation can never be a
                              // one-click bulk claim.
                              bulkEligible: !e.target.checked,
                              bulkActions: e.target.checked ? [] : ['mark_used'],
                            })
                          )
                        }
                      />
                      detail
                    </label>

                    <span className="acc-catmod__used acc-numeric" title="Students using this">
                      {used}
                    </span>

                    <span className="acc-catmod__actions">
                      <button
                        type="button"
                        className="acc-btn acc-btn--small acc-btn--quiet"
                        disabled={readOnly}
                        onClick={() => {
                          setRenameText(c.label);
                          setRenamingId(c.id);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="acc-btn acc-btn--small acc-btn--quiet"
                        disabled={readOnly}
                        title={
                          c.archived
                            ? 'Bring it back into the pickers'
                            : 'Hide from future pickers. Nothing already recorded changes.'
                        }
                        onClick={() => mutate((d) => setCatalogArchived(d, c.id, !c.archived))}
                      >
                        {c.archived ? 'Restore' : 'Archive'}
                      </button>
                    </span>
                  </>
                )}
              </li>
            );
          })}
          {rows.length === 0 && <li className="acc-catmod__none">Nothing matches.</li>}
        </ul>

        <form
          className="acc-catmod__add"
          onSubmit={(e) => {
            e.preventDefault();
            mutate((d) => addCatalogEntry(d, { label: newLabel }));
            setNewLabel('');
          }}
        >
          <input
            className="acc-field__input"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Add a preset…"
            aria-label="Add a preset"
            disabled={readOnly}
          />
          <button
            type="submit"
            className="acc-btn acc-btn--small acc-btn--primary"
            disabled={readOnly || !newLabel.trim() || existing.has(newLabel.trim().toLowerCase())}
          >
            Add
          </button>
        </form>

        <div className="acc-catmod__starters">
          <p className="acc-field__label">Add from a starter set</p>
          {STARTER_SETS.map((set) => {
            const items = itemsForSet(set.id).filter((i) => !existing.has(i.label.toLowerCase()));
            const isOpen = openSet === set.id;
            return (
              <div key={set.id} className="acc-starter">
                <button
                  type="button"
                  className="acc-starter__head"
                  onClick={() => setOpenSet(isOpen ? null : set.id)}
                  aria-expanded={isOpen}
                >
                  <span className="acc-starter__name">{set.label}</span>
                  <span className="acc-starter__hint">
                    {items.length ? `${items.length} not yet added` : 'all added'}
                  </span>
                  <span className="acc-starter__chevron">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && items.length > 0 && (
                  <div className="acc-starter__body">
                    <button
                      type="button"
                      className="acc-btn acc-btn--small"
                      disabled={readOnly}
                      onClick={() =>
                        mutate((d) => items.reduce((acc, item) => addCatalogEntry(acc, item), d))
                      }
                    >
                      Add all {items.length}
                    </button>
                    <div className="acc-chipset">
                      {items.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          className="acc-chip"
                          disabled={readOnly}
                          onClick={() => mutate((d) => addCatalogEntry(d, item))}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
