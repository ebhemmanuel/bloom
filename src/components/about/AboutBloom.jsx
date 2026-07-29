import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BloomMark from '../onboarding/BloomMark.jsx';
import AmbientScene from '../shared/AmbientScene.jsx';
import useSpinOnHover from '../../hooks/useSpinOnHover.js';
import { PRODUCT_NAME } from '../../domain/schema.js';
import { ABOUT_SLIDES } from './aboutSlides.js';

/**
 * About Bloom: a full-screen ambient reader, not a dialog.
 *
 * Five slides under a fixed logo, auto-advancing, over the same aurora the rest
 * of the app sits in. It opens by cascading the real board away and closes by
 * bringing it back, so it reads as the app turning to face you rather than as a
 * window opening on top of it.
 *
 * Built to `design_handoff_about_bloom/`. Every timing here is from that spec,
 * and the scene behind it became the app's standard: `AmbientScene` draws the
 * same sheet, blooms and motes for setup and the board, so this screen is the
 * same room with different words in it.
 *
 * The big mark turns on its own from 4600ms - the handoff's idle pinwheel. The
 * small one in the brand lockup turns only while pointed at, and finishes the
 * turn it is on when the pointer leaves, so it never rests crooked.
 *
 * The mark is `BloomMark` rather than a second copy of the SVG.
 * `delay={1500} step={120}` lands the petals on 1500/1620/1740/1860/1980 and
 * the centre on 2270, which is the spec exactly.
 */

// The slides live in aboutSlides.js, shared with the onboarding intro.
const SLIDES = ABOUT_SLIDES;

const AUTO_ADVANCE_MS = 9000;
const FEEDBACK_COLLAPSE_MS = 6000;
const FEEDBACK_EMAIL = 'm.solothis@proton.me';

export default function AboutBloom({ onClose, stats, background, leaving = false }) {
  const [index, setIndex] = useState(0);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { turning, spinProps } = useSpinOnHover();
  const idle = useRef(null);
  const feedbackTimer = useRef(null);

  /**
   * Auto-advance, restarted by any manual move.
   *
   * Without the reset, jumping to a slide could leave you a fraction of a second
   * before the timer fired and move you straight off it again.
   */
  const armIdle = useCallback(() => {
    clearInterval(idle.current);
    idle.current = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), AUTO_ADVANCE_MS);
  }, []);

  const go = useCallback(
    (next) => {
      setIndex(((next % SLIDES.length) + SLIDES.length) % SLIDES.length);
      armIdle();
    },
    [armIdle]
  );

  useEffect(() => {
    armIdle();
    return () => clearInterval(idle.current);
  }, [armIdle]);

  useEffect(() => () => clearTimeout(feedbackTimer.current), []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go(index + 1);
      else if (e.key === 'ArrowLeft') go(index - 1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index, onClose]);

  /**
   * Feedback opens before it sends, deliberately.
   *
   * The first click only reveals the label; the second follows the mailto. On a
   * school machine launching Outlook can take a quarter of a minute, and doing
   * that to someone who brushed a corner button is a poor trade for one click.
   */
  const onFeedback = (e) => {
    if (feedbackOpen) return; // second click: let the mailto through
    e.preventDefault();
    setFeedbackOpen(true);
    clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedbackOpen(false), FEEDBACK_COLLAPSE_MS);
  };

  const showStats = Boolean(
    stats && (stats.students || stats.accommodations || stats.daysRecorded)
  );

  const slides = useMemo(
    () =>
      SLIDES.map((s, i) => ({
        ...s,
        state: i === index ? 'on' : i < index ? 'before' : 'after',
      })),
    [index]
  );

  return (
    <div
      className={`acc-about${leaving ? ' acc-about--leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`About ${PRODUCT_NAME}`}
    >
      {/*
        The scene, shared with onboarding and the board so moving between them
        never changes the room. See AmbientScene.
      */}
      <AmbientScene variant={background} />

      <div className={`acc-about__brand${turning ? ' acc-spin' : ''}`} {...spinProps}>
        <BloomMark size={26} />
        <span className="acc-about__brand-name">{PRODUCT_NAME}</span>
      </div>

      <button type="button" className="acc-about__close" onClick={onClose} aria-label="Close">
        ×
      </button>

      <div className="acc-about__stage">
        {/*
          Fixed anchor. Every slide's text starts at the same y beneath it, so
          moving between them never shifts anything vertically.

          The pinwheel wraps the whole mark rather than only the petals, which
          BloomMark does not group separately. The centre is a circle on the
          rotation origin, so rotating it is pixel-identical to leaving it be.
        */}
        <div className="acc-about__mark">
          <BloomMark size={96} bloom delay={1500} step={120} />
        </div>

        {slides.map((s) => (
          <section
            key={s.id}
            className={`acc-about__slide acc-about__slide--${s.state}`}
            aria-hidden={s.state !== 'on'}
          >
            <div className={`acc-about__copy${s.hero ? ' acc-about__copy--hero' : ''}`}>
              <span
                className={`acc-about__kicker${s.accentKicker ? ' acc-about__kicker--accent' : ''}`}
              >
                {s.kicker}
              </span>
              {s.hero ? (
                <h1 className="acc-about__heading acc-about__heading--hero">{s.heading}</h1>
              ) : (
                <h2 className="acc-about__heading">{s.heading}</h2>
              )}
              <p className={`acc-about__body${s.hero ? ' acc-about__body--hero' : ''}`}>{s.body}</p>
            </div>
          </section>
        ))}

        {/* Hidden with no data rather than shown as three zeroes, which would
            read as a product that has never worked. */}
        {showStats && (
          <div className="acc-about__stats">
            <div className="acc-about__stat">
              <span className="acc-about__stat-n acc-numeric">{stats.students}</span>
              <span className="acc-about__stat-l">students</span>
            </div>
            <div className="acc-about__stat">
              <span className="acc-about__stat-n acc-numeric">{stats.accommodations}</span>
              <span className="acc-about__stat-l">accommodations</span>
            </div>
            <div className="acc-about__stat">
              <span className="acc-about__stat-n acc-numeric">{stats.daysRecorded}</span>
              <span className="acc-about__stat-l">days recorded</span>
            </div>
          </div>
        )}
      </div>

      <div className="acc-about__nav">
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`acc-about__dot${i === index ? ' acc-about__dot--on' : ''}`}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === index ? 'true' : undefined}
            onClick={() => go(i)}
          />
        ))}
      </div>

      <a
        className={`acc-about__feedback${feedbackOpen ? ' acc-about__feedback--open' : ''}`}
        href={`mailto:${FEEDBACK_EMAIL}?subject=Bloom%20feedback`}
        onClick={onFeedback}
        aria-label="Send feedback to the developer"
      >
        {/*
          The mark first in the DOM, the label after it, with `row-reverse` in
          the stylesheet: that puts the label to the LEFT of the ? and grows it
          leftward, so the circle itself never moves as it opens.
        */}
        <span className="acc-about__feedback-mark" aria-hidden="true">
          ?
        </span>
        <span className="acc-about__feedback-label">Send feedback</span>
      </a>
    </div>
  );
}
