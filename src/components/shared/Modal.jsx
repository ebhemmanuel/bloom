import { useEffect } from 'react';
import Scrim from './Scrim.jsx';
import useDismissAnimation from '../../hooks/useDismissAnimation.js';
import useAutoHeight from '../../hooks/useAutoHeight.js';

/**
 * `action` renders in the header, between the title and the close button.
 *
 * For the one control that belongs to the whole dialog rather than to anything
 * in it, such as a search over its list. Putting it in the body would make it
 * the first row of the content, which is what it is not.
 */
export default function Modal({ title, subtitle, wide, action, onClose, children }) {
  // Leaves the way it arrived. Every exit - ×, click-outside, Escape - routes
  // through `dismiss`, so no one path cuts while the others ease out.
  const { leaving, dismiss } = useDismissAnimation(onClose);

  /**
   * The dialog eases between heights as its contents change.
   *
   * Filtering a list or revealing a row used to jump the whole window to its new
   * size, which reads as the dialog being replaced rather than as its contents
   * changing. Same treatment the command palette gets.
   */
  const [modalRef, measureRef] = useAutoHeight('--acc-modal-h');

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
        ref={modalRef}
        className={`acc-modal${wide ? ' acc-modal--wide' : ''} ${leaving ? 'acc-leave' : 'acc-enter'}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Free to take its natural height, which is what makes it measurable.
            The dialog outside it is the thing that animates. */}
        <div className="acc-modal__measure" ref={measureRef}>
          <header className="acc-modal__header">
            <div className="acc-modal__heading">
              <h2 className="acc-modal__title">{title}</h2>
              {subtitle && <p className="acc-modal__subtitle">{subtitle}</p>}
            </div>
            {action && <div className="acc-modal__action">{action}</div>}
            <button
              type="button"
              className="acc-popover__close"
              onClick={dismiss}
              aria-label="Close"
            >
              ×
            </button>
          </header>
          <div className="acc-modal__body">{children}</div>
        </div>
      </div>
    </Scrim>
  );
}
