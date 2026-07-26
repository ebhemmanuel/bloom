import { useEffect, useState } from 'react';
import { dataBridge } from '../../lib/bridge.js';

/**
 * Where the record file lives. Functional version — the full onboarding
 * treatment lands in Phase 7.
 *
 * The load-bearing part is already here: if the suggested folder syncs to the
 * cloud we say so plainly, in the amber advisory register rather than as an
 * error. On a school Microsoft 365 tenant, Documents is redirected into OneDrive
 * by default, and a teacher who accepts that default would silently sync student
 * names and disability plans off the machine.
 */
export default function LocationChooser({ locationStatus, onChosen }) {
  const [options, setOptions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    dataBridge.suggestLocations().then(setOptions);
  }, []);

  const choose = async (dirPath) => {
    setBusy(true);
    setError(null);
    const result = await dataBridge.chooseLocation(dirPath);
    setBusy(false);
    if (result.ok) onChosen(result);
    else setError(result.reason || 'That folder could not be used.');
  };

  const browse = async () => {
    const picked = await dataBridge.pickFolder();
    if (picked.canceled) return;
    if (picked.probe && !picked.probe.writable) {
      setError('That folder is not writable. Try another.');
      return;
    }
    choose(picked.dirPath);
  };

  return (
    <div className="acc-onboard">
      <div className="acc-onboard__aurora" aria-hidden="true">
        <span className="acc-blob acc-blob--1" />
        <span className="acc-blob acc-blob--2" />
        <span className="acc-blob acc-blob--3" />
      </div>

      <div className="acc-onboard__panel acc-cascade">
        <p className="acc-subhead acc-enter">Where should we keep your records?</p>

        <h1 className="acc-display acc-enter">
          {locationStatus === 'missing'
            ? 'We couldn’t find your records'
            : 'Choose a home for your data'}
        </h1>

        <p className="acc-onboard__lede acc-enter">
          {locationStatus === 'missing'
            ? 'The folder we had saved is no longer there. Nothing has been deleted — pick where your records live and we’ll pick up where you left off.'
            : 'Your students’ information is saved as a single file on this computer. It is never sent anywhere.'}
        </p>

        <ul className="acc-onboard__options acc-enter">
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className={`acc-locationcard${option.synced ? ' acc-locationcard--advisory' : ''}`}
                onClick={() => choose(option.dirPath)}
                disabled={busy || !option.writable}
              >
                <span className="acc-locationcard__top">
                  <span className="acc-locationcard__label">{option.label}</span>
                  {option.id === 'local' && !option.synced && (
                    <span className="acc-locationcard__tag">Recommended</span>
                  )}
                </span>
                <span className="acc-locationcard__hint">{option.hint}</span>
                <code className="acc-locationcard__path">{option.dirPath}</code>

                {option.synced && (
                  <span className="acc-locationcard__advisory">
                    This folder syncs to {option.provider}. Your students’ information would be
                    copied off this computer.
                  </span>
                )}
                {option.existingFile && (
                  <span className="acc-locationcard__found">
                    An existing record was found here — we’ll open it.
                  </span>
                )}
                {!option.writable && (
                  <span className="acc-locationcard__advisory">
                    This computer won’t let us save here ({option.reason}).
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <div className="acc-onboard__actions acc-enter">
          <button type="button" className="acc-btn" onClick={browse} disabled={busy}>
            Choose a different folder…
          </button>
        </div>

        {error && <p className="acc-onboard__error acc-fade-enter">{error}</p>}
      </div>
    </div>
  );
}
