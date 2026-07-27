/**
 * Thin wrapper over the preload bridge.
 *
 * Every renderer module talks to main through this file rather than touching
 * `window.accommodations` directly, which gives us two things: a single place to
 * stub the whole surface for `npm run dev` in a plain browser, and one seam to
 * mock in tests.
 */

const native = typeof window !== 'undefined' ? window.accommodations : undefined;

/** True when running inside Electron with the preload bridge attached. */
export const isDesktop = Boolean(native);

/**
 * Browser fallback for `npm run dev`. Persists to localStorage so the board is
 * usable in a normal browser tab while building UI, without pretending to be the
 * real store — `meta.browserFallback` is surfaced as a banner so nobody mistakes
 * a dev session for a real one.
 */
const BROWSER_KEY = 'acc-dev-doc';

const browserFallback = {
  data: {
    load: async () => ({
      status: 'ok',
      text: localStorage.getItem(BROWSER_KEY) || null,
      meta: { path: '(browser localStorage)', readOnly: false, browserFallback: true },
    }),
    save: async (text) => {
      localStorage.setItem(BROWSER_KEY, text);
      return { ok: true };
    },
    flush: async () => ({ ok: true }),
    probeLocation: async (dirPath) => ({ dirPath, writable: true, synced: false }),
    suggestLocations: async () => [
      { id: 'documents', label: 'Documents', dirPath: 'C:\\Users\\you\\Documents', synced: false },
    ],
    pickFolder: async () => ({ canceled: true }),
    chooseLocation: async (dirPath) => ({ ok: true, dirPath }),
    revealFolder: async () => ({ ok: false, reason: 'browser' }),
    listBackups: async () => [],
    restoreBackup: async () => ({ ok: false, reason: 'browser' }),
    exportBackup: async () => ({ ok: false, reason: 'browser' }),
    onStatus: () => () => {},
    onExternalChange: () => () => {},
  },
  pdf: {
    export: async () => ({ ok: false, reason: 'Saving a PDF requires the desktop app.' }),
    // Falls back to the browser's own print, which is fine for building the UI
    // but brings Chromium's title-and-URL header with it. The desktop path
    // replaces that; see electron/pdf-export.js.
    print: async () => {
      window.print();
      return { ok: true, browserFallback: true };
    },
    reveal: async () => ({ ok: false, reason: 'browser' }),
  },
  app: {
    getInfo: async () => ({ version: 'dev', packaged: false, platform: 'browser' }),
    // A browser tab cannot close itself unless it opened itself, so this is a
    // no-op in preview rather than a broken-looking action.
    quit: async () => ({ ok: false, reason: 'browser' }),
    onBeforeQuit: () => () => {},
  },
};

const api = native || browserFallback;

export const dataBridge = api.data;
export const pdfBridge = api.pdf;
export const appBridge = api.app;

export default api;
