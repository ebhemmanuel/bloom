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
import Caret from '../shared/Caret.jsx';

/**
 * The shared accommodation list - the presets every student picks from.
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
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [openSet, setOpenSet] = useState(null);

  const usageCount = useMemo(() => {
    const counts = new Map();
    for (const a of doc.assignments) {
      if (a.source !== 'catalog' || !a.catalogId) continue;
      counts.set(a.catalogId, (counts.get(a.catalogId) || 0) + 1);
    }
    return counts;
  }, [doc.assignments]);

  /**
   * Active and archived, split rather than mixed behind a checkbox.
   *
   * Archiving is not deleting: the wording is still referenced by assignments
   * and still named on printed days, so it has to stay reachable. But it is not
   * part of the working list either, and a "show archived" toggle made it a
   * mode the whole screen was in. A folded section underneath says both things
   * at once: they are still here, and they are not what you are working on.
   */
  const [active, archived] = useMemo(() => {
    const q = normalizeSearch(query);
    const match = (c) => !q || normalizeSearch(c.label).includes(q);
    const byLabel = (a, b) => a.label.localeCompare(b.label);
    const found = doc.catalog.filter(match).slice().sort(byLabel);
    return [found.filter((c) => !c.archived), found.filter((c) => c.archived)];
  }, [doc.catalog, query]);

  const existing = useMemo(
    () => new Set(doc.catalog.map((c) => c.label.toLowerCase())),
    [doc.catalog]
  );

  /**
   * The typed wording is addable when it is not already a preset.
   *
   * Compared against the WHOLE catalog rather than the visible rows, so a
   * wording that exists but is archived, or filtered out of view, is not
   * silently duplicated.
   */
  const typed = query.trim();
  const canAdd = !readOnly && typed.length > 0 && !existing.has(typed.toLowerCase());

  const addTyped = () => {
    if (!canAdd) return;
    mutate((d) => addCatalogEntry(d, { label: typed }));
    setQuery('');
  };

  const renderRow = (c) => {
    const used = usageCount.get(c.id) || 0;
    return (
      <li key={c.id} className={`acc-catmod__row${c.archived ? ' acc-catmod__row--archived' : ''}`}>
        {renamingId === c.id ? (
          <form
            className="acc-catmod__rename"
            onSubmit={(e) => {
              e.preventDefault();
              mutate((d) => renameCatalogEntry(d, c.id, renameText));
              setRenamingId(null);
            }}
          >
            <div className="acc-inputgroup">
              <input
                className="acc-inputgroup__input"
                value={renameText}
                onChange={(e) => setRenameText(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setRenamingId(null)}
                aria-label="New wording"
                autoFocus
              />
              <button
                type="submit"
                className="acc-inputgroup__action"
                disabled={!renameText.trim()}
              >
                Save
              </button>
            </div>
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

            <label className="acc-catmod__detail" title="Requires a written detail each time">
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
                className="acc-btn acc-btn--quiet"
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
                className="acc-btn acc-btn--quiet"
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
  };

  return (
    <Modal
      wide
      title="Accommodation presets"
      subtitle="The shared list every student picks from. Renaming one updates it everywhere it is used."
      onClose={onClose}
      action={
        /*
          One field for both jobs, and it belongs to the dialog rather than to
          its list, so it sits in the header. You look for the wording you want,
          and if it is not there you are already holding it, so the same box
          adds it: a separate "Add a preset" input made the teacher type the
          same thing twice to find that out.
        */
        <input
          className="acc-field__input acc-catmod__search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canAdd) {
              e.preventDefault();
              addTyped();
            }
          }}
          placeholder="Search, or type a new one…"
          aria-label="Search presets, or type a new one"
          autoFocus
        />
      }
    >
      <div className="acc-catmod">
        <ul className="acc-catmod__list">
          {active.map(renderRow)}

          {/*
            The way out of an empty search: add what you just typed. Sits at the
            end of the results rather than in a field of its own, so it appears
            exactly when it is useful and the wording is already written.
          */}
          {canAdd && (
            <li className="acc-catmod__row acc-catmod__row--add acc-fade-enter">
              <button type="button" className="acc-catmod__addbtn" onClick={addTyped}>
                <span className="acc-catmod__addplus" aria-hidden="true">
                  +
                </span>
                <span>
                  Add <strong>{typed}</strong> as a preset
                </span>
              </button>
            </li>
          )}

          {active.length === 0 && !canAdd && (
            <li className="acc-catmod__none">
              {typed ? 'That one is already in your list.' : 'Nothing matches.'}
            </li>
          )}

          {/*
            Archived, folded, underneath. Still reachable because archiving is
            not deleting - assignments still point at these and printed days
            still name them - but out of the way of the working list.
          */}
          {archived.length > 0 && (
            <li className="acc-catmod__archived">
              <button
                type="button"
                className="acc-catmod__archivedhead"
                onClick={() => setArchivedOpen((o) => !o)}
                aria-expanded={archivedOpen}
              >
                <Caret up={archivedOpen} />
                <span>Archived</span>
                <span className="acc-catmod__used acc-numeric">{archived.length}</span>
              </button>

              {archivedOpen && <ul className="acc-catmod__list">{archived.map(renderRow)}</ul>}
            </li>
          )}
        </ul>

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
