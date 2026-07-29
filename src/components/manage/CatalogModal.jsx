import { useCallback, useMemo, useState } from 'react';
import SceneFrame from '../shared/SceneFrame.jsx';
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
import useCustomScrollbar from '../../hooks/useCustomScrollbar.js';
import Caret from '../shared/Caret.jsx';
import { PencilIcon, ArchiveIcon, RestoreIcon } from '../shared/RowIcons.jsx';

/**
 * The shared accommodation list - the presets every student picks from. Built
 * to design_handoff_accommodation_presets/.
 *
 * On the app's sheet, with the starter sets promoted out of the fold at the
 * bottom into a view of their own. They were the least discoverable thing in
 * the app: an expander below a scrolling list, which is where a teacher with an
 * empty catalog would find the fastest way to fill it.
 *
 * The heading and the search are pinned and only the list scrolls, so the field
 * you are typing in never leaves the screen.
 *
 * Renaming here moves every student using that wording together, which is the
 * point: one district rewording should not require editing thirty students.
 * Days already recorded keep their own label snapshot, so old reports still
 * read exactly as they were signed.
 *
 * Nothing deletes. Archiving hides a preset from future pickers while leaving
 * every assignment and every day that references it intact.
 */
export default function CatalogModal({ onClose, background, leaving = false }) {
  const { doc, mutate, readOnly } = useData();

  const [view, setView] = useState('list');
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameText, setRenameText] = useState('');
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [openSet, setOpenSet] = useState(null);

  // The list scrolls inside the pane rather than the pane inside the sheet, so
  // it gets its own copy of the app's floating bar.
  const listScroll = useCustomScrollbar();

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
  const [active, archived, archivedTotal] = useMemo(() => {
    const q = normalizeSearch(query);
    const match = (c) => !q || normalizeSearch(c.label).includes(q);
    const byLabel = (a, b) => a.label.localeCompare(b.label);
    const found = doc.catalog.filter(match).slice().sort(byLabel);
    return [
      found.filter((c) => !c.archived),
      found.filter((c) => c.archived),
      // Counted across the WHOLE catalog, not the search results. The section
      // stays put while you type: a search that happens to match no archived
      // wording should narrow the fold, not make it disappear.
      doc.catalog.filter((c) => c.archived).length,
    ];
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

  const setList = useCallback(
    (el) => {
      listScroll.scrollRef.current = el;
    },
    [listScroll.scrollRef]
  );

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

            {/*
              A real <select>, with its native arrow suppressed and ours drawn
              over it. Keeping the element means the keyboard and the platform
              picker still work; drawing the caret means it is the same chevron,
              the same colour and the same inset as every other dropdown here.
            */}
            <span className="acc-catmod__catwrap">
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
              <Caret />
            </span>

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

            {/*
              Icons, because the row already carries a wording, a category and a
              count, and two more words of chrome per row made it read as a form
              rather than a list. Every one keeps a title AND an aria-label: an
              icon with no name is a guess for a sighted user and silence for a
              screen reader.
            */}
            <span className="acc-catmod__actions">
              <button
                type="button"
                className="acc-iconbtn"
                disabled={readOnly}
                title={`Rename "${c.label}" everywhere it is used`}
                aria-label={`Rename ${c.label}`}
                onClick={() => {
                  setRenameText(c.label);
                  setRenamingId(c.id);
                }}
              >
                <PencilIcon />
              </button>
              <button
                type="button"
                className="acc-iconbtn"
                disabled={readOnly}
                title={
                  c.archived
                    ? `Bring "${c.label}" back into the pickers`
                    : `Archive "${c.label}". It leaves future pickers; nothing already recorded changes.`
                }
                aria-label={c.archived ? `Restore ${c.label}` : `Archive ${c.label}`}
                onClick={() => mutate((d) => setCatalogArchived(d, c.id, !c.archived))}
              >
                {c.archived ? <RestoreIcon /> : <ArchiveIcon />}
              </button>
            </span>
          </>
        )}
      </li>
    );
  };

  const footer =
    view === 'list' ? (
      <>
        <div className="acc-sheet__footside">
          {/* Out of the fold at the bottom of the list and onto the footer,
              where the other sheets keep the way to their second view. */}
          <button
            type="button"
            className="acc-btn acc-btn--quiet"
            onClick={() => setView('starters')}
          >
            Browse starter sets
          </button>
        </div>
        <span className="acc-sheet__tip">
          Saves as it changes · Renaming updates every student together
        </span>
        <button type="button" className="acc-btn acc-btn--primary" onClick={onClose}>
          Done
        </button>
      </>
    ) : (
      <>
        <div className="acc-sheet__footside">
          <button type="button" className="acc-btn acc-btn--quiet" onClick={() => setView('list')}>
            Back
          </button>
        </div>
        <span className="acc-sheet__tip">Adding skips anything already in your list.</span>
        <button type="button" className="acc-btn acc-btn--primary" onClick={onClose}>
          Done
        </button>
      </>
    );

  return (
    <SceneFrame
      label="Accommodation presets"
      background={background}
      leaving={leaving}
      onClose={onClose}
      wide
      footer={footer}
    >
      {/* Keyed by view so the entrance replays on the swap. */}
      <div className="acc-sheet__view" key={view}>
        {view === 'list' ? (
          <div className="acc-sheet__pane acc-cat__pane">
            {/* Pinned: the heading and the field, with only the list below them
                scrolling. Searching should never push the search box away. */}
            <div className="acc-cat__head">
              <div className="acc-sheet__intro">
                <h1 className="acc-sheet__title">Accommodation presets</h1>
                <p className="acc-sheet__sub">
                  The shared list every student picks from. Renaming one updates it everywhere it is
                  used, and archiving never deletes anything.
                </p>
              </div>

              {/*
                One field for both jobs. You look for the wording you want, and
                if it is not there you are already holding it, so the same box
                adds it: a separate "Add a preset" input made the teacher type
                the same thing twice to find that out.
              */}
              <input
                className="acc-cat__search"
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
            </div>

            <div className="acc-cat__scroll">
              <ul className="acc-catmod__list" ref={setList} onScroll={listScroll.onScroll}>
                {active.map(renderRow)}

                {/*
                  The way out of an empty search: add what you just typed. Sits
                  at the end of the results rather than in a field of its own,
                  so it appears exactly when it is useful and the wording is
                  already written.
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
                  Archived, folded, underneath. Still reachable because
                  archiving is not deleting - assignments still point at these
                  and printed days still name them - but out of the way of the
                  working list.
                */}
                {archivedTotal > 0 && (
                  <li className="acc-catmod__archived">
                    <button
                      type="button"
                      className="acc-catmod__archivedhead"
                      onClick={() => setArchivedOpen((o) => !o)}
                      aria-expanded={archivedOpen}
                    >
                      <Caret up={archivedOpen} />
                      <span>Archived</span>
                      <span className="acc-catmod__used acc-numeric">{archivedTotal}</span>
                    </button>

                    {archivedOpen && (
                      <ul className="acc-catmod__list acc-catmod__list--nested">
                        {archived.length > 0 ? (
                          archived.map(renderRow)
                        ) : (
                          <li className="acc-catmod__none">No archived preset matches that.</li>
                        )}
                      </ul>
                    )}
                  </li>
                )}
              </ul>

              {listScroll.bar.height > 0 && (
                <div
                  className={`acc-scrollbar acc-scrollbar--inset${
                    listScroll.bar.visible ? ' acc-scrollbar--visible' : ''
                  }`}
                  style={{
                    top: `${listScroll.bar.trackTop}px`,
                    height: `${listScroll.bar.trackHeight}px`,
                  }}
                  aria-hidden="true"
                >
                  <div
                    className="acc-scrollbar__thumb"
                    style={{
                      top: `${listScroll.bar.top}px`,
                      height: `${listScroll.bar.height}px`,
                    }}
                    onPointerDown={listScroll.onThumbPointerDown}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="acc-sheet__pane acc-sheet__pane--wide">
            <div className="acc-sheet__intro">
              <h1 className="acc-sheet__title">Add from a starter set</h1>
              <p className="acc-sheet__sub">
                The wordings that recur across most districts, so a usable list is one click away. A
                starting point, not a standard: the authoritative wording is whatever the
                student&rsquo;s own plan says.
              </p>
            </div>

            <div className="acc-starters">
              {STARTER_SETS.map((set) => {
                // Anything already in the catalog is dropped, so a set can be
                // opened twice without duplicating a word of it.
                const items = itemsForSet(set.id).filter(
                  (i) => !existing.has(i.label.toLowerCase())
                );
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
                      <span className="acc-starter__hint">{set.hint}</span>
                      <span className="acc-cat__count">
                        {items.length ? `${items.length} not yet added` : 'all added'}
                      </span>
                      <span className="acc-starter__chevron">{isOpen ? '−' : '+'}</span>
                    </button>

                    {isOpen && items.length > 0 && (
                      <div className="acc-starter__body">
                        <button
                          type="button"
                          className="acc-btn acc-btn--small acc-btn--quiet"
                          disabled={readOnly}
                          onClick={() =>
                            mutate((d) =>
                              items.reduce((acc, item) => addCatalogEntry(acc, item), d)
                            )
                          }
                        >
                          Add all {items.length}
                        </button>
                        <div className="acc-wiz__chips">
                          {items.map((item) => (
                            <button
                              key={item.label}
                              type="button"
                              className="acc-chip acc-chip--wrap"
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
        )}
      </div>
    </SceneFrame>
  );
}
