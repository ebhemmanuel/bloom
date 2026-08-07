'use strict';

/**
 * Where data.json lives, and how we decide.
 *
 * Two hard rules:
 *
 * 1. NEVER beside the .exe. The portable build unpacks to a random %TEMP%
 *    directory and runs from there - verified empirically, the unpack path shows
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
/**
 * The folder the record is kept in, named for the app the teacher sees.
 *
 * Only ever used to BUILD a suggestion. Anyone already set up is found through
 * the pointer, which holds an absolute path, so renaming this leaves existing
 * folders exactly where they are rather than losing them.
 */
const FOLDER_NAME = 'Bloom';
const PROBE_FILENAME = '.acc-write-test';

/**
 * Cloud-sync providers we refuse to default into.
 *
 * This matters far more than it looks. On a school Microsoft 365 tenant,
 * Known Folder Redirection points Documents at OneDrive BY DEFAULT. A teacher
 * who accepts a Documents default would silently sync student names, plan types,
 * and disability accommodations to the cloud - breaking the one promise the
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

  // UNC path - a network share is off-machine by definition.
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
    return {
      dirPath,
      valid: false,
      writable: false,
      synced: false,
      provider: null,
      reason: 'EMPTY',
    };
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
 * Where OneDrive actually is on this machine, if it is here at all.
 *
 * The installer sets these, and reading them is the only reliable way to find
 * the business folder - it is named for the tenant ("OneDrive - Northside ISD"),
 * so there is no fixed path to guess at.
 */
function oneDriveDir(env = process.env) {
  return env.OneDriveCommercial || env.OneDrive || env.OneDriveConsumer || null;
}

/**
 * Candidate folders to offer, best first.
 *
 * The CLOUD folder is offered first, and that is a deliberate reversal.
 *
 * It used to lead with a local-only folder, because a synced folder copies
 * student information off the machine and that runs against the offline promise
 * the rest of the app is built on. What changed is the failure we actually see:
 * district laptops get reimaged when they slow down, and a reimage takes
 * %LOCALAPPDATA% with it. Losing the year's record is a worse outcome for the
 * teacher, and for the student it documents, than that record sitting in the
 * district's own Microsoft tenant - which is where the IEP itself already lives.
 *
 * The app still never touches the network. Windows syncs the folder; we write a
 * file. The advisory on the option says plainly what that means, and the
 * local-only choice is right underneath for anyone whose district says no.
 *
 * Naming matters as much as ordering. This used to say "Documents" with a
 * warning underneath, which reads as a scolding for picking the obvious thing.
 * When the folder is redirected, the option is NAMED OneDrive, because that is
 * what it is and a teacher who recognises the name is not being surprised by it.
 *
 * The path shown on each option is the REAL one, built here from `os.homedir()`
 * and the OneDrive environment variables, so it carries the account actually
 * signed in to this machine. Nothing about it is a placeholder or a sample.
 */
function suggestLocations(app, env = process.env) {
  const localAppData = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const documents = safeGetPath(app, 'documents') || os.homedir();
  const documentsProbe = detectSync(documents);

  /*
    Two ways to end up with a cloud folder, in order of how sure we are:
    Documents is already redirected into one, or OneDrive is installed and
    Documents is not. Both land on the same option.
  */
  const oneDrive = oneDriveDir(env);
  const cloudBase = documentsProbe.synced ? documents : oneDrive;
  const cloudProvider = documentsProbe.synced ? documentsProbe.provider : 'OneDrive';

  const candidates = [];

  if (cloudBase) {
    candidates.push({
      id: 'cloud',
      kind: 'cloud',
      label: cloudProvider,
      hint: 'Backed up automatically. If this computer is replaced or reimaged, your records come back with your account.',
      recommended: true,
      dirPath: path.join(cloudBase, FOLDER_NAME),
    });
  }

  candidates.push({
    id: 'local',
    kind: 'local',
    label: 'This computer only',
    hint: 'Nothing ever leaves this machine. Back it up yourself, because a reimage would take it with it.',
    recommended: candidates.length === 0,
    dirPath: path.join(localAppData, FOLDER_NAME),
  });

  /*
    Documents still gets a place when it is NOT redirected, because it is the
    folder a teacher can find without being told where to look. Dropped when it
    is redirected, since it would be the cloud option again under a second name.
  */
  if (!documentsProbe.synced) {
    candidates.push({
      id: 'documents',
      kind: 'local',
      label: 'Documents',
      hint: 'Easy to find and back up yourself.',
      dirPath: path.join(documents, FOLDER_NAME),
    });
  }

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
 *   4. nothing - onboarding has not run
 *
 * Returns a status the renderer can act on. Critically, when the pointer names a
 * folder that has since disappeared (re-imaged machine, a Documents folder that
 * only existed on a since-removed drive) we return 'missing' rather than
 * silently starting fresh - an empty record is indistinguishable from data loss,
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
  oneDriveDir,
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
