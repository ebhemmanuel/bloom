/**
 * The chevron this app points with.
 *
 * One shape, one stroke, one size. It was drawn inline in the period filter and
 * again in the date picker, and the third copy came out as a different arrow
 * entirely, which is how a design language quietly stops being one. Rotating it
 * covers every direction the toolbar needs.
 */
export default function Caret({ up = false, size = 12 }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      className={`acc-caret${up ? ' acc-caret--up' : ''}`}
    >
      <path
        d="M4 6l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
