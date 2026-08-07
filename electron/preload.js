'use strict';

/**
 * The entire main<->renderer contract. One namespace, mirroring the
 * contextBridge pattern in bigchat/electron/preload.js:14.
 *
 * Rules:
 *   - No raw `fs`, `path`, or `child_process` is ever exposed.
 *   - The renderer sends and receives plain JSON only.
 *   - Every handler re-validates its payload in main; nothing here is trusted.
 *
 * Runs with sandbox: true, so only the electron module is available.
 */

const { contextBridge, ipcRenderer } = require('electron');

/** Wrap a push channel so the renderer gets an unsubscribe function back. */
function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('accommodations', {
  data: {
    /** Resolve the data location and read the file. → { status, text, meta } */
    load: () => ipcRenderer.invoke('data:load'),

    /** Persist the serialized document. Debounced and made atomic in main. */
    save: (text) => ipcRenderer.invoke('data:save', text),

    /** Force any pending debounced write to disk right now. */
    flush: () => ipcRenderer.invoke('data:flush'),

    /** Probe a candidate folder: writability + cloud-sync detection. */
    probeLocation: (dirPath) => ipcRenderer.invoke('data:probeLocation', dirPath),

    /** Suggested default locations for the onboarding DataLocation step. */
    suggestLocations: () => ipcRenderer.invoke('data:suggestLocations'),

    /** Native folder picker. → { canceled, dirPath, probe } */
    pickFolder: () => ipcRenderer.invoke('data:pickFolder'),

    /** Commit a chosen folder and write the pointer file. */
    chooseLocation: (dirPath) => ipcRenderer.invoke('data:chooseLocation', dirPath),

    /**
     * Change folders after the fact: copies the record across, then points here.
     * `{ replace: true }` is the answer to a `EXISTING_RECORD` refusal.
     */
    relocate: (dirPath, options) => ipcRenderer.invoke('data:relocate', dirPath, options),

    /** Open the data folder in Explorer. */
    revealFolder: () => ipcRenderer.invoke('data:revealFolder'),

    listBackups: () => ipcRenderer.invoke('data:listBackups'),
    restoreBackup: (id) => ipcRenderer.invoke('data:restoreBackup', id),
    exportBackup: () => ipcRenderer.invoke('data:exportBackup'),

    /** 'saving' | 'saved' | 'error' | 'readonly' */
    onStatus: (cb) => subscribe('data:status', cb),

    /** Fires when the file changes underneath us (another process wrote it). */
    onExternalChange: (cb) => subscribe('data:externalChange', cb),
  },

  pdf: {
    /**
     * Render the print view already mounted in this window to a PDF, then offer
     * a save dialog. `{ from, to }` only shape the suggested filename.
     */
    export: (payload) => ipcRenderer.invoke('pdf:export', payload),

    /** Same view, straight to the system print dialog. */
    print: (payload) => ipcRenderer.invoke('pdf:print', payload),

    /** Open a just-saved PDF in the system reader. */
    reveal: (filePath) => ipcRenderer.invoke('pdf:reveal', filePath),
  },

  app: {
    getInfo: () => ipcRenderer.invoke('app:getInfo'),
    /** Save-and-exit. Main flushes any pending write before quitting. */
    quit: () => ipcRenderer.invoke('app:quit'),
    /** Forces a flush before the window goes away. */
    onBeforeQuit: (cb) => subscribe('app:beforeQuit', cb),
  },
});
