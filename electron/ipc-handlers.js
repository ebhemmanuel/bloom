'use strict';

/**
 * IPC registration.
 *
 * Every handler validates its own payload. The renderer is trusted code today,
 * but this is the boundary where a bug becomes a filesystem write, so it is
 * checked anyway. No raw path from the renderer is ever used without resolution.
 */

const { app, ipcMain, dialog, shell } = require('electron');

const paths = require('./data-paths');
const { createDataStore } = require('./data-store');
const log = require('./app-log');

/** The active store, created once a data location is known. */
let store = null;
let getWindow = () => null;

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
    // keep saying so — this is student PII leaving the machine.
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
      },
    };
  });

  ipcMain.handle('data:save', (_e, text) => {
    if (typeof text !== 'string') return { ok: false, reason: 'BAD_PAYLOAD' };
    const s = requireStore();
    if (!s) return { ok: false, reason: 'NO_LOCATION' };
    return s.save(text);
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
}

/** Force a write before the process goes away. Called from main on quit paths. */
function flushPendingWrites() {
  if (store && store.hasPendingWrite()) {
    log.info('flushing pending write before exit');
    store.flush();
  }
}

module.exports = { registerIpcHandlers, flushPendingWrites };
