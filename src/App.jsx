import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DataProvider, useData, LOAD_STAGES } from './context/DataContext.jsx';
import Board from './components/board/Board.jsx';
import OnboardingFlow from './components/onboarding/OnboardingFlow.jsx';
import AmbientScene from './components/shared/AmbientScene.jsx';
import FeedbackButton from './components/shared/FeedbackButton.jsx';
import AboutBloom from './components/about/AboutBloom.jsx';
import { setupStage } from './domain/onboarding.js';
import AppHeader, { useHeaderPanel } from './components/shell/AppHeader.jsx';
import ProfileModal from './components/shell/ProfileModal.jsx';
import NotificationsPanel from './components/shell/NotificationsPanel.jsx';
import DayNotesPanel from './components/shell/DayNotesPanel.jsx';
import RecordsFolderModal from './components/shell/RecordsFolderModal.jsx';
import AddStudentWizard from './components/manage/AddStudentWizard.jsx';
import EditStudentWizard from './components/manage/EditStudentWizard.jsx';
import CatalogModal from './components/manage/CatalogModal.jsx';
import CopyAccommodationsModal from './components/manage/CopyAccommodationsModal.jsx';
import PrintReportModal from './components/print/PrintReportModal.jsx';
import CommandPalette, { useCommandPalette } from './components/shell/CommandPalette.jsx';
import { BoardProvider, useBoard } from './context/BoardContext.jsx';
import { deriveNotifications } from './domain/notifications.js';
import { PRODUCT_NAME } from './domain/schema.js';
import { DEFAULT_BACKGROUND_STYLE, DEFAULT_LOW_PERFORMANCE } from './domain/constants.js';
import { dayHasWork } from './domain/seed.js';
import { dataBridge, appBridge, updateBridge, isDesktop, isNativeMobile } from './lib/bridge.js';
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
  const firstrunClass = useFirstRunCascade(firstRun, clearFirstRun);
  const { model, setDateKey } = useBoard();
  const background = doc.settings?.backgroundStyle || DEFAULT_BACKGROUND_STYLE;
  const { openPanel, toggle, close } = useHeaderPanel();
  // One slot: only ever one modal at a time, and dismissing is a single action.
  const [modal, setModal] = useState(null);
  // Which student the profile modal opens on, when it was reached from a lane.
  const [editingStudentId, setEditingStudentId] = useState(null);
  // And which student the print sheet is about, when it was reached the same
  // way. Null is the whole class, which is what the File menu asks for.
  const [printingStudentId, setPrintingStudentId] = useState(null);

  /**
   * The board's half of opening and closing a full-screen scene.
   *
   * Two things use it: About, and adding a student. Both replace the board
   * rather than sitting on top of it, so neither takes a scrim - the rows fall,
   * the aurora comes up through where they were, and the new screen fades in on
   * the same beat. On the way back the rows rise as it clears.
   *
   * `out` while the scene arrives, `in` while it leaves. `sceneLeaving` keeps
   * the scene mounted for its own exit; unmounting on click would cut it away
   * and leave the board cascading in behind nothing.
   *
   * It settles to `rest` rather than to null. Clearing it let each row fall
   * back to `.acc-lane`'s own entrance, and a changed animation-name restarts -
   * so the board cascaded in and then flickered through a second, faster one.
   * See the `rest` rule.
   */
  const [boardCascade, setBoardCascade] = useState('rest');
  const [sceneLeaving, setSceneLeaving] = useState(false);
  const sceneTimers = useRef([]);
  useEffect(() => () => sceneTimers.current.forEach(clearTimeout), []);

  /**
   * First-run rides the same cascade About's close does, DERIVED rather than
   * set from an effect.
   *
   * An effect was one commit too late: the `--held` class came off in the frame
   * the hook started running, and `data-board-cascade` only reached `in` on the
   * next one. For that frame the board was fully visible with no animation
   * attached, so it flashed into place and then cascaded from nothing - which
   * read as the board simply appearing.
   *
   * Reading it during render puts both in the same commit. `--held` rests
   * (nothing animating, the hook's own rule holds everything at zero) and the
   * running state hands straight over to the shared cascade.
   */
  const firstRunCascade = firstrunClass.includes('--held')
    ? 'rest'
    : firstrunClass.includes('--in') || firstrunClass.includes('--fade')
      ? 'in'
      : null;
  const cascadeAttr = firstRunCascade ?? boardCascade;

  const openScene = useCallback((id) => {
    setBoardCascade('out');
    setSceneLeaving(false);
    setModal(id);
  }, []);

  const closeScene = useCallback(() => {
    setSceneLeaving(true);
    setBoardCascade('in');
    /*
      Unmounted AFTER the fade has finished, not on its last frame.

      This sat on 420ms against a 420ms fade, so React pulled the element on
      the same tick the animation was still painting - the screen disappeared
      instead of clearing. 520 leaves the sheet's 460ms fade room to land.
    */
    sceneTimers.current.push(
      setTimeout(() => {
        setModal(null);
        setSceneLeaving(false);
      }, 520)
    );
    sceneTimers.current.push(setTimeout(() => setBoardCascade('rest'), 1900));
  }, []);
  const palette = useCommandPalette();

  /**
   * The three counts About shows.
   *
   * Days RECORDED, not days that exist: the year is laid out in advance, so
   * counting `doc.days` would report a number the teacher never earned. Active
   * assignments rather than the catalog, because the catalog is a list of
   * wordings and this is meant to say how much support is actually being
   * tracked.
   */
  const aboutStats = useMemo(
    () => ({
      students: doc.students.filter((s) => s.active && !s.archivedAt).length,
      accommodations: doc.assignments.filter((a) => !a.activeTo).length,
      daysRecorded: Object.keys(doc.days || {}).filter((d) => dayHasWork(doc, d)).length,
    }),
    [doc]
  );

  /**
   * A newer version exists, or nothing.
   *
   * Held here rather than derived, because it is the one fact in this app that
   * does not come from the record: it arrives from the main process, which is
   * the only thing that talks to the network. See electron/updates.js.
   */
  const [update, setUpdate] = useState(null);

  // Main cannot read the record - that file is the renderer's - so it is told
  // whether checking is on and when. Re-sent whenever the setting changes, so
  // switching it off takes effect without a restart.
  const updatePrefs = doc.settings?.updates;
  useEffect(() => {
    updateBridge?.setPrefs?.(updatePrefs);
  }, [updatePrefs?.enabled, updatePrefs?.checkAt]);

  useEffect(() => updateBridge?.onAvailable?.(setUpdate), []);

  const notifications = useMemo(
    () => deriveNotifications(doc, { meta, boardModel: model, update }),
    [doc, meta, model, update]
  );

  const menus = useMemo(
    () => [
      {
        id: 'file',
        label: 'File',
        items: [
          {
            label: 'Print report',
            // The whole class. Right-clicking a lane prints one student, and
            // this slot has to clear that or the menu would reopen on whoever
            // was printed last.
            onSelect: () => {
              setPrintingStudentId(null);
              openScene('print');
            },
          },
          { separator: true },
          { label: 'Show my records folder', onSelect: () => dataBridge.revealFolder() },
          // Directly under it, because "where is my folder" and "which folder
          // is it" are the same thought a beat apart. Hidden on the iPad, and
          // only there: the app container is the only place that build may
          // write, so there is nothing to configure.
          {
            label: 'Configure records folder',
            hidden: isNativeMobile,
            onSelect: () => openScene('recordsFolder'),
          },
          { label: 'Save a copy', onSelect: () => dataBridge.exportBackup() },
          { separator: true },
          // Where a desktop app puts it. This replaces the avatar button, which
          // spent a permanent slot in the bar on something opened once a term.
          { label: 'Settings', onSelect: () => openScene('settings') },
          // Directly under it, for the same reason: a screen opened once. It
          // had a word of its own in the bar, which is a permanent slot spent
          // on something read one time.
          { label: 'About', onSelect: () => openScene('about') },
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
        /*
          The two student sheets first, then the preset list.

          The heading these sat under is gone. It was there so three items
          could be named for their verb alone - Add, Update, Copy - but two of
          those now open the same pair of screens the rest of the app calls
          Add student and Edit student, and a group label above them was
          filing them under the wrong noun.
        */
        items: [
          { label: 'Add Student', onSelect: () => openScene('addStudent') },
          {
            label: 'Edit Student',
            // The edit sheet, starting on its find step. Adding accommodations
            // to someone is one of the things editing them does, so it is the
            // same screen reached without a name.
            onSelect: () => {
              setEditingStudentId(null);
              openScene('editStudent');
            },
          },
          { separator: true },
          // The shared catalog, not one student's list - which is what the
          // hint says and why it sits apart from the two above.
          { label: 'Accommodations', hint: 'presets', onSelect: () => openScene('catalog') },
          // Hidden for now, not removed: the modal behind it still works and
          // the item goes back in the same place when it returns.
          { label: 'Copy', hidden: true, onSelect: () => setModal('copy') },
        ],
      },
      /*
        Notes and About used to be words of their own out here.

        Day notes belong to a DAY, so they moved to the board's own three-dot
        menu beside Copy yesterday and Close out day - the menu bar is where you
        go for the app, not for Tuesday. About is opened once and moved under
        Settings, which is the other thing in this menu you open once.
      */
    ],
    [toggle, openScene]
  );

  return (
    <div className={`acc-app ${firstrunClass}`.trim()}>
      {/*
        The scene the app sits in front of, and the teacher's choice of it.

        The same component setup and About draw. That is the point: the
        first-run handoff cascades the board in over whatever is already there,
        and About cascades it away again, so both change what is on the page
        without changing what is behind it.
      */}
      <AmbientScene variant={background} layer="back" />

      {/*
        The motes, in front of the board rather than behind it.

        The frosted card covers almost the whole window and blurs what is behind
        it, so every speck was being erased by the surface they are meant to
        drift across. They pass over it now, still inert and still slow enough
        to read as weather rather than as something moving on the board.
      */}
      <AmbientScene variant={background} layer="motes" />

      {/*
        One container owns the measure. Every chrome element (pill nav, board)
        lives inside it, so nothing can drift out of alignment the way it does
        when each piece caps its own width.
      */}
      <div className="acc-app__frame" data-board-cascade={cascadeAttr}>
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
          // The lockup opens About, which is also under File. Two ways in for
          // the one screen that is about the app rather than the record.
          onOpenAbout={() => {
            close();
            openScene('about');
          }}
        />

        {palette.open && <CommandPalette onClose={palette.close} />}

        {openPanel === 'notifications' && (
          <NotificationsPanel
            notifications={notifications}
            onClose={close}
            onAct={(n) => {
              if (n.act === 'revealFolder') dataBridge.revealFolder();
              if (n.act === 'openNotes') {
                close();
                openScene('daynotes');
              }
              if (n.act === 'goToDate' && n.payload) setDateKey(n.payload);
              // The release page, in the teacher's own browser. Never in-app:
              // see the handler in ipc-handlers.js.
              if (n.act === 'openRelease') updateBridge?.open?.(n.payload);
            }}
          />
        )}

        {/*
          Not a dialog on a scrim. It lands where the board was, the same way
          About does, which is why it goes through openScene rather than being
          one more entry in the modal slot.
        */}
        {modal === 'addStudent' && (
          <AddStudentWizard background={background} leaving={sceneLeaving} onClose={closeScene} />
        )}

        {/* The same sheet, for the same reason: the day's notes are something
            you sit down to write, not something you jot in a corner card. */}
        {modal === 'daynotes' && (
          <DayNotesPanel background={background} leaving={sceneLeaving} onClose={closeScene} />
        )}

        {modal === 'settings' && (
          <ProfileModal background={background} leaving={sceneLeaving} onClose={closeScene} />
        )}

        {/* The same list setup asks on, asked again with a year of record in
            hand - so this one copies rather than just points. */}
        {modal === 'recordsFolder' && (
          <RecordsFolderModal background={background} leaving={sceneLeaving} onClose={closeScene} />
        )}

        {/* The same four screens adding a student uses, with a find step in
            front of them when nobody has been named. */}
        {modal === 'editStudent' && (
          <EditStudentWizard
            studentId={editingStudentId}
            background={background}
            leaving={sceneLeaving}
            onClose={closeScene}
          />
        )}
        {modal === 'catalog' && (
          <CatalogModal background={background} leaving={sceneLeaving} onClose={closeScene} />
        )}
        {modal === 'copy' && <CopyAccommodationsModal onClose={() => setModal(null)} />}
        {modal === 'print' && (
          <PrintReportModal
            studentId={printingStudentId}
            background={background}
            leaving={sceneLeaving}
            onClose={closeScene}
          />
        )}

        {modal === 'about' && (
          <AboutBloom
            stats={aboutStats}
            background={background}
            leaving={sceneLeaving}
            onClose={closeScene}
          />
        )}

        {meta.tooNew && (
          <div className="acc-banner acc-banner--warn">
            This file was written by a newer version of the app. It is open read-only so nothing is
            lost.
          </div>
        )}

        {/*
          Only when the syncing was NOT the choice. Keeping records in OneDrive
          is now the recommended answer - a district laptop gets reimaged and a
          local-only folder goes with it - so warning about a folder the teacher
          deliberately picked for that reason would be the app arguing with its
          own advice. What still deserves a banner is a folder that has been
          redirected into the cloud since it was chosen, because that one nobody
          agreed to.
        */}
        {meta.synced && !meta.syncChosen && (
          <div className="acc-banner acc-banner--warn">
            <span>
              Your records folder now syncs to {meta.syncProvider}, which was not the case when you
              chose it. Student information is being copied off this computer.
            </span>
            <span className="acc-banner__actions">
              <button
                type="button"
                className="acc-btn acc-btn--small acc-btn--quiet"
                onClick={() => openScene('recordsFolder')}
              >
                Change folder
              </button>
            </span>
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
          <Board
            onAddStudent={() => openScene('addStudent')}
            onEditStudent={(id) => {
              setEditingStudentId(id);
              openScene('editStudent');
            }}
            // The print sheet, scoped to one student. Same scene the File menu
            // opens; the id is what makes it their record rather than the class.
            onPrintStudent={(id) => {
              setPrintingStudentId(id);
              openScene('print');
            }}
            onDayNotes={() => openScene('daynotes')}
          />
        </main>
      </div>

      {/* Outside the frame, fixed to the viewport: the corner of every screen,
          including the full-screen sheets that replace the board. */}
      <FeedbackButton />
    </div>
  );
}

function AppRoutes() {
  const { doc, loadState } = useData();

  /**
   * Low performance mode, on the document element rather than on the app root.
   *
   * Everything has to be inside it: scrims, confirms and the command palette
   * render through portals outside the shell, and a mode that stopped the board
   * animating but left a dialog easing in would be a worse experience than
   * either state on its own.
   *
   * The attribute is removed rather than set to a second value, so the CSS is
   * one selector that either matches or does not.
   */
  const lowPerformance = doc?.settings?.lowPerformance ?? DEFAULT_LOW_PERFORMANCE;
  useEffect(() => {
    const root = document.documentElement;
    if (lowPerformance) root.setAttribute('data-motion', 'off');
    else root.removeAttribute('data-motion');
  }, [lowPerformance]);

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
