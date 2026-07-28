/**
 * The icons rows act with: edit, put away, bring back.
 *
 * One stroke weight, one box, one visual language. They live here rather than
 * beside the first list that needed them, because a second list drawing its own
 * pencil is how two screens quietly stop matching.
 *
 * None of them carries a label. Every caller must supply BOTH a `title` and an
 * `aria-label` on the button: an icon with no name is a guess for a sighted user
 * and silence for a screen reader.
 */

export function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path
        d="M11.2 2.3a1.4 1.4 0 0 1 2 2l-7 7-2.7.7.7-2.7 7-7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArchiveIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path
        d="M2 5.5h12V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M1.5 3.2a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v2.3h-13V3.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M6.5 8.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** The same box, with the arrow coming back out of it. */
export function RestoreIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path
        d="M2 6.5h12V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M8 11V6.5M8 6.5 6.2 8.3M8 6.5l1.8 1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M1.5 4h13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
