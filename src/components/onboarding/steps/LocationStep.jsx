import LocationChooser, { browseForFolder } from '../../shared/LocationChooser.jsx';

/**
 * Where the record lives.
 *
 * Not part of the v2 design, and shown only when no folder has been configured
 * yet, which on a normal first run is never: the pointer is usually written
 * before onboarding ever appears. It slots between the day question and the
 * summary so the flow stays continuous when it does appear.
 *
 * The list itself is `LocationChooser`, shared with Settings, so the question
 * asked here in August is the same screen answered again in March.
 */
export default function LocationStep({ onChoose, busy, error }) {
  const browse = async () => {
    const dirPath = await browseForFolder();
    if (dirPath) onChoose(dirPath);
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
                  Your students&rsquo; information is saved as a single file. The app itself never
                  sends it anywhere.
                </p>
              </div>

              <LocationChooser onChoose={onChoose} busy={busy} error={error} />
            </div>
          </div>
        </div>

        {/* Choosing a folder above is what advances, so the footer carries no
            primary: only the escape hatch to somewhere not on the list. */}
        <footer className="acc-sheet__foot">
          <div className="acc-sheet__footside">
            <button
              type="button"
              className="acc-btn acc-btn--quiet acc-btn--accent"
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
