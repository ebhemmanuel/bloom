import { useMemo, useState } from 'react';
import { DataProvider, useData, LOAD_STAGES } from './context/DataContext.jsx';
import Board from './components/board/Board.jsx';
import OnboardingFlow from './components/onboarding/OnboardingFlow.jsx';
import { setupStage } from './domain/onboarding.js';
import AppHeader, { useHeaderPanel } from './components/shell/AppHeader.jsx';
import ProfileModal from './components/shell/ProfileModal.jsx';
import NotificationsPanel from './components/shell/NotificationsPanel.jsx';
import DayNotesPanel from './components/shell/DayNotesPanel.jsx';
import Modal from './components/shared/Modal.jsx';
import AddStudentForm from './components/manage/AddStudentForm.jsx';
import StudentAccommodationsModal from './components/manage/StudentAccommodationsModal.jsx';
import CatalogModal from './components/manage/CatalogModal.jsx';
import CopyAccommodationsModal from './components/manage/CopyAccommodationsModal.jsx';
import PrintReportModal from './components/print/PrintReportModal.jsx';
import CommandPalette, { useCommandPalette } from './components/shell/CommandPalette.jsx';
import { BoardProvider, useBoard } from './context/BoardContext.jsx';
import { deriveNotifications } from './domain/notifications.js';
import { PRODUCT_NAME } from './domain/schema.js';
import { dataBridge, appBridge, isDesktop } from './lib/bridge.js';
import useFirstRunCascade from './hooks/useFirstRunCascade.js';

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
            no-inline-styles rule intact - the stylesheet still owns how progress
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
  const { doc, meta, repairs, dismissRepairs, firstRun, clearFirstRun } = useData();
  // Plays only on the run that just finished onboarding. See the hook.
  const cascade = useFirstRunCascade(firstRun, clearFirstRun);
  const { model, setDateKey } = useBoard();
  const { openPanel, toggle, close } = useHeaderPanel();
  // One slot: only ever one modal at a time, and dismissing is a single action.
  const [modal, setModal] = useState(null);
  const palette = useCommandPalette();

  const notifications = useMemo(
    () => deriveNotifications(doc, { meta, boardModel: model }),
    [doc, meta, model]
  );

  const menus = useMemo(
    () => [
      {
        id: 'file',
        label: 'File',
        items: [
          { label: 'Print report…', onSelect: () => setModal('print') },
          { separator: true },
          { label: 'Show my records folder', onSelect: () => dataBridge.revealFolder() },
          { label: 'Save a copy…', onSelect: () => dataBridge.exportBackup() },
          { separator: true },
          // Where a desktop app puts it. This replaces the avatar button, which
          // spent a permanent slot in the bar on something opened once a term.
          { label: 'Settings…', onSelect: () => toggle('settings') },
          { separator: true },
          {
            label: 'Save and exit',
            // A browser tab cannot close itself, so the item is only shown where
            // it can actually do something.
            hidden: !isDesktop,
            // Flush first, then quit. Never rely on the quit handler alone:
            // the whole point is that the last edit is on disk before we go.
            //
            // `flush` is awaited rather than fired and forgotten, because the
            // next thing that happens is the process going away.
            onSelect: async () => {
              await dataBridge.flush();
              await appBridge.quit();
            },
          },
        ],
      },
      {
        id: 'edit',
        label: 'Edit',
        items: [
          { label: 'Student accommodations…', onSelect: () => setModal('students') },
          { label: 'Add a student…', onSelect: () => setModal('addStudent') },
          { separator: true },
          { label: 'Update accommodations…', hint: 'presets', onSelect: () => setModal('catalog') },
          { label: 'Copy accommodations…', onSelect: () => setModal('copy') },
        ],
      },
      // A word in the bar rather than an icon in the corner. Day notes are
      // written most days and are the one thing here a teacher composes rather
      // than checks, so they get a name instead of a glyph to interpret.
      {
        id: 'notes',
        label: 'Notes',
        onSelect: () => toggle('daynotes'),
        pip: Boolean(model.dayNotes || model.teacherAbsence),
      },
      {
        id: 'about',
        label: 'About',
        items: [{ label: `About ${PRODUCT_NAME}`, onSelect: () => setModal('about') }],
      },
    ],
    [toggle, model.dayNotes, model.teacherAbsence]
  );

  return (
    <div className={`acc-app ${cascade}`.trim()}>
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
        One container owns the measure. Every chrome element (pill nav, board)
        lives inside it, so nothing can drift out of alignment the way it does
        when each piece caps its own width.
      */}
      <div className="acc-app__frame">
        <AppHeader
          menus={menus}
          notifications={notifications}
          openPanel={openPanel}
          onOpenNotifications={() => toggle('notifications')}
          // The search icon opens the same overlay Ctrl+Space does. One search,
          // reached two ways, rather than two searches that behave differently.
          onOpenSearch={() => {
            close();
            palette.setOpen(true);
          }}
        />

        {palette.open && <CommandPalette onClose={palette.close} />}

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

        {modal === 'addStudent' && (
          <Modal
            wide
            title="Add a student"
            subtitle="Paste their accommodations straight from the IEP, or pick from a starter set."
            onClose={() => setModal(null)}
          >
            <AddStudentForm onAdded={() => setModal(null)} />
          </Modal>
        )}

        {modal === 'students' && <StudentAccommodationsModal onClose={() => setModal(null)} />}
        {modal === 'catalog' && <CatalogModal onClose={() => setModal(null)} />}
        {modal === 'copy' && <CopyAccommodationsModal onClose={() => setModal(null)} />}
        {modal === 'print' && <PrintReportModal onClose={() => setModal(null)} />}

        {modal === 'about' && (
          <Modal title={`About ${PRODUCT_NAME}`} onClose={() => setModal(null)}>
            <div className="acc-about">
              <p>
                {PRODUCT_NAME} keeps a daily record of the accommodations you deliver, so you can
                show your work when someone asks.
              </p>
              <p>
                Documenting IEP and 504 support is required, and the systems that exist for it are
                mostly built for administrators rather than for the person actually teaching. They
                ask for a lot of clicks, at the end of a day when you have none left.
              </p>
              <p>
                This is meant to be the small version: a board you can run down in a few minutes
                after the last bell, that turns into a report when someone needs one. Nothing more
                than that.
              </p>
              <p>
                Everything lives in one file on this computer. There is no account, no database and
                no network - the app cannot send your students&rsquo; information anywhere, by
                design.
              </p>
              <dl className="acc-about__facts">
                <dt>Records</dt>
                <dd>{meta.path || 'this browser'}</dd>
                <dt>Students</dt>
                <dd>{doc.students.length}</dd>
                <dt>Accommodations</dt>
                <dd>{doc.catalog.length}</dd>
                <dt>Days recorded</dt>
                <dd>{Object.keys(doc.days || {}).length}</dd>
              </dl>
            </div>
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
          <Board onAddStudent={() => setModal('addStudent')} />
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
  // See setupStage: the document decides whether setup is done, never the load
  // status. This used to hold `needsLocation` in the condition as well, which
  // stranded anyone who booted without a pointer file - the status is a snapshot
  // of how the app started and never changes, so finishing setup did not release
  // the gate and onboarding stayed up on its last phase.
  const { showOnboarding, needsLocation } = setupStage(doc, loadState.status);

  if (showOnboarding) {
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
