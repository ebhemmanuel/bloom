import { useCallback, useEffect } from 'react';
import AmbientScene from './AmbientScene.jsx';
import useCustomScrollbar from '../../hooks/useCustomScrollbar.js';

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

  // The scroller is the frame's, and a caller may want it too - day notes
  // scrolls its own reported box into view. Both get the same element.
  const scroll = useCustomScrollbar();
  const setBody = useCallback(
    (el) => {
      scroll.scrollRef.current = el;
      if (bodyRef) bodyRef.current = el;
    },
    [scroll.scrollRef, bodyRef]
  );

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

        {/*
          The board's own floating scrollbar, on the sheet. The native bar drew
          a full-height grey rule down the inside edge of every long step; this
          one is short, lavender, and only there while you are moving. It sits
          in this wrapper rather than in the scroller, or it would scroll away
          with the content it measures.
        */}
        <div className="acc-sheet__scroll">
          <div className="acc-sheet__body" ref={setBody} onScroll={scroll.onScroll}>
            {children}
          </div>

          {scroll.bar.height > 0 && (
            <div
              className={`acc-scrollbar acc-scrollbar--inset${
                scroll.bar.visible ? ' acc-scrollbar--visible' : ''
              }`}
              style={{
                top: `${scroll.bar.trackTop}px`,
                height: `${scroll.bar.trackHeight}px`,
              }}
              aria-hidden="true"
            >
              <div
                className="acc-scrollbar__thumb"
                style={{ top: `${scroll.bar.top}px`, height: `${scroll.bar.height}px` }}
                onPointerDown={scroll.onThumbPointerDown}
              />
            </div>
          )}
        </div>

        {footer && <footer className="acc-sheet__foot">{footer}</footer>}
      </div>
    </div>
  );
}
