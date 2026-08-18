import capacitorApi from './platform/capacitor.js';

/**
 * The one seam between the app and the machine it is running on.
 *
 * Every renderer module talks through this file rather than touching
 * `window.accommodations` directly, which gives us three things: a single place
 * to stub the whole surface for `npm run dev` in a plain browser, one seam to
 * mock in tests, and - now - one place where a second platform plugs in.
 *
 * Three implementations, one contract:
 *
 *   - Electron, through the preload bridge. `electron/data-store.js`.
 *   - iPad, through Capacitor. `platform/capacitor.js`.
 *   - A plain browser tab, localStorage, for building UI. Below.
 *
 * Nothing above this file branches on platform. Where a platform genuinely
 * cannot do something - choose a folder, save a PDF to a path - its
 * implementation says so in the return value rather than throwing, and the UI
 * reads that.
 */

const native = typeof window !== 'undefined' ? window.accommodations : undefined;

/**
 * Capacitor injects `window.Capacitor` into the webview before any of our code
 * runs, so this is answerable synchronously - which matters, because the whole
 * app imports `dataBridge` at module scope.
 */
const isNativeShell =
  typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());

/** True when running inside Electron with the preload bridge attached. */
export const isDesktop = Boolean(native);

/** True on the iPad build. */
export const isNativeMobile = isNativeShell;

/**
 * Browser fallback for `npm run dev`. Persists to localStorage so the board is
 * usable in a normal browser tab while building UI, without pretending to be the
 * real store - `meta.browserFallback` is surfaced as a banner so nobody mistakes
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
    /*
      Shaped like the real thing so the chooser can be built in a browser tab:
      the cloud folder first, local second. See electron/data-paths.js.

      The paths are a STAND-IN and are the one thing here that is not real: a
      browser tab has no filesystem and no account to read. Off this fallback,
      in Electron, they are built from os.homedir() and the OneDrive environment
      variables, so the screen shows the folder under the teacher's own Windows
      account. Written as an ordinary-looking path rather than a `<you>` token,
      because a bracketed placeholder in a screenshot reads as the app having
      failed to find the real one.
    */
    suggestLocations: async () => [
      {
        id: 'cloud',
        kind: 'cloud',
        label: 'OneDrive',
        hint: 'Backed up automatically. If this computer is replaced or reimaged, your records come back with your account.',
        recommended: true,
        dirPath: 'C:\\Users\\teacher\\OneDrive\\Bloom',
        synced: true,
        provider: 'OneDrive',
        writable: true,
      },
      {
        id: 'local',
        kind: 'local',
        label: 'This computer only',
        hint: 'Nothing ever leaves this machine. Back it up yourself, because a reimage would take it with it.',
        dirPath: 'C:\\Users\\teacher\\AppData\\Local\\Bloom',
        synced: false,
        writable: true,
      },
    ],
    pickFolder: async () => ({ canceled: true }),
    chooseLocation: async (dirPath) => ({ ok: true, dirPath }),
    relocate: async (dirPath) => ({ ok: true, dirPath }),
    revealFolder: async () => ({ ok: false, reason: 'browser' }),
    listBackups: async () => [],
    restoreBackup: async () => ({ ok: false, reason: 'browser' }),
    importRecord: async () => ({ ok: false, reason: 'browser' }),
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
  // Nothing to check in a browser tab: there is no exe to replace, and the
  // answer is always "you are running the dev server".
  updates: {
    check: async () => ({ ok: false, reason: 'browser' }),
    setPrefs: async () => ({ ok: true }),
    open: async () => ({ ok: false, reason: 'browser' }),
    onAvailable: () => () => {},
  },

  // Unlicensed in a browser tab, which is the honest answer: the gate belongs
  // to the desktop build, and pretending otherwise would hide it while building.
  licence: {
    get: async () => null,
    set: async () => ({ ok: false, reason: 'browser' }),
  },

  app: {
    getInfo: async () => ({ version: 'dev', packaged: false, platform: 'browser' }),
    // A browser tab cannot close itself unless it opened itself, so this is a
    // no-op in preview rather than a broken-looking action.
    quit: async () => ({ ok: false, reason: 'browser' }),
    onBeforeQuit: () => () => {},
  },
};

const api = native || (isNativeShell ? capacitorApi : browserFallback);

export const dataBridge = api.data;
export const pdfBridge = api.pdf;
export const appBridge = api.app;
/** The one outbound surface. Receive-only: see electron/updates.js. */
export const updateBridge = api.updates;
/** Verified locally against a compiled-in public key. Never leaves the machine. */
export const licenceBridge = api.licence;

export default api;
