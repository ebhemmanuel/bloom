import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { App } from '@capacitor/app';
import { Share } from '@capacitor/share';

/**
 * The iPad's data store, standing in for `electron/data-store.js`.
 *
 * Same contract as the preload bridge - see `src/lib/bridge.js` - so nothing
 * above this file knows which machine it is running on. What differs is only
 * what the platform can honestly offer:
 *
 *   - There is no folder to choose. An iOS app writes inside its own container
 *     and nowhere else, so `load` reports `ok` rather than `unconfigured` and
 *     setup skips the location question entirely.
 *   - There is no main process, so the debounce that lives in main on the
 *     desktop lives here.
 *   - There is no "save as PDF" dialog. Printing goes through the system print
 *     panel, which can also save to Files.
 *
 * WHY `LibraryNoCloud` AND NOT `Documents`:
 *
 * iOS backs the Documents directory up to iCloud by default. This file holds
 * student names and disability-plan references, and the whole product promise
 * is that it never leaves the machine - the same reason the desktop build goes
 * out of its way to detect OneDrive redirection before writing a byte. The
 * Library/NoCloud directory is excluded from iCloud backup by the system, which
 * is the only iOS location that keeps that promise without asking the teacher
 * to understand it.
 *
 * The cost is real and has to be said out loud in the UI: nothing here survives
 * deleting the app, so the export is the backup, not iCloud.
 */

const ROOT = 'bloom';
const FILE = `${ROOT}/data.json`;
const TMP = `${ROOT}/data.json.tmp`;
const BACKUP_DIR = `${ROOT}/backups`;
const DIR = Directory.LibraryNoCloud;

/** Matches the desktop's 400ms trailing debounce and 3s ceiling. */
const DEBOUNCE_MS = 400;
const MAX_WAIT_MS = 3000;

/** Last 10 rolling, as on the desktop. */
const KEEP_BACKUPS = 10;

const listeners = { status: new Set(), external: new Set() };

const emit = (payload) => {
  for (const fn of listeners.status) fn(payload);
};

const subscribe = (set, fn) => {
  set.add(fn);
  return () => set.delete(fn);
};

async function ensureDirs() {
  for (const path of [ROOT, BACKUP_DIR]) {
    try {
      await Filesystem.mkdir({ path, directory: DIR, recursive: true });
    } catch (err) {
      // Already there is the expected case, and the plugin reports it as an
      // error rather than a no-op.
      if (!/exist/i.test(String(err?.message))) throw err;
    }
  }
}

async function readIfPresent(path) {
  try {
    const { data } = await Filesystem.readFile({ path, directory: DIR, encoding: Encoding.UTF8 });
    return typeof data === 'string' ? data : null;
  } catch {
    return null;
  }
}

/**
 * A local timestamp for a backup name.
 *
 * Local, deliberately: `toISOString` is UTC, and a backup stamped with
 * tomorrow's date is the same class of lie the date-key rule exists to prevent.
 */
function stamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  );
}

async function rotateBackups() {
  try {
    const { files } = await Filesystem.readdir({ path: BACKUP_DIR, directory: DIR });
    const mine = files
      .map((f) => (typeof f === 'string' ? f : f.name))
      .filter((n) => n.startsWith('data-') && n.endsWith('.json'))
      .sort();

    for (const name of mine.slice(0, Math.max(0, mine.length - KEEP_BACKUPS))) {
      await Filesystem.deleteFile({ path: `${BACKUP_DIR}/${name}`, directory: DIR });
    }
  } catch {
    // A backup that cannot be rotated is not a reason to fail the save.
  }
}

/**
 * Write, atomically as far as the platform allows.
 *
 * Same order as the desktop: back the current file up, write a temp beside it,
 * then rename over the target. A crash between the write and the rename leaves
 * `data.json` whole and `data.json.tmp` recoverable, which is what `load` looks
 * for before it gives up.
 */
async function writeNow(text) {
  emit({ state: 'saving' });
  try {
    await ensureDirs();

    const current = await readIfPresent(FILE);
    if (current) {
      await Filesystem.writeFile({
        path: `${BACKUP_DIR}/data-${stamp()}.json`,
        directory: DIR,
        data: current,
        encoding: Encoding.UTF8,
      });
      await rotateBackups();
    }

    await Filesystem.writeFile({
      path: TMP,
      directory: DIR,
      data: text,
      encoding: Encoding.UTF8,
    });
    await Filesystem.rename({ from: TMP, to: FILE, directory: DIR, toDirectory: DIR });

    emit({ state: 'saved', at: Date.now() });
    return { ok: true };
  } catch (err) {
    emit({ state: 'error', reason: err?.message || 'write-failed' });
    return { ok: false, reason: err?.message || 'write-failed' };
  }
}

/**
 * The debounce, held here because there is no main process to hold it.
 *
 * A trailing wait with a ceiling: typing into a notes field should not write on
 * every keystroke, and a long unbroken run of edits should still reach the disk
 * within three seconds. iOS can suspend an app without warning, so the ceiling
 * matters more here than it does on a desktop.
 */
let pending = null;
let timer = null;
let firstQueuedAt = 0;

function schedule() {
  if (timer) clearTimeout(timer);
  const waited = Date.now() - firstQueuedAt;
  const delay = Math.max(0, Math.min(DEBOUNCE_MS, MAX_WAIT_MS - waited));
  timer = setTimeout(flushNow, delay);
}

async function flushNow() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (pending === null) return { ok: true };
  const text = pending;
  pending = null;
  firstQueuedAt = 0;
  return writeNow(text);
}

/*
  Backgrounding is this platform's "laptop lid closing", and iOS is far quicker
  to kill a backgrounded app than a desktop is to kill a window.

  Registered from `load` rather than at module scope: this file is in the bundle
  on every platform, and importing it must not attach a native listener on a
  machine that has no native to attach to.
*/
let lifecycleBound = false;

function bindLifecycle() {
  if (lifecycleBound) return;
  lifecycleBound = true;
  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) flushNow();
  }).catch(() => {});
}

const data = {
  load: async () => {
    bindLifecycle();
    await ensureDirs();

    let text = await readIfPresent(FILE);
    let recovered = false;

    /*
      Crash between the write and the rename. The temp file is the newer of the
      two and it parses or it does not - never overwrite the good file with it
      silently, but do offer it rather than reporting an empty record, because
      an empty record is indistinguishable from data loss.
    */
    if (!text) {
      const tmp = await readIfPresent(TMP);
      if (tmp) {
        try {
          JSON.parse(tmp);
          text = tmp;
          recovered = true;
        } catch {
          text = null;
        }
      }
    }

    return {
      status: 'ok',
      text,
      meta: {
        path: 'On this iPad, in the app’s private storage',
        readOnly: false,
        recovered,
        // Not a folder anybody can browse to, and not backed up to iCloud. The
        // UI needs to be able to say so.
        sandboxed: true,
      },
    };
  },

  save: async (text) => {
    pending = text;
    if (!firstQueuedAt) firstQueuedAt = Date.now();
    schedule();
    return { ok: true };
  },

  flush: async () => flushNow(),

  // There is no folder to probe, pick, choose or reveal: the container is the
  // only place this app may write. Answered honestly rather than pretended.
  probeLocation: async () => ({ dirPath: FILE, writable: true, synced: false }),
  suggestLocations: async () => [],
  pickFolder: async () => ({ canceled: true, reason: 'sandboxed' }),
  chooseLocation: async () => ({ ok: true, dirPath: FILE }),
  relocate: async () => ({ ok: false, reason: 'sandboxed' }),
  revealFolder: async () => ({ ok: false, reason: 'sandboxed' }),

  listBackups: async () => {
    try {
      const { files } = await Filesystem.readdir({ path: BACKUP_DIR, directory: DIR });
      return files
        .map((f) => (typeof f === 'string' ? { name: f } : f))
        .filter((f) => f.name.startsWith('data-'))
        .map((f) => ({ name: f.name, path: `${BACKUP_DIR}/${f.name}`, size: f.size ?? null }))
        .sort((a, b) => b.name.localeCompare(a.name));
    } catch {
      return [];
    }
  },

  restoreBackup: async (path) => {
    const text = await readIfPresent(path);
    if (!text) return { ok: false, reason: 'unreadable' };
    return { ok: true, text };
  },

  /**
   * The export IS the backup on this platform.
   *
   * Nothing in the app's container survives deleting the app, and it is not in
   * iCloud on purpose, so handing the file to the system share sheet - Files,
   * AirDrop, a school-approved destination - is the only route off the device
   * the teacher controls.
   */
  exportBackup: async () => {
    const text = await readIfPresent(FILE);
    if (!text) return { ok: false, reason: 'nothing-to-export' };

    const name = `bloom-backup-${stamp()}.json`;
    await Filesystem.writeFile({
      path: name,
      directory: Directory.Cache,
      data: text,
      encoding: Encoding.UTF8,
    });
    const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });

    await Share.share({ title: 'Bloom backup', url: uri });
    return { ok: true, path: uri };
  },

  onStatus: (fn) => subscribe(listeners.status, fn),
  // Nothing else can reach the container, so there is no external writer to
  // watch for. The subscription exists so callers do not have to branch.
  onExternalChange: (fn) => subscribe(listeners.external, fn),
};

const pdf = {
  export: async () => ({
    ok: false,
    reason: 'Use Print, then “Save to Files” in the print panel.',
  }),
  print: async () => {
    window.print();
    return { ok: true };
  },
  reveal: async () => ({ ok: false, reason: 'sandboxed' }),
};

const app = {
  getInfo: async () => {
    const info = await App.getInfo().catch(() => null);
    return {
      version: info?.version || 'ios',
      packaged: true,
      platform: 'ios',
    };
  },
  // iOS has no "quit": an app that closes itself reads as a crash, and Apple
  // rejects builds that do it.
  quit: async () => ({ ok: false, reason: 'ios' }),
  onBeforeQuit: () => () => {},
};

/**
 * No self-checking on iPad. The App Store is the update mechanism there, and a
 * second one inside the app would be both redundant and grounds for rejection.
 */
const updates = {
  check: async () => ({ ok: false, reason: 'ios' }),
  setPrefs: async () => ({ ok: true }),
  open: async () => ({ ok: false, reason: 'ios' }),
  onAvailable: () => () => {},
};

export default { data, pdf, app, updates };
