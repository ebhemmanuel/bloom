'use strict';

const { app, BrowserWindow, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const { hardenSession, hardenWebContents } = require('./security');
const log = require('./app-log');
const { registerIpcHandlers, flushPendingWrites } = require('./ipc-handlers');

// Keep development completely off the real userData path. That folder holds the
// pointer to a teacher's live data.json, and a dev run must never be able to
// repoint or overwrite it. Must happen before app.whenReady().
if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'accommodations-tracker-dev'));
}

/**
 * Where the built renderer lives.
 *   packaged → resources/dist-renderer  (electron-builder extraResources)
 *   dev      → <repo>/dist-renderer     (npm run build output)
 * Mirrors the packaged-vs-dev conditional in bigchat/electron/main.js:713-715.
 */
const RENDERER_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'dist-renderer')
  : path.join(__dirname, '..', 'dist-renderer');

/** Set by `npm run dev:electron` to get renderer HMR. Never set in a packaged build. */
const DEV_SERVER = app.isPackaged ? null : process.env.ACC_DEV_SERVER || null;

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#101014',
    title: 'BLOOM',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      // No remote content is ever loaded, so there is nothing to isolate against
      // besides our own renderer - but keep the defaults strict regardless.
      spellcheck: false,
    },
  });

  hardenWebContents(mainWindow.webContents);

  // Show only once painted, so the splash animation is the first thing seen
  // rather than a white flash.
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (DEV_SERVER) {
    log.info(`loading renderer from dev server: ${DEV_SERVER}`);
    mainWindow.loadURL(DEV_SERVER);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(RENDERER_DIR, 'index.html');
    if (!fs.existsSync(indexPath)) {
      log.error(`renderer bundle missing at ${indexPath}`);
      dialog.showErrorBox(
        'Accommodations Tracker',
        `The application files are incomplete.\n\nExpected to find:\n${indexPath}\n\n` +
          'Please reinstall from the original USB drive.'
      );
      app.quit();
      return;
    }
    log.info(`loading renderer from file: ${indexPath}`);
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getMainWindow() {
  return mainWindow;
}

// ---------------------------------------------------------------------------
// Single-instance lock. Two copies of the app pointed at one data.json is the
// fastest way to lose a day's work, so the second launch just focuses the first.
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    log.init(app.getPath('userData'));
    hardenSession();

    app.on('web-contents-created', (_event, contents) => {
      hardenWebContents(contents);
    });

    registerIpcHandlers({ getMainWindow, rendererDir: RENDERER_DIR });
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

// Durability. The real failure mode is not a clean quit - it is a lid closing or
// district policy shutting the machine down mid-edit, so flush on every exit path
// we can observe rather than trusting 'before-quit' alone.
app.on('before-quit', flushPendingWrites);

app.on('window-all-closed', () => {
  flushPendingWrites();
  app.quit();
});

app.whenReady().then(() => {
  const { powerMonitor } = require('electron');
  for (const event of ['suspend', 'shutdown', 'lock-screen']) {
    powerMonitor.on(event, flushPendingWrites);
  }
});

process.on('uncaughtException', (err) => {
  log.error(`uncaught exception: ${err && err.stack ? err.stack : err}`);
});
