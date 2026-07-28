import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BloomMark from '../onboarding/BloomMark.jsx';
import AmbientScene from '../shared/AmbientScene.jsx';
import { PRODUCT_NAME } from '../../domain/schema.js';

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
 * The mark is `BloomMark` rather than a second copy of the SVG.
 * `delay={1500} step={120}` lands the petals on 1500/1620/1740/1860/1980 and
 * the centre on 2270, which is the spec exactly.
 */

const SLIDES = [
  {
    id: 'about',
    kicker: 'About',
    heading: 'A calm record of the support you give.',
    body: 'A daily record of the accommodations you deliver, so you can show your work when someone asks.',
    hero: true,
  },
  {
    id: 'private',
    kicker: 'Private by design',
    // The one kicker in accent rather than brand: it is the product's central
    // promise, and the spec singles it out.
    accentKicker: true,
    heading: 'Nothing leaves this computer.',
    body: 'Everything lives in one file on this computer. No account, no database, no network. It cannot send your students’ information anywhere.',
  },
  {
    id: 'why',
    kicker: 'Why it was built',
    heading: 'Paperwork built for auditors, not for teachers.',
    body: 'Documenting IEP and 504 support is required, and the systems that exist for it are mostly built for administrators rather than for the person actually teaching. They ask for a lot of clicks, at the end of a day when you have none left.',
  },
  {
    id: 'who',
    kicker: 'Who it’s for',
    heading: 'For the person delivering the support.',
    body: 'Classroom teachers with IEP and 504 students, not the office auditing them. A board you can run down in a few minutes after the last bell, that turns into a report when someone needs one.',
  },
  {
    id: 'next',
    kicker: 'Where it goes next',
    heading: 'Small on purpose.',
    body: 'An end-of-day close-out that seals each record, printable reports ready for compliance submission, and bulk actions for the busy days. Never an account, never a sync. That part doesn’t change.',
  },
];

const AUTO_ADVANCE_MS = 9000;
const FEEDBACK_COLLAPSE_MS = 6000;
const FEEDBACK_EMAIL = 'm.solothis@proton.me';

export default function AboutBloom({ onClose, stats, background }) {
  const [index, setIndex] = useState(0);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
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
    <div className="acc-about" role="dialog" aria-modal="true" aria-label={`About ${PRODUCT_NAME}`}>
      {/*
        The scene, shared with onboarding and the board so moving between them
        never changes the room. See AmbientScene.
      */}
      <AmbientScene variant={background} />

      <div className="acc-about__brand">
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
        <span className="acc-about__feedback-label">Send feedback</span>
        <span className="acc-about__feedback-mark" aria-hidden="true">
          ?
        </span>
      </a>
    </div>
  );
}
