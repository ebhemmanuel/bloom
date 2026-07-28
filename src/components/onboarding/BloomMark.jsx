/**
 * The Bloom flower.
 *
 * Five petals on a 72 degree rotation around the centre, then a dot. One
 * component for every size it appears at, because the geometry is exact and
 * three hand-copied SVGs would drift apart the first time anyone adjusted one.
 *
 * `bloom` runs the reveal: petals pop in on a stagger, then the centre lands
 * with a small overshoot. Without it the mark is simply drawn, which is what the
 * welcome eyebrow and any static use want.
 *
 * The stagger is expressed as a per-petal delay in a custom property rather than
 * five hard-coded rules, so the intro and the outro can share the animation and
 * differ only in pace.
 *
 * The petals sit in their own group so anything that turns the mark can turn
 * them alone and leave the centre still. See the group below.
 */

const PETALS = [
  { rotate: 0, fill: 'var(--acc-petal-1)' },
  { rotate: 72, fill: 'var(--acc-petal-2)' },
  { rotate: 144, fill: 'var(--acc-petal-3)' },
  { rotate: 216, fill: 'var(--acc-petal-4)' },
  { rotate: 288, fill: 'var(--acc-petal-5)' },
];

export default function BloomMark({ size = 132, bloom = false, delay = 0, step = 140, label }) {
  return (
    <svg
      className={`acc-mark${bloom ? ' acc-mark--bloom' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/*
        The petals are grouped so they can turn WITHOUT the centre.
        
        The pinwheel rotates this group only. Turning the whole mark instead
        looks the same on paper - the centre is a circle sitting on the rotation
        origin - but it is not the same on screen: rotating the layer resamples
        the centre every frame, and its edge shimmers. Keeping it outside the
        group leaves it perfectly still and crisp.
      */}
      <g className="acc-mark__petals">
        {PETALS.map((p, i) => (
          <g key={p.rotate} transform={`rotate(${p.rotate} 32 32)`}>
            <ellipse
              className="acc-mark__petal"
              cx="32"
              cy="17"
              rx="9.5"
              ry="15"
              fill={p.fill}
              // Delay only. Duration and easing stay in the stylesheet.
              style={{ '--acc-mark-delay': `${delay + i * step}ms` }}
            />
          </g>
        ))}
      </g>
      <circle
        className="acc-mark__center"
        cx="32"
        cy="32"
        r="7.5"
        fill="var(--acc-accent)"
        style={{ '--acc-mark-delay': `${delay + PETALS.length * step + 170}ms` }}
      />
    </svg>
  );
}
