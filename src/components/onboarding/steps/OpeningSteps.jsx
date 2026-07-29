import { useCallback, useEffect, useRef, useState } from 'react';
import BloomMark from '../BloomMark.jsx';
import useTilt from '../../../hooks/useTilt.js';
import useSpinOnHover from '../../../hooks/useSpinOnHover.js';
import { ABOUT_SLIDES } from '../../about/aboutSlides.js';

/**
 * The screens with no card: intro and outro.
 *
 * They sit directly on the aurora rather than on glass, which is what separates
 * "here is Bloom" from "here is a question". The questions all wear the card.
 */

/** Same pace as the About page's deck. The intro IS that deck. */
const AUTO_ADVANCE_MS = 9000;

/**
 * The opening screen: the About page, playing as the first thing a new user
 * sees.
 *
 * Same mark, same five slides, same auto-advance and dots, from the same
 * ABOUT_SLIDES list AboutBloom renders. What About does not have is the CTA
 * under the rotating messages, and what this screen does not have is About's
 * close button, feedback link and stats: there is nothing to close to, no
 * record yet to count, and a first launch is not the moment to ask for mail.
 *
 * It holds forever. There is no auto-advance to the next step and there must
 * not be one: a first launch is the one moment a teacher has not agreed to
 * anything yet, and a screen that moves on by itself decides for them.
 */
export function IntroStep({ onNext }) {
  const tilt = useTilt();
  const { turning, spinProps } = useSpinOnHover();
  const [index, setIndex] = useState(0);
  const idle = useRef(null);

  // Auto-advance, restarted by any manual move, exactly as AboutBloom does it:
  // without the reset, clicking a dot could land you a fraction of a second
  // before the timer fired and move you straight off it again.
  const armIdle = useCallback(() => {
    clearInterval(idle.current);
    idle.current = setInterval(
      () => setIndex((i) => (i + 1) % ABOUT_SLIDES.length),
      AUTO_ADVANCE_MS
    );
  }, []);

  const go = useCallback(
    (next) => {
      setIndex(((next % ABOUT_SLIDES.length) + ABOUT_SLIDES.length) % ABOUT_SLIDES.length);
      armIdle();
    },
    [armIdle]
  );

  useEffect(() => {
    armIdle();
    return () => clearInterval(idle.current);
  }, [armIdle]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go(index + 1);
      else if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index]);

  return (
    <div className="acc-ob__screen acc-ob__screen--intro">
      {/* About's corner lockup, standing in for the wordmark the old intro
          carried. The spin belongs to the mark alone, as everywhere else. */}
      <div className={`acc-ob__corner${turning ? ' acc-spin' : ''}`} {...spinProps}>
        <BloomMark size={26} />
        <span className="acc-ob__brand">BLOOM</span>
      </div>

      <div className="acc-ob__intro-stage">
        <div className="acc-ob__intro-mark">
          <BloomMark size={96} bloom delay={1500} step={120} label="Bloom" />
        </div>

        <div className="acc-ob__deck">
          {ABOUT_SLIDES.map((s, i) => (
            <section
              key={s.id}
              className={`acc-ob__deck-slide acc-ob__deck-slide--${
                i === index ? 'on' : i < index ? 'before' : 'after'
              }`}
              aria-hidden={i !== index}
            >
              <div className={`acc-ob__deck-copy${s.hero ? ' acc-ob__deck-copy--hero' : ''}`}>
                <span
                  className={`acc-ob__deck-kicker${
                    s.accentKicker ? ' acc-ob__deck-kicker--accent' : ''
                  }`}
                >
                  {s.kicker}
                </span>
                {s.hero ? (
                  <h1 className="acc-ob__deck-heading acc-ob__deck-heading--hero">{s.heading}</h1>
                ) : (
                  <h2 className="acc-ob__deck-heading">{s.heading}</h2>
                )}
                <p className={`acc-ob__deck-body${s.hero ? ' acc-ob__deck-body--hero' : ''}`}>
                  {s.body}
                </p>
              </div>
            </section>
          ))}
        </div>

        <button
          type="button"
          className="acc-ob__cta acc-ob__cta--intro"
          ref={tilt}
          onClick={onNext}
        >
          Begin when you&rsquo;re ready
        </button>
      </div>

      <div className="acc-ob__dots">
        {ABOUT_SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`acc-ob__dot${i === index ? ' acc-ob__dot--on' : ''}`}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === index ? 'true' : undefined}
            onClick={() => go(i)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The handoff.
 *
 * Three status lines that are true rather than decorative: the document really
 * is being written, the roster really is being seated, and the board really is
 * being built behind this. The pacing exists so the work is visible, not to
 * manufacture a wait.
 */
export function OutroStep({ name, studentCount, leaving }) {
  const lines = [
    'Saving your details',
    studentCount > 0
      ? `Seating ${studentCount} student${studentCount === 1 ? '' : 's'}`
      : 'Arranging your periods',
    'Warming up your board',
  ];

  return (
    <div className={`acc-ob__screen acc-ob__outro${leaving ? ' acc-ob__outro--leaving' : ''}`}>
      <div className="acc-ob__hero">
        <BloomMark size={96} bloom delay={100} step={120} />
        <h2 className="acc-ob__outro-title">One moment, {name}.</h2>
        <div className="acc-ob__status">
          {lines.map((line, i) => (
            <p key={line} className="acc-ob__status-line" style={{ '--acc-status-i': i }}>
              <span className="acc-ob__status-dot" aria-hidden="true" />
              {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
