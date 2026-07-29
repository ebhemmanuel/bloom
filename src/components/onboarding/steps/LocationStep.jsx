import { useEffect, useState } from 'react';
import { dataBridge } from '../../../lib/bridge.js';

/**
 * Where the record lives.
 *
 * Not part of the v2 design, and shown only when no folder has been configured
 * yet, which on a normal first run is never: the pointer is usually written
 * before onboarding ever appears. It slots between the day question and the
 * summary so the flow stays continuous when it does appear.
 *
 * The OneDrive advisory is the reason this screen exists at all. School tenants
 * redirect Documents into OneDrive by default, so the obvious folder is often
 * the one that would copy student information off the machine.
 */
export default function LocationStep({ onChoose, busy, error }) {
  const [options, setOptions] = useState([]);

  useEffect(() => {
    dataBridge.suggestLocations().then(setOptions);
  }, []);

  const browse = async () => {
    const picked = await dataBridge.pickFolder();
    if (picked.canceled) return;
    onChoose(picked.dirPath);
  };

  return (
    <div className="acc-ob__screen acc-ob__screen--card">
      <div className="acc-sheet__dialog acc-sheet__dialog--wide">
        <div className="acc-sheet__body">
          <div className="acc-sheet__view">
            <div className="acc-sheet__pane">
              <div className="acc-sheet__intro">
                <h1 className="acc-sheet__title">Where should your records live?</h1>
                <p className="acc-sheet__sub">
                  Your students&rsquo; information is saved as a single file on this computer. It is
                  never sent anywhere.
                </p>
              </div>

        <ul className="acc-ob__locations">
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className={`acc-ob__location${option.synced ? ' acc-ob__location--advisory' : ''}`}
                onClick={() => onChoose(option.dirPath)}
                disabled={busy || !option.writable}
              >
                <span className="acc-ob__location-top">
                  <span className="acc-ob__location-label">{option.label}</span>
                  {option.id === 'local' && !option.synced && (
                    <span className="acc-ob__tag">Recommended</span>
                  )}
                </span>
                <span className="acc-ob__location-hint">{option.hint}</span>
                <code className="acc-ob__location-path">{option.dirPath}</code>

                {option.synced && (
                  <span className="acc-ob__location-advisory">
                    This folder syncs to {option.provider}. Your students&rsquo; information would
                    be copied off this computer.
                  </span>
                )}
                {option.existingFile && (
                  <span className="acc-ob__location-found">
                    An existing record was found here, we&rsquo;ll open it.
                  </span>
                )}
                {!option.writable && (
                  <span className="acc-ob__location-advisory">
                    This computer won&rsquo;t let us save here ({option.reason}).
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

              {error && <p className="acc-ob__error">{error}</p>}
            </div>
          </div>
        </div>

        {/* Choosing a folder above is what advances, so the footer carries no
            primary: only the escape hatch to somewhere not on the list. */}
        <footer className="acc-sheet__foot">
          <div className="acc-sheet__footside">
            <button
              type="button"
              className="acc-btn acc-btn--quiet"
              onClick={browse}
              disabled={busy}
            >
              Choose a different folder
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
