import { useCallback, useEffect, useRef, useState } from 'react';
import BloomMark from '../BloomMark.jsx';
import useTilt from '../../../hooks/useTilt.js';

/**
 * The three screens with no card: intro, welcome, outro.
 *
 * They sit directly on the aurora rather than on glass, which is what separates
 * "here is Bloom" from "here is a question". The questions all wear the card.
 */

/**
 * The logo reveal.
 *
 * It holds forever. There is no auto-advance and there must not be one: a first
 * launch is the one moment a teacher has not agreed to anything yet, and a
 * screen that moves on by itself decides for them. The mark blooms, the name
 * arrives, and then it waits.
 */
export function IntroStep({ onNext }) {
  const tilt = useTilt();

  return (
    <div className="acc-ob__screen acc-ob__screen--intro">
      <div className="acc-ob__hero">
        <BloomMark size={132} bloom delay={1250} label="Bloom" />
        <div className="acc-ob__lockup">
          <p className="acc-ob__wordmark">Bloom</p>
          <p className="acc-ob__tagline">A calm record of the support you give.</p>
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
    </div>
  );
}

const PROMISES = [
  {
    id: 'board',
    title: 'One board for the day',
    body: "Move a card when support happens. That's the whole job.",
  },
  {
    id: 'reports',
    title: 'Clean printed reports',
    body: 'Ready for IEP meetings, audits, and parent conferences.',
  },
  {
    id: 'private',
    title: 'Private by design',
    body: 'Everything stays on this computer. Nothing is ever sent anywhere.',
  },
];

/** Same pace as the About page's deck. See AboutBloom. */
const AUTO_ADVANCE_MS = 9000;

/**
 * The welcome screen carries the About page's rotating deck rather than a grid
 * of cards: one promise at a time, auto-advancing, with the slider dots at the
 * bottom of the screen. The only difference from About is the CTA sitting
 * under the rotating messages.
 */
export function WelcomeStep({ onNext }) {
  const tilt = useTilt();
  const [index, setIndex] = useState(0);
  const idle = useRef(null);

  // Auto-advance, restarted by any manual move, exactly as AboutBloom does it:
  // without the reset, clicking a dot could land you a fraction of a second
  // before the timer fired and move you straight off it again.
  const armIdle = useCallback(() => {
    clearInterval(idle.current);
    idle.current = setInterval(() => setIndex((i) => (i + 1) % PROMISES.length), AUTO_ADVANCE_MS);
  }, []);

  const go = useCallback(
    (next) => {
      setIndex(((next % PROMISES.length) + PROMISES.length) % PROMISES.length);
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
    <div className="acc-ob__screen">
      <div className="acc-ob__column">
        <div className="acc-ob__eyebrow-row">
          <BloomMark size={34} />
          <span className="acc-ob__brand">BLOOM</span>
        </div>
        <h1 className="acc-ob__title">Hi there.</h1>
        <p className="acc-ob__lede">
          Bloom is a calm place to keep a daily record of the support you give your students. A few
          quiet minutes at the end of the day.
        </p>
        <div className="acc-ob__deck">
          {PROMISES.map((p, i) => (
            <section
              key={p.id}
              className={`acc-ob__deck-slide acc-ob__deck-slide--${
                i === index ? 'on' : i < index ? 'before' : 'after'
              }`}
              aria-hidden={i !== index}
            >
              <h2 className="acc-ob__deck-heading">{p.title}</h2>
              <p className="acc-ob__deck-body">{p.body}</p>
            </section>
          ))}
        </div>
        <button type="button" className="acc-ob__cta" ref={tilt} onClick={onNext}>
          Continue
        </button>
      </div>
      <div className="acc-ob__dots">
        {PROMISES.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={`acc-ob__dot${i === index ? ' acc-ob__dot--on' : ''}`}
            aria-label={`Go to message ${i + 1}`}
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
