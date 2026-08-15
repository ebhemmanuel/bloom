/**
 * The padlock, closed or open.
 *
 * Drawn on the same terms as `Caret`: one shape, `currentColor`, decorative to
 * assistive tech. The button around it carries the label.
 *
 * The two states share a body and differ only in the shackle - closed comes
 * back down into the case on the right, open stops at the top of its arc. A
 * teacher glancing at the bar reads the difference from the gap, not from a
 * colour, which is the same reason the print sheet uses glyphs.
 */
export default function Lock({ open = false, size = 14 }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={`acc-lockicon${open ? ' acc-lockicon--open' : ''}`}
    >
      <path
        d={open ? 'M5.5 7.2V4.9a2.5 2.5 0 0 1 5 0' : 'M5.5 7.2V4.9a2.5 2.5 0 0 1 5 0v2.3'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect
        x="3.25"
        y="7.2"
        width="9.5"
        height="6.3"
        rx="1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
