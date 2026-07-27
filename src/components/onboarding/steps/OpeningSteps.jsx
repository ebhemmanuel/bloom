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
    title: 'One board for the day',
    body: "Move a card when support happens. That's the whole job.",
  },
  {
    title: 'Clean printed reports',
    body: 'Ready for IEP meetings, audits, and parent conferences.',
  },
  {
    title: 'Private by design',
    body: 'Everything stays on this computer. Nothing is ever sent anywhere.',
  },
];

export function WelcomeStep({ onNext }) {
  const tilt = useTilt();

  return (
    <div className="acc-ob__screen">
      <div className="acc-ob__column acc-ob__column--wide">
        <div className="acc-ob__eyebrow-row">
          <BloomMark size={34} />
          <span className="acc-ob__brand">Bloom</span>
        </div>
        <h1 className="acc-ob__title">Hi there.</h1>
        <p className="acc-ob__lede">
          Bloom is a calm place to keep a daily record of the support you give your students. A few
          quiet minutes at the end of the day.
        </p>
        <div className="acc-ob__promises">
          {PROMISES.map((p) => (
            <div key={p.title} className="acc-ob__promise">
              <p className="acc-ob__promise-title">{p.title}</p>
              <p className="acc-ob__promise-body">{p.body}</p>
            </div>
          ))}
        </div>
        <button type="button" className="acc-ob__cta" ref={tilt} onClick={onNext}>
          Continue
        </button>
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
