'use strict';

/**
 * Where data.json lives, and how we decide.
 *
 * Two hard rules:
 *
 * 1. NEVER beside the .exe. The portable build unpacks to a random %TEMP%
 *    directory and runs from there — verified empirically, the unpack path shows
 *    up in app.log. `process.execPath` therefore points at the temp dir, not at
 *    the folder the teacher sees. Beyond that, the USB stick is a delivery
 *    vehicle for the app only: the record is born on the teacher's machine and
 *    stays there, so copying the app folder never carries student data with it.
 *
 * 2. The POINTER lives in userData, not with the app. `%APPDATA%\...\location.json`
 *    is on the local machine and scoped per Windows account, so it is inherently
 *    per-teacher on a shared computer and cannot travel on the stick.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DATA_FILENAME = 'data.json';
const POINTER_FILENAME = 'location.json';
const FOLDER_NAME = 'Accommodations Tracker';
const PROBE_FILENAME = '.acc-write-test';

/**
 * Cloud-sync providers we refuse to default into.
 *
 * This matters far more than it looks. On a school Microsoft 365 tenant,
 * Known Folder Redirection points Documents at OneDrive BY DEFAULT. A teacher
 * who accepts a Documents default would silently sync student names, plan types,
 * and disability accommodations to the cloud — breaking the one promise the
 * product is built on. Detecting this is the highest-value check in the app.
 */
const SYNC_PATTERNS = [
  { id: 'onedrive', label: 'OneDrive', re: /[\\/]OneDrive([\\/]|$|\s-\s)/i },
  { id: 'dropbox', label: 'Dropbox', re: /[\\/]Dropbox([\\/]|$)/i },
  { id: 'googledrive', label: 'Google Drive', re: /[\\/]Google Drive([\\/]|$)/i },
  { id: 'gdrive-stream', label: 'Google Drive', re: /[\\/]My Drive([\\/]|$)/i },
  { id: 'icloud', label: 'iCloud Drive', re: /[\\/]iCloudDrive([\\/]|$)/i },
  { id: 'box', label: 'Box', re: /[\\/]Box([\\/]|$)/i },
];

/**
 * Detect a cloud-synced or network path.
 * Pure and exported so it can be unit-tested without touching a filesystem.
 */
function detectSync(dirPath) {
  if (typeof dirPath !== 'string' || dirPath.length === 0) {
    return { synced: false, provider: null, network: false };
  }

  // UNC path — a network share is off-machine by definition.
  const network = /^\\\\/.test(dirPath) || /^\/\//.test(dirPath);

  for (const p of SYNC_PATTERNS) {
    if (p.re.test(dirPath)) {
      return { synced: true, provider: p.label, network };
    }
  }
  return { synced: network, provider: network ? 'a network share' : null, network };
}

/** Can we actually create and delete a file here? */
function probeWritable(dirPath) {
  const probe = path.join(dirPath, PROBE_FILENAME);
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.unlinkSync(probe);
    return { writable: true, reason: null };
  } catch (err) {
    return { writable: false, reason: err.code || String(err.message || err) };
  }
}

/**
 * Full assessment of a candidate folder, for the onboarding DataLocation step.
 */
function probeLocation(dirPath) {
  if (typeof dirPath !== 'string' || dirPath.trim().length === 0) {
    return { dirPath, valid: false, writable: false, synced: false, provider: null, reason: 'EMPTY' };
  }

  const resolved = path.resolve(dirPath);
  const sync = detectSync(resolved);
  const write = probeWritable(resolved);
  const dataFile = path.join(resolved, DATA_FILENAME);

  let existingFile = false;
  try {
    existingFile = fs.statSync(dataFile).isFile();
  } catch {
    existingFile = false;
  }

  return {
    dirPath: resolved,
    dataFile,
    valid: write.writable,
    writable: write.writable,
    reason: write.reason,
    synced: sync.synced,
    provider: sync.provider,
    network: sync.network,
    existingFile,
  };
}

/**
 * Candidate folders to offer at onboarding, best first.
 *
 * `documents` is the familiar, discoverable choice a teacher can back up
 * themselves — but it is offered SECOND and carries its probe result, because on
 * a district machine it is very often redirected into OneDrive.
 */
function suggestLocations(app) {
  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

  const candidates = [
    {
      id: 'local',
      label: 'This computer only',
      hint: 'Never syncs anywhere. Recommended.',
      dirPath: path.join(localAppData, FOLDER_NAME),
    },
    {
      id: 'documents',
      label: 'Documents',
      hint: 'Easy to find and back up yourself.',
      dirPath: path.join(safeGetPath(app, 'documents') || os.homedir(), FOLDER_NAME),
    },
  ];

  return candidates.map((c) => ({ ...c, ...probeLocation(c.dirPath) }));
}

function safeGetPath(app, name) {
  try {
    return app.getPath(name);
  } catch {
    return null;
  }
}

// --- Pointer file ----------------------------------------------------------

function pointerPath(app) {
  return path.join(app.getPath('userData'), POINTER_FILENAME);
}

function readPointer(app) {
  try {
    const raw = fs.readFileSync(pointerPath(app), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.dirPath === 'string' && parsed.dirPath.length > 0) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writePointer(app, dirPath, extra = {}) {
  const target = pointerPath(app);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const payload = {
    dirPath: path.resolve(dirPath),
    chosenAt: new Date().toISOString(),
    ...extra,
  };
  fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

function clearPointer(app) {
  try {
    fs.unlinkSync(pointerPath(app));
  } catch {
    /* already gone */
  }
}

// --- Resolution ------------------------------------------------------------

function parseDataDirArg(argv = process.argv) {
  const i = argv.indexOf('--data-dir');
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  const inline = argv.find((a) => a.startsWith('--data-dir='));
  return inline ? inline.slice('--data-dir='.length) : null;
}

/**
 * Resolve where to read and write, in priority order:
 *   1. --data-dir <path>                 (support / testing escape hatch)
 *   2. ACCOMMODATIONS_DATA_DIR env var
 *   3. the pointer file written at onboarding
 *   4. nothing — onboarding has not run
 *
 * Returns a status the renderer can act on. Critically, when the pointer names a
 * folder that has since disappeared (re-imaged machine, a Documents folder that
 * only existed on a since-removed drive) we return 'missing' rather than
 * silently starting fresh — an empty record is indistinguishable from data loss,
 * and a teacher must be given the chance to go find their file.
 */
function resolveDataDir(app, argv = process.argv) {
  const override = parseDataDirArg(argv) || process.env.ACCOMMODATIONS_DATA_DIR || null;
  if (override) {
    return { status: 'ok', dirPath: path.resolve(override), source: 'override' };
  }

  const pointer = readPointer(app);
  if (!pointer) {
    return { status: 'unconfigured', dirPath: null, source: null };
  }

  const dirPath = path.resolve(pointer.dirPath);
  if (!fs.existsSync(dirPath)) {
    return { status: 'missing', dirPath, source: 'pointer' };
  }

  return { status: 'ok', dirPath, source: 'pointer', pointer };
}

const dataFilePath = (dirPath) => path.join(dirPath, DATA_FILENAME);
const backupDirPath = (dirPath) => path.join(dirPath, 'backups');

module.exports = {
  DATA_FILENAME,
  POINTER_FILENAME,
  FOLDER_NAME,
  detectSync,
  probeWritable,
  probeLocation,
  suggestLocations,
  pointerPath,
  readPointer,
  writePointer,
  clearPointer,
  parseDataDirArg,
  resolveDataDir,
  dataFilePath,
  backupDirPath,
};
