import { useEffect } from 'react';
import Scrim from './Scrim.jsx';
import useDismissAnimation from '../../hooks/useDismissAnimation.js';

export default function Modal({ title, subtitle, wide, onClose, children }) {
  // Leaves the way it arrived. Every exit - ×, click-outside, Escape - routes
  // through `dismiss`, so no one path cuts while the others ease out.
  const { leaving, dismiss } = useDismissAnimation(onClose);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dismiss]);

  return (
    <Scrim leaving={leaving} onDismiss={dismiss}>
      <div
        className={`acc-modal${wide ? ' acc-modal--wide' : ''} ${leaving ? 'acc-leave' : 'acc-enter'}`}
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
          <button type="button" className="acc-popover__close" onClick={dismiss} aria-label="Close">
            ×
          </button>
        </header>
        <div className="acc-modal__body">{children}</div>
      </div>
    </Scrim>
  );
}
