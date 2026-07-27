import { useMemo, useState } from 'react';
import { DataProvider, useData, LOAD_STAGES } from './context/DataContext.jsx';
import Board from './components/board/Board.jsx';
import LocationChooser from './components/onboarding/LocationChooser.jsx';
import AppHeader, { useHeaderPanel } from './components/shell/AppHeader.jsx';
import SettingsPanel from './components/shell/SettingsPanel.jsx';
import NotificationsPanel from './components/shell/NotificationsPanel.jsx';
import { createSampleDoc } from './domain/sampleData.js';
import { openDay } from './domain/mutations.js';
import { deriveNotifications } from './domain/notifications.js';
import { todayKey } from './domain/dates.js';
import { isDesktop, dataBridge } from './lib/bridge.js';

/**
 * Interim loader. Replaced in Phase 7 by the full splash: aurora blobs entering
 * individually, real staged progress, then a crossfade into the board.
 */
function Loader({ loadState }) {
  const stage = LOAD_STAGES.find((s) => s.id === loadState.stage) || LOAD_STAGES[0];
  return (
    <div className="acc-splash">
      <div className="acc-splash__aurora" aria-hidden="true">
        <span className="acc-blob acc-blob--1" />
        <span className="acc-blob acc-blob--2" />
      </div>
      <div className="acc-splash__content">
        <h1 className="acc-display">Accommodations Tracker</h1>
        <p className="acc-splash__stage" aria-live="polite">
          {stage.label}
        </p>
        <div className="acc-splash__track">
          {/*
            Sets a CSS custom property rather than a real property. That keeps the
            no-inline-styles rule intact — the stylesheet still owns how progress
            is drawn, this only supplies the value.
          */}
          <div
            className="acc-splash__fill"
            style={{ '--acc-progress': `${Math.round((loadState.progress || 0) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Interim gate before onboarding exists (Phase 7). Offers the sample classroom so
 * the board can be evaluated without typing a roster first.
 */
function StartGate() {
  const { setDoc } = useData();
  const [busy, setBusy] = useState(false);

  const loadSample = () => {
    setBusy(true);
    setDoc(openDay(createSampleDoc(), todayKey()));
  };

  return (
    <div className="acc-onboard">
      <div className="acc-onboard__aurora" aria-hidden="true">
        <span className="acc-blob acc-blob--1" />
        <span className="acc-blob acc-blob--2" />
        <span className="acc-blob acc-blob--3" />
      </div>

      <div className="acc-onboard__panel acc-cascade">
        <p className="acc-subhead acc-enter">Accommodations Tracker</p>
        <h1 className="acc-display acc-enter">Welcome</h1>
        <p className="acc-onboard__lede acc-enter">
          Keep a daily record of the accommodations you deliver, and print it when you need to show
          your work. Everything stays on this computer.
        </p>
        <p className="acc-onboard__note acc-enter">
          The full setup wizard — your name, subjects and grades, then your roster — arrives in the
          next phase. For now you can explore with a sample classroom.
        </p>
        <div className="acc-onboard__actions acc-enter">
          <button
            type="button"
            className="acc-btn acc-btn--primary"
            onClick={loadSample}
            disabled={busy}
          >
            Explore with a sample classroom
          </button>
        </div>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { doc, loadState, meta, repairs, dismissRepairs } = useData();
  const { openPanel, toggle, close } = useHeaderPanel();

  const notifications = useMemo(() => (doc ? deriveNotifications(doc, { meta }) : []), [doc, meta]);

  if (loadState.status === 'loading') return <Loader loadState={loadState} />;

  if (loadState.status === 'needs-location') {
    return (
      <LocationChooser
        locationStatus={meta.locationStatus}
        onChosen={() => window.location.reload()}
      />
    );
  }

  // Whether onboarding is done is PERSISTED state, so the document is the source
  // of truth — not the load-time snapshot. Keying this off loadState would leave
  // the user stuck on the gate after they complete setup, since finishing
  // onboarding writes to the doc and never revisits how the app booted.
  if (!doc || !doc.settings?.onboardingCompletedAt) return <StartGate />;

  return (
    <div className="acc-app">
      {/*
        One container owns the measure. Every chrome element — banners, toolbar,
        board — lives inside it, so nothing can drift out of alignment the way it
        does when each piece caps its own width.
      */}
      <div className="acc-app__frame">
        <AppHeader
          notifications={notifications}
          openPanel={openPanel}
          onOpenSettings={() => toggle('settings')}
          onOpenNotifications={() => toggle('notifications')}
        />

        {openPanel === 'settings' && <SettingsPanel onClose={close} />}
        {openPanel === 'notifications' && (
          <NotificationsPanel
            notifications={notifications}
            onClose={close}
            onAct={(n) => {
              if (n.act === 'revealFolder') dataBridge.revealFolder();
            }}
          />
        )}

        {meta.tooNew && (
          <div className="acc-banner acc-banner--warn">
            This file was written by a newer version of the app. It is open read-only so nothing is
            lost.
          </div>
        )}

        {meta.synced && (
          <div className="acc-banner acc-banner--warn">
            Your records are in a folder that syncs to {meta.syncProvider}. Student information is
            being copied off this computer.
          </div>
        )}

        {meta.recoveredFrom && (
          <div className="acc-banner acc-banner--ok">
            Recovered your records from a backup. The unreadable file was kept, not deleted.
          </div>
        )}

        {repairs.length > 0 && (
          <div className="acc-banner acc-banner--warn">
            <span>
              {repairs[0]}
              {repairs.length > 1 ? ` (+${repairs.length - 1} more)` : ''}
            </span>
            <span className="acc-banner__actions">
              <button
                type="button"
                className="acc-btn acc-btn--small acc-btn--quiet"
                onClick={dismissRepairs}
              >
                Dismiss
              </button>
            </span>
          </div>
        )}

        {!isDesktop && (
          <div className="acc-banner acc-banner--info">
            Browser preview — data is kept in this browser only, not in a real record file.
          </div>
        )}

        <main className="acc-app__main">
          <Board />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <DataProvider>
      <AppRoutes />
    </DataProvider>
  );
}
