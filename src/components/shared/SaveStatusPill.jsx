import { useData } from '../../context/DataContext.jsx';

const COPY = {
  idle: { text: 'Saved', tone: 'quiet' },
  saving: { text: 'Saving…', tone: 'busy' },
  saved: { text: 'Saved', tone: 'quiet' },
  readonly: { text: 'Read-only', tone: 'warn' },
  conflict: { text: 'Changed elsewhere', tone: 'warn' },
  error: { text: "Couldn't save", tone: 'error' },
};

/**
 * Quiet reassurance that the record is on disk.
 *
 * A teacher is trusting this app with a legal document, so "saved" must be
 * visible without being loud, and a failure must be unmissable without being
 * alarming. Deliberately not a toast — this state is persistent, not an event.
 */
export default function SaveStatusPill() {
  const { saveStatus, readOnly } = useData();
  const key = readOnly ? 'readonly' : saveStatus.state || 'idle';
  const { text, tone } = COPY[key] || COPY.idle;

  return (
    <span className={`acc-save acc-save--${tone}`} aria-live="polite" role="status">
      <span className="acc-save__dot" aria-hidden="true" />
      {text}
    </span>
  );
}
