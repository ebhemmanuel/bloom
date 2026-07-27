/**
 * Initials for the avatar. "Ms. Rivera" → R, "Jordan Alvarez" → JA.
 *
 * A leading honorific is dropped WITH its trailing period - otherwise "Ms."
 * leaves a bare "." behind and the avatar reads ".R". Only word-initial letters
 * are used, so punctuation can never reach the avatar.
 *
 * Lives in the domain layer rather than beside the header component: it is a
 * pure string function, and keeping it here means it can be tested without
 * pulling a React module into a node-environment test run.
 */
export function initialsOf(name) {
  const parts = String(name || '')
    .replace(/^\s*(mr|mrs|ms|miss|dr|mx|prof)\.?\s+/i, '')
    .split(/[\s.]+/)
    // Keep only fragments that actually start with a letter.
    .map((p) => p.match(/\p{L}/u)?.[0])
    .filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].toUpperCase();
  return (parts[0] + parts[parts.length - 1]).toUpperCase();
}
