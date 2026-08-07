import { useCallback, useEffect, useState } from 'react';
import { dataBridge } from '../../lib/bridge.js';

/**
 * Where the record lives, as a list of folders to choose from.
 *
 * One component, two homes: the setup step that asks the question for the first
 * time, and the Settings screen that asks it again in March. The list is
 * identical in both, because "where do my records live" is one question and a
 * teacher should not have to recognise two different screens as being about it.
 *
 * The ordering comes from the main process (electron/data-paths.js) and is
 * deliberate: the cloud folder first, local underneath. District laptops get
 * reimaged, and a reimage takes a local-only folder with it.
 *
 * Sync is stated on every option, never hidden, but it is stated in the register
 * it deserves. On the cloud option it is the REASON to pick it, so it reads as a
 * note; on a folder that happens to be synced by accident, it is still a
 * warning.
 */

/** The native folder picker, with its cancel already handled. */
export async function browseForFolder() {
  const picked = await dataBridge.pickFolder();
  return picked.canceled ? null : picked.dirPath;
}

export default function LocationChooser({ onChoose, busy, error, currentDir = null }) {
  const [options, setOptions] = useState([]);

  useEffect(() => {
    let alive = true;
    dataBridge.suggestLocations().then((list) => {
      if (alive) setOptions(list || []);
    });
    return () => {
      alive = false;
    };
  }, []);

  const same = useCallback(
    (dirPath) =>
      Boolean(currentDir) &&
      String(dirPath)
        .replace(/[\\/]+$/, '')
        .toLowerCase() ===
        String(currentDir)
          .replace(/[\\/]+$/, '')
          .toLowerCase(),
    [currentDir]
  );

  return (
    <>
      <ul className="acc-ob__locations">
        {options.map((option) => {
          const here = same(option.dirPath);
          return (
            <li key={option.id}>
              <button
                type="button"
                className={`acc-ob__location${
                  option.synced && option.kind !== 'cloud' ? ' acc-ob__location--advisory' : ''
                }${here ? ' acc-ob__location--current' : ''}`}
                onClick={() => onChoose(option.dirPath)}
                disabled={busy || !option.writable || here}
              >
                <span className="acc-ob__location-top">
                  <span className="acc-ob__location-label">{option.label}</span>
                  {/* Where it already is beats what we would recommend: telling
                      someone to pick the folder they are standing in is noise. */}
                  {here ? (
                    <span className="acc-ob__tag">Current</span>
                  ) : (
                    option.recommended && <span className="acc-ob__tag">Recommended</span>
                  )}
                </span>
                {/* The real folder, built in the main process from the account
                    actually signed in - see suggestLocations. Then ONE
                    descriptor under it, saying what picking it means. */}
                <code className="acc-ob__location-path">{option.dirPath}</code>
                <span className="acc-ob__location-hint">{option.hint}</span>

                {option.synced && option.kind !== 'cloud' && (
                  <span className="acc-ob__location-advisory">
                    This folder syncs to {option.provider}. Your students&rsquo; information would
                    be copied off this computer.
                  </span>
                )}
                {option.existingFile && !here && (
                  <span className="acc-ob__location-found">
                    There is already a record in this folder.
                  </span>
                )}
                {!option.writable && (
                  <span className="acc-ob__location-advisory">
                    This computer won&rsquo;t let us save here ({option.reason}).
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {error && <p className="acc-ob__error">{error}</p>}
    </>
  );
}
