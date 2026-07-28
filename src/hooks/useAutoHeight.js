import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Let a box ease between content heights instead of snapping between them.
 *
 * A CSS transition needs two lengths to interpolate, and a box sized by its
 * contents is `auto` before and after, so there is nothing to animate.
 * `interpolate-size` does not help either: it lets a DECLARED `auto` be
 * transitioned, not a height that changes because the content did.
 *
 * So the content is measured and published as a custom property, and the
 * stylesheet transitions that. The element keeps `block-size: var(--name, auto)`
 * so it still behaves before the first measurement and if this never runs.
 *
 * Returns `[outerRef, contentRef]`. The content element must be free to take its
 * natural height, or the measurement chases the value it just set.
 *
 * @param {string} prop custom property name, e.g. '--acc-modal-h'
 */
export default function useAutoHeight(prop) {
  const outer = useRef(null);
  const content = useRef(null);

  const measure = () => {
    if (!outer.current || !content.current) return;
    outer.current.style.setProperty(prop, `${content.current.getBoundingClientRect().height}px`);
  };

  // No dep array: every render is a chance for the content to have changed, and
  // this is the path that actually fires when a list filters or a row appears.
  // Layout effect, so the first measurement lands before paint and the box does
  // not open at zero and grow into itself.
  useLayoutEffect(measure);

  // Backstop for size changes with no render behind them: a font finishing
  // loading, or a long label rewrapping when the window narrows.
  useEffect(() => {
    const el = content.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [outer, content];
}
