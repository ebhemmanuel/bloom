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
 */
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
              {/* `hidden` drops an item that cannot do anything here, such as
                  quitting from a browser tab, rather than showing it disabled. */}
              {menu.items
                .filter((item) => !item.hidden)
                .map((item, i) =>
                  item.separator ? (
                    // eslint-disable-next-line react/no-array-index-key
                    <hr className="acc-menubar__sep" key={`sep${i}`} />
                  ) : (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      className="acc-menubar__item"
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
