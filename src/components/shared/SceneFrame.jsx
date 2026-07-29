import { useEffect } from 'react';
import AmbientScene from './AmbientScene.jsx';

/**
 * The frame the app's full-screen sheets are built on.
 *
 * Not a dialog on a scrim. Opening one cascades the board away and lands here,
 * the way About does - so every full-screen destination in the app arrives the
 * same way. The caller owns that half of it: see `openScene` in App.jsx, which
 * runs the cascade and holds the sheet mounted through its own exit.
 *
 * Three zones, fixed: a header carrying only the close (plus whatever the screen
 * puts beside it), a scrolling body that centres its view, and a footer. See
 * `.acc-sheet`.
 *
 * `canClose` lets a screen keep the first Escape for itself - the wizard's plan
 * menu takes one before the sheet will take the next.
 */
export default function SceneFrame({
  label,
  background,
  leaving = false,
  onClose,
  wide = false,
  head = null,
  footer = null,
  bodyRef = null,
  canClose = null,
  children,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (canClose && !canClose()) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, canClose]);

  return (
    <div
      className={`acc-sheet${leaving ? ' acc-sheet--leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      {/* The same scene as the board and About, so landing here changes what is
          on the page without changing the room it is in. */}
      <AmbientScene variant={background} />

      <div className={`acc-sheet__dialog${wide ? ' acc-sheet__dialog--wide' : ''}`}>
        <header className="acc-sheet__head">
          {head}
          <button type="button" className="acc-sheet__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="acc-sheet__body" ref={bodyRef}>
          {children}
        </div>

        {footer && <footer className="acc-sheet__foot">{footer}</footer>}
      </div>
    </div>
  );
}
