import { useEffect, useRef } from 'react';

/**
 * Make a button lean toward the cursor.
 *
 * The element tips on two axes depending on where the pointer sits over it, and
 * lifts slightly while hovered — the same reflex as nudging a physical object
 * and feeling it give. It is the ambient register having a bit of fun on the one
 * screen that is allowed to; the working board stays still.
 *
 * Published as custom properties rather than a written-out transform, so the
 * stylesheet still owns the look: how far it tips, how much it lifts and how it
 * settles back are all decided in SCSS. That keeps this to "where is the
 * pointer" and keeps the design tokens in the one place the design lives — see
 * the no-inline-styles rule in CLAUDE.md, whose exception is exactly this.
 *
 * @param {number} max degrees of tilt at the very edge of the element
 */
export default function useTilt(max = 7) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    // Vestibular comfort outranks charm. Nothing here is load-bearing.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;

    let frame = null;

    const apply = (event) => {
      frame = null;
      const box = el.getBoundingClientRect();
      // -1 at one edge, +1 at the other, 0 dead centre.
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;
      // Pointer right tips the right edge away; pointer low tips the bottom
      // toward you. Inverting either one makes it feel like it is fighting you.
      el.style.setProperty('--acc-tilt-y', `${x * 2 * max}deg`);
      el.style.setProperty('--acc-tilt-x', `${-y * 2 * max}deg`);
    };

    // One update per frame. Pointer events fire far faster than the screen
    // refreshes, and every extra one is a layout read thrown away.
    const onMove = (event) => {
      if (frame) return;
      frame = requestAnimationFrame(() => apply(event));
    };

    const onEnter = () => el.classList.add('acc-tilt--live');

    const onLeave = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = null;
      // Drop the live class first so the slow settle transition governs the way
      // back, then zero the angles for it to travel to.
      el.classList.remove('acc-tilt--live');
      el.style.setProperty('--acc-tilt-x', '0deg');
      el.style.setProperty('--acc-tilt-y', '0deg');
    };

    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    // A press or a drag that ends elsewhere would otherwise leave it stuck
    // mid-lean with no pointer over it.
    el.addEventListener('blur', onLeave);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('blur', onLeave);
    };
  }, [max]);

  return ref;
}
