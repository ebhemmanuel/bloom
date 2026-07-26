'use strict';

/**
 * IPC registration. Every handler validates its own payload — the renderer is
 * trusted code today, but this is the boundary where a future bug would become
 * a filesystem write, so it gets checked anyway.
 *
 * Data and PDF handlers land in Phase 1 and Phase 6 respectively.
 */

const { app, ipcMain } = require('electron');

function registerIpcHandlers() {
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
}

module.exports = { registerIpcHandlers };
