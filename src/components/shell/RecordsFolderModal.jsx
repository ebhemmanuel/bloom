import { useState } from 'react';
import SceneFrame from '../shared/SceneFrame.jsx';
import LocationChooser, { browseForFolder } from '../shared/LocationChooser.jsx';
import { useData } from '../../context/DataContext.jsx';
import { dataBridge } from '../../lib/bridge.js';

/**
 * Change where the records are kept, after setup has already happened.
 *
 * The same question setup asks, on the same list, because it is the same
 * question. What is different is that there is now a year of record to think
 * about, so this screen COPIES rather than moves: the file lands in the new
 * folder and the old one is left exactly where it is. A teacher who picks the
 * wrong drive gets a stale duplicate, not a missing year.
 *
 * Three outcomes, and all three are said out loud:
 *
 *   - Copied and now reading from there. The common one.
 *   - There is already a record in that folder. Refused, and turned into a
 *     choice - because overwriting somebody's record is not a side effect.
 *   - The folder will not take a file. Refused with the reason Windows gave.
 */
export default function RecordsFolderModal({ background, leaving = false, onClose }) {
  const { meta, patchMeta } = useData();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // A folder that already holds a record, held while we ask about it.
  const [collision, setCollision] = useState(null);

  const currentDir = meta.dirPath || null;

  const move = async (dirPath, { replace = false } = {}) => {
    setBusy(true);
    setError(null);
    const result = await dataBridge.relocate(dirPath, { replace });
    setBusy(false);

    if (!result.ok) {
      if (result.reason === 'EXISTING_RECORD') {
        setCollision(dirPath);
        return;
      }
      setError(
        result.reason === 'NOTHING_TO_COPY'
          ? 'There was nothing to copy yet, so nothing was changed.'
          : `That folder could not be used (${result.reason}).`
      );
      return;
    }

    setCollision(null);
    // The document did not change, only where it is written - so the meta is
    // patched rather than the whole record re-read.
    patchMeta({
      dirPath: result.dirPath,
      path: result.probe?.dataFile || result.dirPath,
      synced: Boolean(result.probe?.synced),
      syncProvider: result.probe?.provider || null,
    });
  };

  const browse = async () => {
    const dirPath = await browseForFolder();
    if (dirPath) move(dirPath);
  };

  const footer = (
    <>
      <div className="acc-sheet__footside">
        {collision ? (
          <button
            type="button"
            className="acc-btn acc-btn--quiet"
            onClick={() => setCollision(null)}
          >
            Back
          </button>
        ) : (
          // The escape hatch to a folder not on the list, in the accent the
          // rest of the app gives a footer's left-hand alternative route.
          <button
            type="button"
            className="acc-btn acc-btn--quiet acc-btn--accent"
            onClick={browse}
            disabled={busy}
          >
            Choose a different folder
          </button>
        )}
      </div>
      <div className="acc-sheet__footside">
        {collision ? (
          <button
            type="button"
            className="acc-btn acc-btn--primary acc-btn--warn"
            onClick={() => move(collision, { replace: true })}
            disabled={busy}
          >
            Replace it with mine
          </button>
        ) : (
          <button type="button" className="acc-btn acc-btn--primary" onClick={onClose}>
            Done
          </button>
        )}
      </div>
    </>
  );

  return (
    <SceneFrame
      label="Records folder"
      background={background}
      leaving={leaving}
      onClose={onClose}
      footer={footer}
    >
      <div className="acc-sheet__view" key={collision ? 'collision' : 'list'}>
        {collision ? (
          <div className="acc-sheet__pane">
            <div className="acc-sheet__intro acc-sheet__intro--center">
              <h1 className="acc-sheet__title">There is already a record here</h1>
              <p className="acc-sheet__sub acc-sheet__sub--balance">
                That folder holds records from another setup. Replacing them keeps yours and sets
                theirs aside in the same folder, under a dated name, so nothing is lost either way.
              </p>
            </div>
            <code className="acc-ob__location-path acc-ob__location-path--alone">{collision}</code>
          </div>
        ) : (
          <div className="acc-sheet__pane">
            <div className="acc-sheet__intro">
              <h1 className="acc-sheet__title">Where your records live</h1>
              <p className="acc-sheet__sub">
                Choosing a folder copies your records into it and keeps them there from now on. The
                originals stay where they are until you delete them yourself.
              </p>
            </div>

            {/* No "copied" line underneath. The Current tag moving to the row
                that was just picked is the confirmation, and a sentence saying
                a change was made is nonsense on the screen a teacher opens to
                look rather than to change anything. */}
            <LocationChooser onChoose={move} busy={busy} error={error} currentDir={currentDir} />
          </div>
        )}
      </div>
    </SceneFrame>
  );
}
