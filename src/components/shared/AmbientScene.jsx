/**
 * The scene the whole app sits in front of.
 *
 * One implementation, used by onboarding, the board and About, so the three can
 * never drift and moving between them never changes the room. Built to
 * `design_handoff_about_bloom/`, which is the current standard: an aurora sheet
 * at 320% on an 18s shift, four blurred blooms that arrive on a stagger and
 * then drift, and eleven glowing motes rising with a sideways sway.
 *
 * `variant="calm"` keeps the softer scene setup used to open in - a paler sheet
 * on a slower cycle with tinted motes - because it is still offered in Settings.
 *
 * Mounted once and never remounted, which is the point: the screens change
 * against a background that does not, so moving from one to the next reads as
 * turning your head rather than as loading a page.
 */

/**
 * Motes, authored rather than random.
 *
 * `Math.random()` would reshuffle them on every render, and the placement is
 * deliberate: spread across the width, none clustered, none dead centre where
 * the reading sits. Values are the handoff's, mote for mote.
 */
const AURORA_MOTES = [
  {
    left: '8%',
    size: 5,
    o: 0.55,
    x: '34px',
    dur: 22,
    delay: 2,
    glow: '0 0 10px 2px rgba(255,255,255,0.65)',
  },
  {
    left: '17%',
    size: 3,
    o: 0.4,
    x: '-28px',
    dur: 30,
    delay: 7,
    glow: '0 0 8px 2px rgba(206,196,255,0.7)',
  },
  {
    left: '26%',
    size: 7,
    o: 0.6,
    x: '52px',
    dur: 18,
    delay: 4,
    glow: '0 0 14px 3px rgba(255,255,255,0.6)',
  },
  {
    left: '34%',
    size: 4,
    o: 0.35,
    x: '-40px',
    dur: 27,
    delay: 11,
    glow: '0 0 8px 2px rgba(255,216,232,0.7)',
  },
  {
    left: '43%',
    size: 5,
    o: 0.5,
    x: '24px',
    dur: 24,
    delay: 1,
    glow: '0 0 10px 2px rgba(255,255,255,0.6)',
  },
  {
    left: '52%',
    size: 3,
    o: 0.4,
    x: '-18px',
    dur: 32,
    delay: 9,
    glow: '0 0 7px 2px rgba(210,242,230,0.7)',
  },
  {
    left: '61%',
    size: 6,
    o: 0.6,
    x: '46px',
    dur: 20,
    delay: 5,
    glow: '0 0 12px 3px rgba(255,255,255,0.65)',
  },
  {
    left: '70%',
    size: 4,
    o: 0.35,
    x: '-34px',
    dur: 28,
    delay: 13,
    glow: '0 0 8px 2px rgba(206,196,255,0.7)',
  },
  {
    left: '79%',
    size: 5,
    o: 0.55,
    x: '30px',
    dur: 23,
    delay: 3,
    glow: '0 0 10px 2px rgba(255,255,255,0.6)',
  },
  {
    left: '88%',
    size: 4,
    o: 0.45,
    x: '-22px',
    dur: 26,
    delay: 8,
    glow: '0 0 9px 2px rgba(255,231,207,0.75)',
  },
  {
    left: '95%',
    size: 3,
    o: 0.3,
    x: '16px',
    dur: 34,
    delay: 15,
    glow: '0 0 7px 2px rgba(255,255,255,0.6)',
  },
];

/** The calm scene's own: tinted rather than glowing, and fewer of them. */
const CALM_MOTES = [
  { left: '12%', size: 10, o: 0.5, x: '18px', dur: 38, delay: 0, tint: 'var(--acc-mote-1)' },
  { left: '26%', size: 16, o: 0.45, x: '-24px', dur: 46, delay: 12, tint: 'var(--acc-mote-2)' },
  { left: '41%', size: 7, o: 0.5, x: '20px', dur: 34, delay: 22, tint: 'var(--acc-mote-3)' },
  { left: '58%', size: 13, o: 0.4, x: '-16px', dur: 52, delay: 6, tint: 'var(--acc-mote-4)' },
  { left: '71%', size: 9, o: 0.5, x: '26px', dur: 40, delay: 30, tint: 'var(--acc-mote-1)' },
  { left: '84%', size: 18, o: 0.35, x: '-20px', dur: 58, delay: 18, tint: 'var(--acc-mote-2)' },
  { left: '92%', size: 8, o: 0.45, x: '14px', dur: 36, delay: 26, tint: 'var(--acc-mote-3)' },
  { left: '6%', size: 12, o: 0.4, x: '-22px', dur: 44, delay: 38, tint: 'var(--acc-mote-4)' },
];

export default function AmbientScene({ variant = 'aurora' }) {
  const motes = variant === 'calm' ? CALM_MOTES : AURORA_MOTES;

  return (
    <div className={`acc-scene acc-scene--${variant}`} aria-hidden="true">
      <div className="acc-scene__sheet" />

      <div className="acc-scene__blobs">
        <span className="acc-scene__blob acc-scene__blob--1" />
        <span className="acc-scene__blob acc-scene__blob--2" />
        <span className="acc-scene__blob acc-scene__blob--3" />
        <span className="acc-scene__blob acc-scene__blob--4" />
      </div>

      <div className="acc-scene__motes">
        {motes.map((m) => (
          <span
            key={m.left}
            className="acc-scene__mote"
            style={{
              '--acc-mote-left': m.left,
              '--acc-mote-size': `${m.size}px`,
              '--acc-mote-o': m.o,
              '--acc-mote-x': m.x,
              '--acc-mote-dur': `${m.dur}s`,
              '--acc-mote-delay': `${m.delay}s`,
              ...(m.glow ? { '--acc-mote-glow': m.glow } : {}),
              ...(m.tint ? { '--acc-mote-tint': m.tint } : {}),
            }}
          />
        ))}
      </div>
    </div>
  );
}
