import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A floating scrollbar for the board.
 *
 * The native bar is hidden in CSS. This draws a 6px pill that appears while
 * scrolling and fades ~900ms after it stops, so a board at rest has no chrome on
 * its edge — which matters when the container is translucent and a permanent
 * grey bar would cut across the aurora behind it.
 */
export default function useCustomScrollbar() {
  const scrollRef = useRef(null);
  const fadeTimer = useRef(null);
  const dragState = useRef(null);
  const [bar, setBar] = useState({
    visible: false,
    top: 0,
    height: 0,
    trackTop: 0,
    trackHeight: 0,
  });

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return null;

    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight) return null;

    // Track is 45% of the container, vertically centred, per the spec.
    const trackHeight = clientHeight * 0.45;
    const trackTop = (clientHeight - trackHeight) / 2;
    const thumbHeight = Math.max(28, (clientHeight / scrollHeight) * trackHeight);
    const maxScroll = scrollHeight - clientHeight;
    const top = (scrollTop / maxScroll) * (trackHeight - thumbHeight);

    return { trackTop, trackHeight, top, height: thumbHeight };
  }, []);

  const onScroll = useCallback(() => {
    const next = measure();
    if (!next) return;

    setBar({ ...next, visible: true });
    clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => setBar((b) => ({ ...b, visible: false })), 900);
  }, [measure]);

  // Recompute when the container or its content resizes, so the thumb stays
  // honest as lanes fold and unfold.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;

    const ro = new ResizeObserver(() => {
      const next = measure();
      if (next) setBar((b) => ({ ...b, ...next }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => () => clearTimeout(fadeTimer.current), []);

  const onThumbPointerDown = useCallback(
    (event) => {
      const el = scrollRef.current;
      if (!el) return;

      event.preventDefault();
      dragState.current = { startY: event.clientY, startScroll: el.scrollTop };
      clearTimeout(fadeTimer.current);
      setBar((b) => ({ ...b, visible: true }));

      const onMove = (moveEvent) => {
        const state = dragState.current;
        const geom = measure();
        if (!state || !geom) return;

        const usable = geom.trackHeight - geom.height;
        if (usable <= 0) return;
        const maxScroll = el.scrollHeight - el.clientHeight;
        el.scrollTop =
          state.startScroll + ((moveEvent.clientY - state.startY) / usable) * maxScroll;
      };

      const onUp = () => {
        dragState.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        fadeTimer.current = setTimeout(() => setBar((b) => ({ ...b, visible: false })), 900);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [measure]
  );

  return { scrollRef, bar, onScroll, onThumbPointerDown };
}
