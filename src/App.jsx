import { useMemo, useState } from 'react';
import { DataProvider, useData, LOAD_STAGES } from './context/DataContext.jsx';
import Board from './components/board/Board.jsx';
import OnboardingFlow from './components/onboarding/OnboardingFlow.jsx';
import AppHeader, { useHeaderPanel } from './components/shell/AppHeader.jsx';
import ProfileModal from './components/shell/ProfileModal.jsx';
import NotificationsPanel from './components/shell/NotificationsPanel.jsx';
import DayNotesPanel from './components/shell/DayNotesPanel.jsx';
import Modal from './components/shared/Modal.jsx';
import AddStudentForm from './components/manage/AddStudentForm.jsx';
import { BoardProvider, useBoard } from './context/BoardContext.jsx';
import { deriveNotifications } from './domain/notifications.js';
import { PRODUCT_NAME } from './domain/schema.js';
import { dataBridge } from './lib/bridge.js';

/** Startup loader. Real staged progress, then a crossfade into what comes next. */
function Loader({ loadState }) {
  const stage = LOAD_STAGES.find((s) => s.id === loadState.stage) || LOAD_STAGES[0];
  return (
    <div className="acc-splash">
      <div className="acc-splash__aurora" aria-hidden="true">
        <span className="acc-blob acc-blob--1" />
        <span className="acc-blob acc-blob--2" />
      </div>
      <div className="acc-splash__content">
        <h1 className="acc-display">{PRODUCT_NAME}</h1>
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

/** The shell, once a document is loaded and onboarding is done. */
function AppShell() {
  const { doc, meta, repairs, dismissRepairs } = useData();
  const { model, search, setSearch, setDateKey } = useBoard();
  const { openPanel, toggle, close } = useHeaderPanel();
  const [addingStudent, setAddingStudent] = useState(false);

  const notifications = useMemo(
    () => deriveNotifications(doc, { meta, boardModel: model }),
    [doc, meta, model]
  );

  return (
    <div className="acc-app">
      {/*
        The page blooms, the board does not. Aurora and the drifting blob field
        render BEHIND the floating frame; the board card itself stays clean.
      */}
      <div className="acc-app__backdrop" aria-hidden="true" />
      <div className="acc-app__field" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      {/*
        One container owns the measure. Every chrome element — pill nav, board —
        lives inside it, so nothing can drift out of alignment the way it does
        when each piece caps its own width.
      */}
      <div className="acc-app__frame">
        <AppHeader
          notifications={notifications}
          openPanel={openPanel}
          onOpenSettings={() => toggle('settings')}
          onOpenNotifications={() => toggle('notifications')}
          onOpenDayNotes={() => toggle('daynotes')}
          onAddStudent={() => setAddingStudent(true)}
          hasDayNotes={Boolean(model.dayNotes || model.teacherAbsence)}
          search={search}
          onSearchChange={setSearch}
          matchCount={model.laneCount}
          hiddenCount={model.hiddenBySearch}
          studentCount={model.laneCount}
        />

        {openPanel === 'settings' && <ProfileModal onClose={close} />}
        {openPanel === 'daynotes' && <DayNotesPanel onClose={close} />}
        {openPanel === 'notifications' && (
          <NotificationsPanel
            notifications={notifications}
            onClose={close}
            onAct={(n) => {
              if (n.act === 'revealFolder') dataBridge.revealFolder();
              if (n.act === 'openNotes') toggle('daynotes');
              if (n.act === 'goToDate' && n.payload) setDateKey(n.payload);
            }}
          />
        )}

        {addingStudent && (
          <Modal
            wide
            title="Add a student"
            subtitle="Paste their accommodations straight from the IEP, or pick from a starter set."
            onClose={() => setAddingStudent(false)}
          >
            <AddStudentForm onAdded={() => setAddingStudent(false)} />
          </Modal>
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

        <main className="acc-app__main">
          <Board />
        </main>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { doc, loadState } = useData();

  if (loadState.status === 'loading') return <Loader loadState={loadState} />;

  // Choosing a data location and introducing yourself are one continuous flow,
  // not a gate in front of a gate. OnboardingFlow folds the location step in when
  // one is needed and skips it when a folder is already configured.
  //
  // Whether onboarding is done is PERSISTED state, so the document is the source
  // of truth — not the load-time snapshot. Keying this off loadState would leave
  // the user stuck after they complete setup, since finishing writes to the doc
  // and never revisits how the app booted.
  const needsLocation =
    loadState.status === 'needs-location' || loadState.status === 'needs-onboarding-location';

  if (needsLocation || !doc || !doc.settings?.onboardingCompletedAt) {
    return <OnboardingFlow needsLocation={needsLocation} />;
  }

  // BoardProvider sits here rather than at the root because it reads the loaded
  // document; mounting it earlier would build a board model from nothing.
  return (
    <BoardProvider>
      <AppShell />
    </BoardProvider>
  );
}

export default function App() {
  return (
    <DataProvider>
      <AppRoutes />
    </DataProvider>
  );
}
