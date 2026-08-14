'use strict';

/**
 * IPC registration.
 *
 * Every handler validates its own payload. The renderer is trusted code today,
 * but this is the boundary where a bug becomes a filesystem write, so it is
 * checked anyway. No raw path from the renderer is ever used without resolution.
 */

const path = require('node:path');
const { app, ipcMain, dialog, shell } = require('electron');
const pdf = require('./pdf-export');

const paths = require('./data-paths');
const { createDataStore } = require('./data-store');
const { checkForUpdate, startUpdateSchedule, RELEASES_PAGE } = require('./updates');
const { readLicence, saveLicence, BUY_URL } = require('./licence');
const log = require('./app-log');

/** The active store, created once a data location is known. */
let store = null;
let getWindow = () => null;

/**
 * The renderer's copy of `settings.updates`, pushed up when the document loads
 * or changes.
 *
 * Main needs to know whether checking is switched on and at what time, and it
 * has no business parsing the record to find out - that file is the renderer's
 * to read and this process only ever moves its bytes. So the renderer tells it.
 */
let updatePrefs = { enabled: true, checkAt: '08:00' };
let updates = null;

function broadcast(channel, payload) {
  const win = getWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function openStore(dirPath) {
  store = createDataStore({
    dirPath,
    log,
    onStatus: (payload) => broadcast('data:status', payload),
  });
  log.info(`data store opened at ${store.filePath}`);
  return store;
}

function requireStore() {
  if (store) return store;
  const resolved = paths.resolveDataDir(app);
  if (resolved.status === 'ok') return openStore(resolved.dirPath);
  return null;
}

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

function registerIpcHandlers({ getMainWindow } = {}) {
  if (typeof getMainWindow === 'function') getWindow = getMainWindow;

  // --- app ---------------------------------------------------------------
  ipcMain.handle('app:getInfo', () => ({
    version: app.getVersion(),
    name: app.getName(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    packaged: app.isPackaged,
    userData: app.getPath('userData'),
  }));

  // --- updates -----------------------------------------------------------
  //
  // The only outbound request in the app. See electron/updates.js for what it
  // does and does not carry.

  updates = startUpdateSchedule(app, {
    getSettings: () => ({ updates: updatePrefs }),
    onResult: (result) => broadcast('updates:available', result),
  });

  /** The renderer handing over the preference it just read from the record. */
  ipcMain.handle('updates:prefs', (_e, prefs) => {
    if (prefs && typeof prefs === 'object') {
      updatePrefs = {
        enabled: prefs.enabled !== false,
        checkAt: typeof prefs.checkAt === 'string' ? prefs.checkAt : '08:00',
      };
    }
    return { ok: true };
  });

  /** The manual check. Always goes out, never uses the cached answer. */
  ipcMain.handle('updates:check', () => checkForUpdate(app, { force: true }));

  // --- licence -----------------------------------------------------------
  //
  // Verified locally against a public key compiled into the binary. Nothing
  // here reaches the network, now or ever. See electron/licence.js.

  /** Who this copy is licensed to, or null. */
  ipcMain.handle('licence:get', () => readLicence(app, store?.dirPath || null));

  /** Accept a pasted key. Returns why it failed, so the field can say. */
  ipcMain.handle('licence:set', (_e, key) => saveLicence(app, key, store?.dirPath || null));

  /**
   * Send the teacher to Stripe, in their own browser.
   *
   * The renderer passes no URL and cannot: the address lives here, so a bug or
   * an injected string in the window that holds student data can never choose
   * where this goes. `updates:open` takes a URL and has to filter it; this one
   * has nothing to filter.
   *
   * `configured: false` is a real answer rather than a failure. A build with no
   * Payment Link set simply has no buy button, and the teacher is asked for a
   * key instead.
   */
  ipcMain.handle('licence:buy', () => {
    if (!BUY_URL) return { ok: false, configured: false };
    shell.openExternal(BUY_URL);
    return { ok: true, configured: true };
  });

  /** So the renderer knows whether to offer the button at all. */
  ipcMain.handle('licence:canBuy', () => Boolean(BUY_URL));

  /**
   * Open the release page in the teacher's own browser.
   *
   * Never in-app: a page opened here would run in a window that has the preload
   * bridge attached, and no web page should ever be one mistake away from the
   * record. `shell.openExternal` hands it to the OS and forgets it.
   */
  ipcMain.handle('updates:open', (_e, url) => {
    const target =
      typeof url === 'string' && url.startsWith('https://github.com/') ? url : RELEASES_PAGE;
    shell.openExternal(target);
    return { ok: true };
  });

  // --- location ----------------------------------------------------------
  ipcMain.handle('data:suggestLocations', () => paths.suggestLocations(app));

  ipcMain.handle('data:probeLocation', (_e, dirPath) => {
    if (!isNonEmptyString(dirPath)) return { valid: false, reason: 'EMPTY' };
    return paths.probeLocation(dirPath);
  });

  ipcMain.handle('data:pickFolder', async () => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose where to keep your records',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const dirPath = result.filePaths[0];
    return { canceled: false, dirPath, probe: paths.probeLocation(dirPath) };
  });

  ipcMain.handle('data:chooseLocation', (_e, dirPath) => {
    if (!isNonEmptyString(dirPath)) return { ok: false, reason: 'EMPTY' };

    const probe = paths.probeLocation(dirPath);
    if (!probe.writable) return { ok: false, reason: probe.reason || 'NOT_WRITABLE', probe };

    paths.writePointer(app, probe.dirPath, { synced: probe.synced, provider: probe.provider });
    openStore(probe.dirPath);
    return { ok: true, dirPath: probe.dirPath, probe };
  });

  /**
   * Move house: copy the record into a new folder and read from there onward.
   *
   * The pointer is written LAST, and only if the copy landed. If the order were
   * reversed, a failed copy would leave the app pointing at an empty folder -
   * which looks exactly like every record the teacher ever kept having vanished.
   */
  ipcMain.handle('data:relocate', (_e, dirPath, options = {}) => {
    if (!isNonEmptyString(dirPath)) return { ok: false, reason: 'EMPTY' };

    const probe = paths.probeLocation(dirPath);
    if (!probe.writable) return { ok: false, reason: probe.reason || 'NOT_WRITABLE', probe };

    const current = requireStore();
    if (!current) return { ok: false, reason: 'NO_LOCATION' };
    if (path.resolve(current.dirPath) === probe.dirPath) {
      return { ok: true, unchanged: true, dirPath: probe.dirPath, probe };
    }

    const copied = current.copyRecordTo(probe.dirPath, { replace: Boolean(options.replace) });
    if (!copied.ok) return { ...copied, probe };

    paths.writePointer(app, probe.dirPath, { synced: probe.synced, provider: probe.provider });
    const from = current.dirPath;
    openStore(probe.dirPath);
    log.info('records folder changed');
    return { ok: true, dirPath: probe.dirPath, from, probe };
  });

  // --- read / write -------------------------------------------------------
  ipcMain.handle('data:load', () => {
    const resolved = paths.resolveDataDir(app);

    if (resolved.status !== 'ok') {
      // 'unconfigured' → onboarding has not run.
      // 'missing'      → the pointer names a folder that has gone. Do NOT start
      //                  fresh: an empty record is indistinguishable from data
      //                  loss, and the teacher must get a real choice.
      return {
        status: resolved.status,
        text: null,
        meta: { dirPath: resolved.dirPath, locationStatus: resolved.status },
      };
    }

    const s = openStore(resolved.dirPath);
    const result = s.load();

    // A cloud-synced location is not fatal, but the renderer must be able to
    // keep saying so - this is student PII leaving the machine.
    const sync = paths.detectSync(resolved.dirPath);

    return {
      status: result.status,
      text: result.text,
      from: result.from || null,
      quarantined: result.quarantined || null,
      meta: {
        ...result.meta,
        synced: sync.synced,
        syncProvider: sync.provider,
        /*
          Whether the syncing was the teacher's decision or something that
          happened to them. The pointer records what the folder was at the
          moment it was chosen, so a folder that has since been redirected into
          OneDrive by district policy is distinguishable from one deliberately
          picked BECAUSE it syncs - and only the first is worth a banner.
        */
        syncChosen: Boolean(resolved.pointer?.synced),
      },
    };
  });

  ipcMain.handle('data:save', (_e, text) => {
    if (typeof text !== 'string') return { ok: false, reason: 'BAD_PAYLOAD' };
    const s = requireStore();
    if (!s) return { ok: false, reason: 'NO_LOCATION' };
    return s.save(text);
  });

  /**
   * Save and exit. Flushes synchronously before quitting rather than trusting
   * the quit handler - a pending debounced write is exactly the edit a teacher
   * would be most upset to lose.
   */
  ipcMain.handle('app:quit', () => {
    if (store && store.hasPendingWrite()) store.flush();
    app.quit();
    return { ok: true };
  });

  ipcMain.handle('data:flush', () => {
    const s = requireStore();
    return s ? s.flush() : { ok: false, reason: 'NO_LOCATION' };
  });

  // --- folder & backups ---------------------------------------------------
  ipcMain.handle('data:revealFolder', async () => {
    const s = requireStore();
    if (!s) return { ok: false, reason: 'NO_LOCATION' };
    await shell.openPath(s.dirPath);
    return { ok: true, dirPath: s.dirPath };
  });

  ipcMain.handle('data:listBackups', () => {
    const s = requireStore();
    return s ? s.listBackups() : [];
  });

  ipcMain.handle('data:restoreBackup', (_e, id) => {
    if (!isNonEmptyString(id)) return { ok: false, reason: 'BAD_ID' };
    const s = requireStore();
    return s ? s.restoreBackup(id) : { ok: false, reason: 'NO_LOCATION' };
  });

  ipcMain.handle('data:exportBackup', async () => {
    const s = requireStore();
    if (!s) return { ok: false, reason: 'NO_LOCATION' };

    const loaded = s.load();
    if (!loaded.text) return { ok: false, reason: 'NOTHING_TO_EXPORT' };

    const stamp = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(getWindow(), {
      title: 'Save a copy of your records',
      defaultPath: `accommodations-backup-${stamp}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };

    require('node:fs').writeFileSync(result.filePath, loaded.text, 'utf8');
    return { ok: true, path: result.filePath };
  });

  // --- printing ------------------------------------------------------------
  //
  // Both paths print the window that is already showing the report, so the paper
  // and the screen cannot disagree. Chromium's own title-and-URL header is
  // replaced by ours in pdf-export.js - without that, a compliance record goes
  // to the district with a localhost URL across the top.

  ipcMain.handle('pdf:export', async (_e, payload = {}) => {
    const win = getWindow();
    const { from, to, landscape = false } = payload;
    const result = await pdf.exportPdf(win, {
      fileName: pdf.suggestFileName(from, to),
      landscape,
    });
    return result;
  });

  ipcMain.handle('pdf:print', async (_e, payload = {}) =>
    pdf.printDirect(getWindow(), { landscape: payload.landscape === true })
  );

  ipcMain.handle('pdf:reveal', async (_e, filePath) => {
    if (!isNonEmptyString(filePath)) return { ok: false, reason: 'BAD_PATH' };
    return pdf.revealPdf(filePath);
  });
}

/**
 * Force a write before the process goes away. Called from main on quit paths.
 *
 * Blocking, and it does not take no for an answer: the ordinary retry runs on a
 * timer, which is worth nothing once the process is exiting. If it still cannot
 * write, it leaves a recovery file rather than letting the edit evaporate.
 */
function flushPendingWrites() {
  if (!store || !store.hasPendingWrite()) return;

  log.info('flushing pending write before exit');
  const result = store.flushBlocking();
  if (!result.ok && result.recoveryPath) {
    log.error(`exit flush failed; recovery copy written (${result.reason})`);
  }
}

module.exports = { registerIpcHandlers, flushPendingWrites };
