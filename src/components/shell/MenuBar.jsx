import { useEffect, useRef, useState } from 'react';

/**
 * File / Edit / Notes / About, next to the wordmark.
 *
 * Desktop-app convention: once open, moving across the bar switches menus
 * without another click, which is what makes a menu bar feel native rather than
 * like three unrelated dropdowns.
 *
 * A menu with `onSelect` and no `items` is a plain action in the same row -
 * Notes opens its dialog directly rather than a one-item dropdown. It still
 * closes an open menu on the way past, so the bar never ends up with a dropdown
 * hanging open behind a dialog.
 *
 * An item can also be `{ separator: true }`, or `{ heading }` for a group
 * label. Items under a heading take `indent: true`, which is what lets them be
 * named for the verb alone - "Add", not "Add accommodations to a student".
 */
/**
 * Items that should actually be drawn, with the separators tidied.
 *
 * `hidden` drops an item that cannot do anything here - quitting from a browser
 * tab, say - and dropping one can strand the rule that sat beside it. A menu
 * ending in a hairline, or opening with one, reads as a list with something
 * missing off the end. Leading, trailing and doubled separators go.
 */
function visibleItems(items) {
  const shown = items.filter((item) => !item.hidden);
  return shown.filter((item, i) => {
    if (!item.separator) return true;
    const before = shown.slice(0, i).some((x) => !x.separator);
    const after = shown.slice(i + 1).some((x) => !x.separator);
    const previous = shown[i - 1];
    return before && after && !previous?.separator;
  });
}

export default function MenuBar({ menus }) {
  const [open, setOpen] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <nav className="acc-menubar" ref={ref} aria-label="Main menu">
      {menus.map((menu) => (
        <div className="acc-menubar__slot" key={menu.id}>
          <button
            type="button"
            className={`acc-menubar__trigger${open === menu.id ? ' acc-menubar__trigger--on' : ''}`}
            onClick={() => {
              if (menu.onSelect) {
                setOpen(null);
                menu.onSelect();
                return;
              }
              setOpen((cur) => (cur === menu.id ? null : menu.id));
            }}
            // Hover only steers an already-open bar; it never opens one.
            onMouseEnter={() => open && !menu.onSelect && setOpen(menu.id)}
            aria-expanded={menu.onSelect ? undefined : open === menu.id}
            aria-haspopup={menu.onSelect ? undefined : 'menu'}
          >
            {menu.label}
            {/* Something is already written for this day. A dot rather than a
                count: it reports that the note exists, not how much of it. */}
            {menu.pip && <span className="acc-menubar__pip" aria-hidden="true" />}
          </button>

          {open === menu.id && menu.items && (
            <div className="acc-menubar__menu acc-enter" role="menu" aria-label={menu.label}>
              {visibleItems(menu.items).map((item, i) =>
                item.separator ? (
                  // eslint-disable-next-line react/no-array-index-key
                  <hr className="acc-menubar__sep" key={`sep${i}`} />
                ) : item.heading ? (
                  // A group label, not a choice: it names what the items
                  // under it act on, so those can drop the noun and be read
                  // as verbs.
                  <p className="acc-menubar__group" key={item.heading}>
                    {item.heading}
                  </p>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    className={`acc-menubar__item${item.indent ? ' acc-menubar__item--indent' : ''}`}
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(null);
                      item.onSelect?.();
                    }}
                  >
                    <span>{item.label}</span>
                    {item.hint && <span className="acc-menubar__hint">{item.hint}</span>}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
