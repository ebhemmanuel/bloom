import { useEffect, useRef, useState } from 'react';

/**
 * File / Edit / About, next to the wordmark.
 *
 * Desktop-app convention: once open, moving across the bar switches menus
 * without another click, which is what makes a menu bar feel native rather than
 * like three unrelated dropdowns.
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
            onClick={() => setOpen((cur) => (cur === menu.id ? null : menu.id))}
            // Hover only steers an already-open bar; it never opens one.
            onMouseEnter={() => open && setOpen(menu.id)}
            aria-expanded={open === menu.id}
            aria-haspopup="menu"
          >
            {menu.label}
          </button>

          {open === menu.id && (
            <div className="acc-menubar__menu acc-enter" role="menu" aria-label={menu.label}>
              {menu.items.map((item, i) =>
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
