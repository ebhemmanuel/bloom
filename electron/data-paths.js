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
function candidateLocations(app, env = process.env) {
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

  return candidates;
}

/**
 * The candidates, probed. Probing CREATES the folder (it has to, to test that
 * it can write there), so this is for the location step, where the teacher is
 * about to pick one - not for a quiet look at launch. See discoverExistingRecord.
 */
function suggestLocations(app, env = process.env) {
  return candidateLocations(app, env).map((c) => ({ ...c, ...probeLocation(c.dirPath) }));
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

/**
 * The userData folder this app had before it was called Bloom.
 *
 * Renaming productName moved userData from here to %APPDATA%\Bloom, and the
 * pointer file did not move with it. Every teacher who set up on the old name
 * launched the new one, found no pointer, and was shown onboarding - which then
 * wrote a fresh record over the one their pointer had been naming. This is the
 * folder that pointer is still sitting in.
 */
const LEGACY_USERDATA_NAME = 'Accommodations Tracker';

/**
 * Only the packaged, production identity looks in the legacy folder.
 *
 * Dev runs use `bloom-dev` (see main.js) precisely so they can never touch a
 * teacher's live file - and the developer's own machine is the one most likely
 * to still hold a real legacy pointer. Keyed on the folder name rather than on
 * `app.isPackaged` so it holds under the test double as well.
 */
function isProductionIdentity(app) {
  try {
    return path.basename(app.getPath('userData')) === 'Bloom';
  } catch {
    return false;
  }
}

function parsePointerFile(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed.dirPath === 'string' && parsed.dirPath.length > 0) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * The pointer, adopting the legacy one when the current one is missing.
 *
 * Adoption WRITES the new pointer and LEAVES the old file where it is. Writing
 * means the next launch is ordinary; leaving means nothing about the old
 * install is destroyed, so if this ever adopts wrongly there is still a record
 * of what it read. The old pointer's own dirPath has to exist for it to count -
 * a legacy pointer at a folder that has since gone is exactly the 'missing'
 * case resolveDataDir already handles, and it must not be turned into
 * 'unconfigured' by being ignored here.
 */
function readPointer(app) {
  const current = parsePointerFile(pointerPath(app));
  if (current) return current;

  if (!isProductionIdentity(app)) return null;

  let legacyFile;
  try {
    legacyFile = path.join(app.getPath('appData'), LEGACY_USERDATA_NAME, POINTER_FILENAME);
  } catch {
    return null;
  }

  const legacy = parsePointerFile(legacyFile);
  if (!legacy) return null;
  if (!fs.existsSync(path.resolve(legacy.dirPath))) {
    // Still return it: 'missing' is the right answer, and only the pointer's
    // dirPath can produce it.
    return legacy;
  }

  try {
    return writePointer(app, legacy.dirPath, {
      synced: legacy.synced,
      provider: legacy.provider,
      adoptedFrom: legacyFile,
    });
  } catch {
    // Could not write the new pointer, but the old one still names a real
    // folder. Use it for this launch; the write is retried next time.
    return legacy;
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
 * No pointer, but a record sitting where we would have put one: open it.
 *
 * The pointer can go missing for reasons that have nothing to do with the
 * record - the app was renamed, %APPDATA% was cleared, the machine was
 * reimaged with Documents on OneDrive - and every one of those used to land the
 * teacher in onboarding, in front of a form asking who they are, with a year of
 * their work one folder away. Now the standard folders are checked first, and
 * if exactly one holds a data.json, that is their record and it is adopted.
 *
 * EXACTLY one. Two records in two folders is a question, and the location step
 * is where it gets asked (and, since it now adopts rather than overwrites,
 * where it gets answered safely). Only under the production identity: a dev run
 * must never wander into a live folder, see the guard on readPointer.
 */
function discoverExistingRecord(app, env = process.env) {
  if (!isProductionIdentity(app)) return null;

  /*
    A stat, not a probe. probeLocation creates the folder to test writability,
    and this runs on every launch that has no pointer - a fresh install would
    grow an empty Bloom folder in Documents, LocalAppData and OneDrive before
    the teacher had chosen anything. Looking must not leave marks.
  */
  let found;
  try {
    found = candidateLocations(app, env).filter((c) => {
      try {
        return fs.statSync(path.join(c.dirPath, DATA_FILENAME)).isFile();
      } catch {
        return false;
      }
    });
  } catch {
    return null;
  }
  if (found.length !== 1) return null;

  const dirPath = found[0].dirPath;
  const sync = detectSync(dirPath);
  try {
    return writePointer(app, dirPath, {
      synced: sync.synced,
      provider: sync.provider,
      discovered: true,
    });
  } catch {
    // Could not write the pointer; still open the record this launch.
    return { dirPath };
  }
}

/**
 * Resolve where to read and write, in priority order:
 *   1. --data-dir <path>                 (support / testing escape hatch)
 *   2. ACCOMMODATIONS_DATA_DIR env var
 *   3. the pointer file written at onboarding (or the old app's, adopted)
 *   4. a record found in one of the standard folders, adopted
 *   5. nothing - onboarding has not run
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
    const discovered = discoverExistingRecord(app);
    if (discovered) {
      return {
        status: 'ok',
        dirPath: path.resolve(discovered.dirPath),
        source: 'discovered',
        pointer: discovered,
      };
    }
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
  candidateLocations,
  suggestLocations,
  pointerPath,
  readPointer,
  writePointer,
  clearPointer,
  parseDataDirArg,
  discoverExistingRecord,
  resolveDataDir,
  dataFilePath,
  backupDirPath,
};
