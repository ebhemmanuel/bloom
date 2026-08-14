import { useEffect, useRef, useState } from 'react';

/**
 * The way to say something is wrong, from wherever you noticed it.
 *
 * It lived in the corner of the About screen, which is the one place a teacher
 * has no complaint: you go to About to read, not because something just went
 * badly. The moment worth catching is the moment it happened - a card that
 * would not move, a name that came out wrong - and that moment is on the board
 * or halfway through a sheet.
 *
 * Fixed to the viewport rather than to a screen, so it survives the board, the
 * full-screen sheets and setup alike.
 */

const FEEDBACK_EMAIL = 'm.solothis@proton.me';

/** How long the address stays out before folding back to the mark. */
const COLLAPSE_MS = 6000;

export default function FeedbackButton() {
  const [stage, setStage] = useState('shut');
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const hold = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setStage('shut');
      setCopied(false);
    }, COLLAPSE_MS);
  };

  /**
   * Two clicks, and NEITHER of them launches anything.
   *
   * The first opens the label; the second shows the address itself. It used to
   * be a `mailto:`, which on a school machine means Outlook cold-starting for
   * a quarter of a minute - and on a machine with no mail client configured it
   * means nothing happening at all, which reads as a broken button. An address
   * on screen is something a teacher can use from their phone, from webmail, or
   * by writing it on a sticky note.
   *
   * Clicking the address copies it, because the one thing worse than no mail
   * client is retyping an address from a screen.
   */
  const onClick = () => {
    if (stage === 'shut') {
      setStage('open');
      hold();
      return;
    }
    if (stage === 'open') {
      setStage('address');
      hold();
      return;
    }

    navigator.clipboard
      ?.writeText(FEEDBACK_EMAIL)
      .then(() => setCopied(true))
      .catch(() => {
        /* No clipboard permission. The address is on screen either way. */
      });
    hold();
  };

  const showing = stage !== 'shut';

  return (
    <button
      type="button"
      className={`acc-feedback${showing ? ' acc-feedback--open' : ''}`}
      onClick={onClick}
      aria-label={showing ? `Feedback: ${FEEDBACK_EMAIL}` : 'Send feedback to the developer'}
      title={showing ? FEEDBACK_EMAIL : 'Send feedback'}
    >
      {/*
        The mark first in the DOM, the label after it, with `row-reverse` in the
        stylesheet: that puts the label to the LEFT of the ? and grows it
        leftward, so the circle itself never moves as it opens.
      */}
      <span className="acc-feedback__mark" aria-hidden="true">
        ?
      </span>
      <span className="acc-feedback__label">
        {stage === 'address' ? (copied ? 'Copied' : FEEDBACK_EMAIL) : 'Send feedback'}
      </span>
    </button>
  );
}
