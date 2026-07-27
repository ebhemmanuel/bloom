import { useState } from 'react';
import { usePopoverDismiss } from '../shell/AppHeader.jsx';
import { useData } from '../../context/DataContext.jsx';
import { renamePeriod } from '../../domain/mutations.js';

/**
 * Period filter as a dropdown rather than a chip row.
 *
 * A teacher with six or seven periods produced a chip row that wrapped and
 * pushed the lanes down the page; a dropdown keeps the toolbar to one line
 * whatever the timetable looks like.
 *
 * Right-clicking a row renames the period, which propagates everywhere the label
 * appears — lane headers, this filter, the add-student form.
 */
export default function PeriodFilter({ periods, selected, onChange }) {
  const { mutate, readOnly } = useData();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [draft, setDraft] = useState('');

  const ref = usePopoverDismiss(open, () => {
    setOpen(false);
    setRenaming(null);
  });

  if (periods.length === 0) return null;

  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((p) => p !== id) : [...selected, id]);

  const label =
    selected.length === 0
      ? 'All periods'
      : selected.length === 1
        ? periods.find((p) => p.id === selected[0])?.shortName || '1 period'
        : `${selected.length} periods`;

  const commitRename = (period) => {
    const next = draft.trim();
    mutate((d) => renamePeriod(d, period.id, next));
    setRenaming(null);
  };

  return (
    <div className="acc-periods" ref={ref}>
      <button
        type="button"
        className={`acc-btn${open ? ' acc-btn--on' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {label}
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="acc-periods__menu acc-enter" role="menu">
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={selected.length === 0}
            className={`acc-periods__row${selected.length === 0 ? ' acc-periods__row--on' : ''}`}
            onClick={() => onChange([])}
          >
            <span className="acc-periods__check">{selected.length === 0 ? '✓' : ''}</span>
            All periods
          </button>

          {periods.map((p) =>
            renaming === p.id ? (
              <form
                key={p.id}
                className="acc-periods__rename"
                onSubmit={(e) => {
                  e.preventDefault();
                  commitRename(p);
                }}
              >
                <div className="acc-inputgroup">
                  <input
                    className="acc-inputgroup__input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)}
                    placeholder={p.shortName}
                    aria-label={`Rename ${p.shortName}`}
                    autoFocus
                  />
                  <button type="submit" className="acc-inputgroup__action">
                    Save
                  </button>
                </div>
              </form>
            ) : (
              <button
                key={p.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={selected.includes(p.id)}
                className={`acc-periods__row${selected.includes(p.id) ? ' acc-periods__row--on' : ''}`}
                onClick={() => toggle(p.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (readOnly) return;
                  setDraft(p.name === p.shortName ? '' : p.name);
                  setRenaming(p.id);
                }}
                title="Right-click to rename"
              >
                <span className="acc-periods__check">{selected.includes(p.id) ? '✓' : ''}</span>
                <span className="acc-periods__label">{p.name}</span>
                <span className="acc-periods__count acc-numeric">{p.studentCount}</span>
              </button>
            )
          )}

          <p className="acc-periods__hint">Right-click a period to rename it.</p>
        </div>
      )}
    </div>
  );
}
