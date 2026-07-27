import { useEffect, useRef, useState } from 'react';
import Scrim from '../shared/Scrim.jsx';
import useDismissAnimation from '../../hooks/useDismissAnimation.js';

/**
 * Detail capture for "Used with Detail".
 *
 * Cancelling with an empty field reverts the card to its pre-drag status:
 * `used_with_detail` carrying no detail is a meaningless record and would print
 * as an unsupported claim. Cancelling with existing text keeps it.
 */
export default function CardDetailPopover({ card, onSave, onCancel }) {
  const [text, setText] = useState(card.detail || '');
  const inputRef = useRef(null);
  const { leaving, dismiss, dismissThen } = useDismissAnimation(onCancel);
  const save = dismissThen(() => onSave(text));

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.setSelectionRange(text.length, text.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') dismiss();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismiss, save]);

  return (
    <Scrim leaving={leaving} onDismiss={dismiss}>
      <div
        className={`acc-detail ${leaving ? 'acc-leave' : 'acc-enter'}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Detail for ${card.label}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="acc-detail__header">
          <span className="acc-subhead">Used with detail</span>
          <h2 className="acc-detail__title">{card.label}</h2>
        </header>

        <textarea
          ref={inputRef}
          className="acc-detail__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={card.detailPrompt || 'What was provided, and how?'}
          rows={5}
        />

        <p className="acc-detail__hint">
          This text is reproduced verbatim in the printed report, so write it for whoever reads the
          record later.
        </p>

        <footer className="acc-detail__actions">
          <button type="button" className="acc-btn acc-btn--quiet" onClick={dismiss}>
            Cancel
          </button>
          <button
            type="button"
            className="acc-btn acc-btn--primary"
            onClick={save}
            disabled={!text.trim()}
          >
            Save detail
          </button>
        </footer>
      </div>
    </Scrim>
  );
}
