'use strict';

/**
 * Byte-level persistence for data.json.
 *
 * Deliberate split of responsibility: this module handles PATHS, ATOMICITY,
 * BACKUPS and RECOVERY. It does not know the schema. Parsing, migration and
 * normalisation happen in the renderer's pure domain layer (`src/domain`), which
 * is ESM and exhaustively tested. Main only ever asks "is this valid JSON?" —
 * a byte-level question — and otherwise moves text around safely.
 *
 * That split is what keeps this file small enough to reason about, and keeps the
 * schema logic in the layer that can be unit-tested without an Electron process.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { dataFilePath, backupDirPath } = require('./data-paths');

const TMP_SUFFIX = '.tmp';
const DEBOUNCE_MS = 400;
const MAX_WAIT_MS = 3000;

/**
 * Rename backoff, in milliseconds, one entry per attempt.
 *
 * Escalating rather than flat: Defender's post-write scan on a small file
 * usually clears in well under 100ms, but an on-access scanner mid-signature-
 * update can hold a handle for the better part of a second. A flat 3 × 60ms
 * covered the first case and shipped as "it randomly doesn't save" for the
 * second. Total spend here is ~1.2s, and only on a machine that is already
 * failing.
 */
const RENAME_BACKOFF_MS = [25, 50, 100, 200, 400];

/**
 * How long the exit flush may block, in total.
 *
 * Windows gives a process being shut down roughly a second or two before it
 * kills it, so a longer budget does not buy more durability — it just means the
 * recovery file never gets written either. Bounded by wall clock rather than by
 * attempt count, because the rename retries inside each attempt already vary.
 */
const EXIT_BUDGET_MS = 1600;

/**
 * Backoff between whole retry passes, when an entire write failed.
 *
 * Runs on a timer, not a spin, so the app stays responsive while it keeps
 * trying. Caps at 5s and then repeats forever — a save is never abandoned.
 */
const RETRY_BACKOFF_MS = [200, 500, 1000, 2000, 5000];

const KEEP_ROLLING = 10;
const KEEP_DAILY_DAYS = 30;

const pad = (n) => String(n).padStart(2, '0');

function backupStamp(now = new Date()) {
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

const BACKUP_RE = /^data-(\d{8})-(\d{6})\.json$/;

/** Sleep without pulling in a dependency. Used only by the rename retry. */
function sleepSync(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    /* deliberately blocking: we are mid-write and must not yield */
  }
}

/**
 * Decide which backups to delete.
 *
 * Keeps the newest `KEEP_ROLLING` unconditionally, plus the newest file from
 * each of the last `KEEP_DAILY_DAYS` calendar days. Pure, so it is testable
 * without creating hundreds of files.
 *
 * @param {string[]} filenames
 * @returns {string[]} filenames safe to delete
 */
function selectBackupsToPrune(filenames, now = new Date()) {
  const parsed = filenames
    .map((name) => {
      const m = BACKUP_RE.exec(name);
      return m ? { name, day: m[1], key: `${m[1]}${m[2]}` } : null;
    })
    .filter(Boolean)
    // Newest first.
    .sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));

  const keep = new Set();

  parsed.slice(0, KEEP_ROLLING).forEach((f) => keep.add(f.name));

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - KEEP_DAILY_DAYS);
  const cutoffDay = `${cutoff.getFullYear()}${pad(cutoff.getMonth() + 1)}${pad(cutoff.getDate())}`;

  const seenDays = new Set();
  for (const f of parsed) {
    if (f.day < cutoffDay) continue;
    if (seenDays.has(f.day)) continue;
    seenDays.add(f.day);
    keep.add(f.name);
  }

  return parsed.filter((f) => !keep.has(f.name)).map((f) => f.name);
}

function isValidJson(text) {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {{ dirPath: string, onStatus?: (payload: object) => void, log?: object }} options
 */
function createDataStore({ dirPath, onStatus = () => {}, log = console }) {
  const filePath = dataFilePath(dirPath);
  const tmpPath = filePath + TMP_SUFFIX;
  const backupDir = backupDirPath(dirPath);

  /** mtime observed at last read/write, for conflict detection. */
  let knownMtimeMs = null;
  let readOnly = false;

  // Held until the bytes are on disk, never merely until a write is attempted.
  let pendingText = null;
  let debounceTimer = null;
  let maxWaitTimer = null;
  let retryTimer = null;
  let retryAttempt = 0;

  // --- reading -------------------------------------------------------------

  function statMtime(p) {
    try {
      return fs.statSync(p).mtimeMs;
    } catch {
      return null;
    }
  }

  /**
   * Read the record, recovering if the primary file is unreadable.
   *
   * Recovery order matters. `.tmp` comes first because its existence means we
   * crashed between write and rename, so it is NEWER than data.json, not older.
   */
  function load() {
    if (!fs.existsSync(filePath)) {
      // A .tmp with no data.json means we died during the very first write.
      if (fs.existsSync(tmpPath) && isValidJson(safeRead(tmpPath))) {
        log.warn?.('[data-store] recovered from .tmp — no primary file present');
        const text = safeRead(tmpPath);
        return { status: 'recovered', text, from: tmpPath, meta: baseMeta() };
      }
      return { status: 'empty', text: null, meta: baseMeta() };
    }

    const text = safeRead(filePath);
    if (text !== null && isValidJson(text)) {
      knownMtimeMs = statMtime(filePath);
      return { status: 'ok', text, meta: baseMeta() };
    }

    // --- corrupt ------------------------------------------------------------
    // Preserve the evidence before doing anything else. Never overwrite a file
    // we failed to understand; a teacher's year may be recoverable from it by
    // hand even if we can't parse it.
    const quarantine = path.join(dirPath, `data.corrupt-${backupStamp()}.json`);
    try {
      fs.renameSync(filePath, quarantine);
      log.warn?.(`[data-store] quarantined unreadable file to ${quarantine}`);
    } catch (err) {
      log.error?.(`[data-store] could not quarantine corrupt file: ${err.message}`);
    }

    if (fs.existsSync(tmpPath) && isValidJson(safeRead(tmpPath))) {
      return {
        status: 'recovered',
        text: safeRead(tmpPath),
        from: tmpPath,
        quarantined: quarantine,
        meta: baseMeta(),
      };
    }

    const newest = newestValidBackup();
    if (newest) {
      return {
        status: 'recovered',
        text: safeRead(newest),
        from: newest,
        quarantined: quarantine,
        meta: baseMeta(),
      };
    }

    return { status: 'corrupt', text: null, quarantined: quarantine, meta: baseMeta() };
  }

  function safeRead(p) {
    try {
      return fs.readFileSync(p, 'utf8');
    } catch {
      return null;
    }
  }

  function newestValidBackup() {
    let names;
    try {
      names = fs.readdirSync(backupDir).filter((n) => BACKUP_RE.test(n));
    } catch {
      return null;
    }
    names.sort().reverse(); // filename sorts chronologically by construction
    for (const name of names) {
      const full = path.join(backupDir, name);
      if (isValidJson(safeRead(full))) return full;
    }
    return null;
  }

  function baseMeta() {
    return { path: filePath, dirPath, backupDir, readOnly };
  }

  // --- writing -------------------------------------------------------------

  /**
   * Atomic write.
   *
   * Steps 1-5 are ordinary. Step 6 is the one that matters in the field:
   * Defender and most district AV products briefly hold a handle on a
   * freshly-written file, so rename fails with EPERM. Without the retry this
   * ships as "the app randomly doesn't save" on exactly the machines it targets.
   */
  function writeNow(text) {
    if (readOnly) {
      onStatus({ state: 'readonly' });
      return { ok: false, reason: 'readonly' };
    }

    if (!isValidJson(text)) {
      // Refuse to write bytes we could not read back. A truncated write here
      // would be worse than not saving at all.
      log.error?.('[data-store] refused to write invalid JSON');
      onStatus({ state: 'error', reason: 'invalid-json' });
      return { ok: false, reason: 'invalid-json' };
    }

    // 1 — something else touched the file since we last read or wrote it.
    //
    // This used to refuse the write. That protected a foreign edit at the cost
    // of the teacher's own, which is the wrong trade for a single-user app: the
    // realistic causes are a sync client, a backup agent or AV rewriting the
    // file, and the outcome was autosave silently stalling for the rest of the
    // session. Now BOTH versions survive — the on-disk one is copied into
    // backups first, then ours is written — and saving continues to work.
    const currentMtime = statMtime(filePath);
    if (knownMtimeMs !== null && currentMtime !== null && currentMtime !== knownMtimeMs) {
      log.warn?.('[data-store] external modification detected; preserving it and continuing');
      try {
        fs.mkdirSync(backupDir, { recursive: true });
        fs.copyFileSync(filePath, path.join(backupDir, `data-external-${backupStamp()}.json`));
      } catch (err) {
        log.warn?.(`[data-store] could not preserve external copy: ${err.message}`);
      }
      onStatus({ state: 'conflict', path: filePath });
    }

    onStatus({ state: 'saving' });

    try {
      fs.mkdirSync(dirPath, { recursive: true });

      // 2 — back up the version we are about to replace
      if (fs.existsSync(filePath)) {
        try {
          fs.mkdirSync(backupDir, { recursive: true });
          fs.copyFileSync(filePath, path.join(backupDir, `data-${backupStamp()}.json`));
          pruneBackups();
        } catch (err) {
          // A failed backup must not block the save itself.
          log.warn?.(`[data-store] backup failed (continuing): ${err.message}`);
        }
      }

      // 3/4 — write and flush to the platter, in the SAME directory as the
      // target: rename is only atomic within a single volume.
      const fd = fs.openSync(tmpPath, 'w');
      try {
        fs.writeFileSync(fd, text, 'utf8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }

      // 5/6 — swap into place, retrying past transient AV locks
      let lastErr = null;
      for (let attempt = 0; attempt <= RENAME_BACKOFF_MS.length; attempt += 1) {
        try {
          fs.renameSync(tmpPath, filePath);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (err.code !== 'EPERM' && err.code !== 'EBUSY' && err.code !== 'EACCES') break;
          if (attempt < RENAME_BACKOFF_MS.length) sleepSync(RENAME_BACKOFF_MS[attempt]);
        }
      }
      if (lastErr) throw lastErr;

      knownMtimeMs = statMtime(filePath);
      onStatus({ state: 'saved', at: Date.now() });
      return { ok: true, path: filePath };
    } catch (err) {
      log.error?.(`[data-store] write failed: ${err.code || ''} ${err.message}`);
      onStatus({ state: 'error', reason: err.code || 'write-failed' });
      return { ok: false, reason: err.code || 'write-failed' };
    }
  }

  function pruneBackups() {
    try {
      const names = fs.readdirSync(backupDir);
      for (const name of selectBackupsToPrune(names)) {
        try {
          fs.unlinkSync(path.join(backupDir, name));
        } catch {
          /* best effort */
        }
      }
    } catch {
      /* no backup dir yet */
    }
  }

  // --- debounce ------------------------------------------------------------

  function clearTimers() {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (maxWaitTimer) clearTimeout(maxWaitTimer);
    debounceTimer = null;
    maxWaitTimer = null;
  }

  /**
   * Keep trying until it lands.
   *
   * A save that fails is not an event to report and move on from — the teacher's
   * edit is still only in memory, and the next thing to happen may well be the
   * lid closing. So a failed write keeps its payload and comes back for it, on
   * an escalating timer, forever. The only things that end the loop are success
   * or a newer save superseding the text (which starts its own loop).
   *
   * Backoff caps rather than gives up: an unplugged network drive or a locked
   * file can come back at any time, and when it does the edit is still here.
   */
  function scheduleRetry() {
    if (retryTimer || pendingText === null) return;
    const delay = RETRY_BACKOFF_MS[Math.min(retryAttempt, RETRY_BACKOFF_MS.length - 1)];
    retryAttempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      flush();
    }, delay);
    // Unref so a stuck retry can never hold the process open at quit.
    retryTimer.unref?.();
  }

  /**
   * Coalesce rapid edits. 400ms trailing, with a 3s ceiling so a teacher typing
   * continuously in the notes field still gets periodic durability.
   *
   * The short window is the real mitigation for the way this app actually dies:
   * a laptop lid closing mid-thought, or a machine being shut down by district
   * policy. Never rely on a clean quit.
   */
  function save(text) {
    pendingText = text;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, DEBOUNCE_MS);

    if (!maxWaitTimer) {
      maxWaitTimer = setTimeout(flush, MAX_WAIT_MS);
    }
    return { ok: true, queued: true };
  }

  /**
   * Write whatever is pending, and KEEP it pending until the write succeeds.
   *
   * The order here is the whole point. Clearing `pendingText` before the write
   * meant a single EPERM discarded the edit: the renderer had already moved on,
   * nothing was queued, and the change existed nowhere but in memory. The text
   * is now only released once it is on disk.
   */
  function flush() {
    clearTimers();
    if (pendingText === null) return { ok: true, noop: true };

    const text = pendingText;
    const result = writeNow(text);

    if (result.ok) {
      // Only drop it if nothing newer arrived while we were writing.
      if (pendingText === text) pendingText = null;
      retryAttempt = 0;
      return result;
    }

    // Read-only is not a failure to retry past — there is nowhere to write and
    // no amount of trying changes that. Everything else gets another go.
    if (result.reason === 'readonly') {
      pendingText = null;
      return result;
    }

    scheduleRetry();
    return result;
  }

  /**
   * The last chance. Called on quit, suspend and lock-screen.
   *
   * The timer-based retry above is useless here — the process is going away, so
   * anything not on disk within the next moment or two is gone. This therefore
   * blocks, retrying synchronously for up to ~2s, and if it still cannot write
   * to the real location it dumps the text somewhere it almost certainly can.
   * An awkwardly-named recovery file the teacher has to be told about is a bad
   * outcome; losing an afternoon of a compliance record is a much worse one.
   */
  function flushBlocking() {
    if (pendingText === null) return { ok: true, noop: true };

    const deadline = Date.now() + EXIT_BUDGET_MS;
    let result = flush();
    while (!result.ok && result.reason !== 'readonly' && Date.now() < deadline) {
      sleepSync(100);
      result = flush();
    }
    if (result.ok || result.reason === 'readonly') return result;

    const text = pendingText;
    if (text === null) return result;

    for (const dir of [dirPath, os.tmpdir()]) {
      try {
        const target = path.join(dir, `data.unsaved-${backupStamp()}.json`);
        fs.writeFileSync(target, text, 'utf8');
        log.error?.(`[data-store] could not save normally; wrote recovery copy to ${target}`);
        return { ok: false, reason: result?.reason || 'write-failed', recoveryPath: target };
      } catch {
        /* try the next location */
      }
    }

    log.error?.('[data-store] could not save, and could not write a recovery copy');
    return result;
  }

  const hasPendingWrite = () => pendingText !== null;

  function setReadOnly(value) {
    readOnly = Boolean(value);
    if (readOnly) {
      clearTimers();
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      pendingText = null;
    }
  }

  // --- backups (user-facing) ----------------------------------------------

  function listBackups() {
    try {
      return fs
        .readdirSync(backupDir)
        .filter((n) => BACKUP_RE.test(n))
        .sort()
        .reverse()
        .map((name) => {
          const full = path.join(backupDir, name);
          const m = BACKUP_RE.exec(name);
          const stat = fs.statSync(full);
          return {
            id: name,
            day: `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`,
            time: `${m[2].slice(0, 2)}:${m[2].slice(2, 4)}`,
            bytes: stat.size,
            valid: isValidJson(safeRead(full)),
          };
        });
    } catch {
      return [];
    }
  }

  /** Promote a backup to current. The displaced file is itself backed up first. */
  function restoreBackup(id) {
    if (!BACKUP_RE.test(id)) return { ok: false, reason: 'bad-id' };
    const source = path.join(backupDir, id);
    const text = safeRead(source);
    if (text === null || !isValidJson(text)) return { ok: false, reason: 'unreadable' };

    clearTimers();
    pendingText = null;
    // Bypass the conflict guard: the user has explicitly asked to replace the
    // current file, so a differing mtime is the point rather than a problem.
    knownMtimeMs = statMtime(filePath);
    const result = writeNow(text);
    return result.ok ? { ok: true, text } : result;
  }

  return {
    filePath,
    dirPath,
    backupDir,
    load,
    save,
    flush,
    writeNow,
    flushBlocking,
    hasPendingWrite,
    setReadOnly,
    isReadOnly: () => readOnly,
    listBackups,
    restoreBackup,
    // exposed for tests
    _selectBackupsToPrune: selectBackupsToPrune,
  };
}

module.exports = {
  createDataStore,
  selectBackupsToPrune,
  isValidJson,
  backupStamp,
  DEBOUNCE_MS,
  MAX_WAIT_MS,
};
