import { useEffect } from 'react';

export default function Modal({ title, subtitle, wide, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="acc-scrim acc-fade-enter" onMouseDown={onClose}>
      <div
        className={`acc-modal${wide ? ' acc-modal--wide' : ''} acc-enter`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="acc-modal__header">
          <div>
            <h2 className="acc-modal__title">{title}</h2>
            {subtitle && <p className="acc-modal__subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="acc-popover__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="acc-modal__body">{children}</div>
      </div>
    </div>
  );
}
