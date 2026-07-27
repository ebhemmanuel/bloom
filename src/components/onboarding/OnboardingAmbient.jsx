/**
 * The scene every onboarding screen sits in front of.
 *
 * A drifting gradient sheet, four blurred blobs that bloom in on a stagger, and
 * eight motes rising slowly through it. It is mounted once and never remounted,
 * which is the whole point: the screens change against a background that does
 * not, so moving from one question to the next reads as turning your head rather
 * than as loading a page.
 *
 * The field also eases to a slightly different shift per screen. That parallax
 * is what stops eight centred cards in a row from feeling like the same card.
 *
 * It survives into the board handoff too. `_ambient.scss` already paints the
 * same aurora behind the app, so the outro can hand over without the background
 * ever cutting.
 */

/**
 * Mote positions are authored, not random.
 *
 * `Math.random()` would reshuffle them on every render, and the design places
 * them deliberately: spread across the width, none clustered, none dead centre
 * where the card sits.
 */
const MOTES = [
  { left: '12%', top: '78%', size: 10, color: 'var(--acc-mote-1)', blur: 2, dur: 38, delay: 0 },
  { left: '26%', top: '92%', size: 16, color: 'var(--acc-mote-2)', blur: 4, dur: 46, delay: -12 },
  { left: '41%', top: '84%', size: 7, color: 'var(--acc-mote-3)', blur: 1.5, dur: 34, delay: -22 },
  { left: '58%', top: '96%', size: 13, color: 'var(--acc-mote-4)', blur: 3, dur: 52, delay: -6 },
  { left: '71%', top: '88%', size: 9, color: 'var(--acc-mote-1)', blur: 2, dur: 40, delay: -30 },
  { left: '84%', top: '80%', size: 18, color: 'var(--acc-mote-2)', blur: 5, dur: 58, delay: -18 },
  { left: '92%', top: '94%', size: 8, color: 'var(--acc-mote-3)', blur: 2, dur: 36, delay: -26 },
  { left: '6%', top: '90%', size: 12, color: 'var(--acc-mote-4)', blur: 3, dur: 44, delay: -38 },
];

export default function OnboardingAmbient({ phase }) {
  return (
    <>
      <div className="acc-ob__sheet" aria-hidden="true" />

      {/*
        `data-shift` picks the parallax offset in SCSS rather than carrying a
        transform here, so where each screen sits stays a design decision.
      */}
      <div className="acc-ob__field" data-shift={phase} aria-hidden="true">
        <span className="acc-ob__blob acc-ob__blob--1" />
        <span className="acc-ob__blob acc-ob__blob--2" />
        <span className="acc-ob__blob acc-ob__blob--3" />
        <span className="acc-ob__blob acc-ob__blob--4" />
      </div>

      <div className="acc-ob__motes" aria-hidden="true">
        {MOTES.map((m, i) => (
          <span
            key={i}
            className="acc-ob__mote"
            style={{
              '--acc-mote-left': m.left,
              '--acc-mote-top': m.top,
              '--acc-mote-size': `${m.size}px`,
              '--acc-mote-color': m.color,
              '--acc-mote-blur': `${m.blur}px`,
              '--acc-mote-dur': `${m.dur}s`,
              '--acc-mote-delay': `${m.delay}s`,
            }}
          >
            <span className="acc-ob__mote-dot" />
          </span>
        ))}
      </div>
    </>
  );
}
