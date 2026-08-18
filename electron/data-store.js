'use strict';

/**
 * Byte-level persistence for data.json.
 *
 * Deliberate split of responsibility: this module handles PATHS, ATOMICITY,
 * BACKUPS and RECOVERY. It does not know the schema. Parsing, migration and
 * normalisation happen in the renderer's pure domain layer (`src/domain`), which
 * is ESM and exhaustively tested. Main only ever asks "is this valid JSON?",
 * a byte-level question, and otherwise moves text around safely.
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
 * kills it, so a longer budget does not buy more durability - it just means the
 * recovery file never gets written either. Bounded by wall clock rather than by
 * attempt count, because the rename retries inside each attempt already vary.
 */
const EXIT_BUDGET_MS = 1600;

/**
 * Backoff between whole retry passes, when an entire write failed.
 *
 * Runs on a timer, not a spin, so the app stays responsive while it keeps
 * trying. Caps at 5s and then repeats forever - a save is never abandoned.
 */
const RETRY_BACKOFF_MS = [200, 500, 1000, 2000, 5000];

const KEEP_ROLLING = 10;
/** How long after the last change event before we look. One paste fires several. */
const WATCH_DEBOUNCE_MS = 400;
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
function createDataStore({
  dirPath,
  onStatus = () => {},
  onExternalChange = () => {},
  log = console,
}) {
  const filePath = dataFilePath(dirPath);
  const tmpPath = filePath + TMP_SUFFIX;
  const backupDir = backupDirPath(dirPath);

  /**
   * What we last knew the file to be, on disk. `knownText` lets a foreign mtime
   * be told apart from a foreign FILE: AV and sync clients rewrite identical
   * bytes and only the timestamp moves. That is a touch, not a replacement.
   */
  let knownText = null;
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
        log.warn?.('[data-store] recovered from .tmp - no primary file present');
        const text = safeRead(tmpPath);
        return { status: 'recovered', text, from: tmpPath, meta: baseMeta() };
      }
      return { status: 'empty', text: null, meta: baseMeta() };
    }

    const text = safeRead(filePath);
    if (text !== null && isValidJson(text)) {
      knownMtimeMs = statMtime(filePath);
      knownText = text;
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

  /*
    Strips a UTF-8 byte order mark. Node keeps it, JSON.parse rejects it, and
    Notepad (and most things a teacher would open a .json file in) writes one.
    Without this, a backup a teacher had opened to look at and saved was read
    as corrupt, quarantined, and replaced by the newest backup - which by then
    was the empty record they were trying to get away from. normalizeDoc's
    promise is that no readable file is ever refused; a BOM does not make a
    file unreadable, so it must not be refused before normalizeDoc sees it.
  */
  function safeRead(p) {
    try {
      const text = fs.readFileSync(p, 'utf8');
      return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
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

    // 1 - something else touched the file since we last read or wrote it.
    //
    // Two things can have happened, and they get opposite answers.
    //
    // A TOUCH: a sync client, a backup agent or AV rewrote the same bytes and
    // only the timestamp moved. Adopt the timestamp and carry on saving; there
    // is nothing to preserve and nothing to reload.
    //
    // A REPLACEMENT: the content is different. Almost always a teacher who
    // pasted an old copy of their record over data.json, which is the most
    // natural repair there is. This used to "preserve" the paste to backups and
    // write memory straight back over it, and to the teacher that read as the
    // file being ignored. Now the file on disk WINS: what we were about to
    // write is kept aside as data.unsaved-<stamp>.json so nothing is lost, and
    // the caller is told to reload. The write does not happen.
    const currentMtime = statMtime(filePath);
    if (knownMtimeMs !== null && currentMtime !== null && currentMtime !== knownMtimeMs) {
      const onDisk = safeRead(filePath);
      if (onDisk !== null && onDisk === knownText) {
        knownMtimeMs = currentMtime;
      } else if (onDisk !== null && isValidJson(onDisk)) {
        log.warn?.(
          '[data-store] data.json was replaced outside the app; it wins, ours is set aside'
        );
        keepAside(text);
        clearTimers();
        pendingText = null;
        knownMtimeMs = currentMtime;
        knownText = onDisk;
        onStatus({ state: 'conflict', path: filePath });
        onExternalChange({ path: filePath });
        return { ok: false, reason: 'replaced-externally' };
      }
      // Unreadable or mid-copy: fall through and write. The watcher will see
      // the finished file if one is coming.
    }

    onStatus({ state: 'saving' });

    try {
      fs.mkdirSync(dirPath, { recursive: true });

      // 2 - back up the version we are about to replace
      if (fs.existsSync(filePath)) {
        try {
          fs.mkdirSync(backupDir, { recursive: true });
          fs.copyFileSync(filePath, path.join(backupDir, `data-${backupStamp()}.json`));

          /*
            Writing over a file we NEVER READ keeps a copy that is never pruned.

            `knownMtimeMs` is set by load() and by our own writes. If it is still
            null, whatever is on disk was not the source of what we are about to
            write - which is the shape of onboarding writing a fresh record over
            a teacher's year. The rolling backup above holds ten; ten autosaves
            later that copy is gone. `data-preexisting-*` does not match
            BACKUP_RE, so it survives until someone deletes it by hand.
          */
          if (knownMtimeMs === null) {
            log.warn?.('[data-store] overwriting a file this session never read; keeping it');
            fs.copyFileSync(
              filePath,
              path.join(backupDir, `data-preexisting-${backupStamp()}.json`)
            );
          }

          pruneBackups();
        } catch (err) {
          // A failed backup must not block the save itself.
          log.warn?.(`[data-store] backup failed (continuing): ${err.message}`);
        }
      }

      // 3/4 - write and flush to the platter, in the SAME directory as the
      // target: rename is only atomic within a single volume.
      const fd = fs.openSync(tmpPath, 'w');
      try {
        fs.writeFileSync(fd, text, 'utf8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }

      // 5/6 - swap into place, retrying past transient AV locks
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
      knownText = text;
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
   * A save that fails is not an event to report and move on from - the teacher's
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

    // Read-only is not a failure to retry past - there is nowhere to write and
    // no amount of trying changes that. Nor is the file having been replaced
    // under us: the edit is already set aside and retrying would write it over
    // the very file the teacher just put there. Everything else gets another go.
    if (result.reason === 'readonly' || result.reason === 'replaced-externally') {
      pendingText = null;
      return result;
    }

    scheduleRetry();
    return result;
  }

  /**
   * The last chance. Called on quit, suspend and lock-screen.
   *
   * The timer-based retry above is useless here - the process is going away, so
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

  // --- watching the file -----------------------------------------------------

  let watcher = null;
  let watchTimer = null;

  /**
   * Notice when someone else replaces data.json, and say so.
   *
   * A teacher with an old copy of their record pastes it over data.json in the
   * records folder. That is the most natural repair in the world, and it did
   * not work: nothing watched the file, so the paste went unnoticed until the
   * next autosave, which saw a foreign mtime, dutifully preserved the pasted
   * file to backups, and wrote the in-memory record straight back over it. To
   * the teacher the file was "not recognised". It was recognised and undone.
   *
   * So the store watches. When data.json changes and the change was not ours,
   * the pasted file WINS: anything unsaved in memory is written to
   * data.unsaved-<stamp>.json first so it is not lost, the pending write is
   * dropped so it cannot land on top, and the caller is told to reload.
   *
   * The directory is watched rather than the file, because on Windows a paste
   * is a delete and a create, and a watch on the old inode goes with it.
   * Debounced, because one paste fires several events. Our own writes are
   * recognised by mtime: writeNow records the mtime it produced, synchronously,
   * before any watch callback can run.
   */
  function onWatchEvent(_type, filename) {
    // `filename` is null on some platforms; when given, only our own file matters.
    if (filename && filename !== path.basename(filePath)) return;
    if (watchTimer) clearTimeout(watchTimer);
    watchTimer = setTimeout(() => {
      watchTimer = null;
      considerExternalChange();
    }, WATCH_DEBOUNCE_MS);
  }

  /**
   * Seconds of edits that were on their way to disk, kept beside the file under
   * a name the teacher can find and the pruner never sees. Never lost, never
   * written over the file that displaced them.
   */
  function keepAside(text) {
    if (text === null || text === undefined) return;
    try {
      const aside = path.join(dirPath, `data.unsaved-${backupStamp()}.json`);
      fs.writeFileSync(aside, text, 'utf8');
      log.warn?.(`[data-store] unsaved edits kept at ${aside}`);
    } catch (err) {
      log.warn?.(`[data-store] could not keep unsaved edits: ${err.message}`);
    }
  }

  function considerExternalChange() {
    if (knownMtimeMs === null) return; // never read it: no baseline to compare
    const mtime = statMtime(filePath);
    if (mtime === null || mtime === knownMtimeMs) return;

    const text = safeRead(filePath);
    if (text === null || !isValidJson(text)) return; // mid-copy; a later event will land

    if (text === knownText) {
      // A touch, not a replacement. Same bytes, new timestamp.
      knownMtimeMs = mtime;
      return;
    }

    log.info?.('[data-store] data.json was replaced outside the app; adopting it');
    keepAside(pendingText);
    clearTimers();
    pendingText = null;
    knownMtimeMs = mtime;
    knownText = text;
    onExternalChange({ path: filePath });
  }

  function startWatching() {
    if (watcher) return;
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      watcher = fs.watch(dirPath, { persistent: false }, onWatchEvent);
      watcher.on?.('error', (err) => log.warn?.(`[data-store] watch error: ${err.message}`));
    } catch (err) {
      log.warn?.(`[data-store] could not watch records folder: ${err.message}`);
      watcher = null;
    }
  }

  function stopWatching() {
    if (watchTimer) clearTimeout(watchTimer);
    watchTimer = null;
    if (watcher) {
      try {
        watcher.close();
      } catch {
        /* already closed */
      }
      watcher = null;
    }
  }

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

  /**
   * Does this text look like one of our records?
   *
   * normalizeDoc will repair ANYTHING into a document, which is the right
   * promise for a file we already own and the wrong one for a file about to
   * replace it: a stray settings.json picked by mistake would become an empty
   * record and overwrite a teacher's year. So an import has to carry a mark of
   * having been ours. Deliberately loose - a schemaVersion, or a students list,
   * or a days map - because a hand-edited file may have lost one and must still
   * be accepted; it only has to have kept one.
   */
  function looksLikeRecord(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return false;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    return (
      Number.isFinite(parsed.schemaVersion) ||
      Array.isArray(parsed.students) ||
      (parsed.days !== null && typeof parsed.days === 'object')
    );
  }

  /**
   * Replace the current record with a file the teacher chose. Any path.
   *
   * This is the door for "I have my old data.json / a backup / a copy from my
   * other laptop, take it". Before it existed the only way was to close the
   * app and paste over data.json by hand - and pasting while the app was open
   * had the autosave write the in-memory record straight back over the pasted
   * one within a second, which read as the file being ignored.
   *
   * The displaced file is kept as `data-replaced-*`, a name the pruner never
   * matches, so this is reversible by the same door.
   */
  function importRecord(sourcePath) {
    if (typeof sourcePath !== 'string' || !sourcePath) return { ok: false, reason: 'bad-path' };
    const text = safeRead(sourcePath);
    if (text === null) return { ok: false, reason: 'unreadable' };
    if (!isValidJson(text)) return { ok: false, reason: 'not-json' };
    if (!looksLikeRecord(text)) return { ok: false, reason: 'not-a-record' };

    clearTimers();
    pendingText = null;

    if (fs.existsSync(filePath)) {
      try {
        fs.mkdirSync(backupDir, { recursive: true });
        fs.copyFileSync(filePath, path.join(backupDir, `data-replaced-${backupStamp()}.json`));
      } catch (err) {
        log.warn?.(`[data-store] could not keep the replaced record: ${err.message}`);
      }
    }

    // The teacher asked for this file to win. A differing mtime is the point.
    knownMtimeMs = statMtime(filePath);
    const result = writeNow(text);
    return result.ok ? { ok: true, text } : result;
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

  /**
   * Copy the record into another folder, leaving this one exactly where it is.
   *
   * Moving would be tidier and is the wrong call. A teacher changing where their
   * records live is doing something they can get wrong - the wrong folder, a
   * drive that turns out to be read-only, a district policy nobody mentioned -
   * and a copy means the worst case is a stale duplicate rather than a year of
   * compliance history in a place they cannot find. The old file stays until
   * they delete it themselves.
   *
   * A record already in the target is never silently overwritten. Without
   * `replace` this refuses and says so, and with it the displaced file is set
   * aside under its own name first, because that file is somebody's record too.
   */
  function copyRecordTo(targetDir, { replace = false } = {}) {
    const target = path.join(targetDir, path.basename(filePath));
    if (path.resolve(target) === path.resolve(filePath)) {
      return { ok: true, unchanged: true, path: target };
    }

    // Whatever is queued belongs in the copy: the teacher's most recent edit is
    // the one they would look for first in the new folder.
    if (pendingText !== null) flush();

    const text = safeRead(filePath);
    if (text === null) return { ok: false, reason: 'NOTHING_TO_COPY' };

    try {
      fs.mkdirSync(targetDir, { recursive: true });

      if (fs.existsSync(target)) {
        if (!replace) return { ok: false, reason: 'EXISTING_RECORD', path: target };
        const aside = path.join(targetDir, `data-replaced-${backupStamp()}.json`);
        fs.copyFileSync(target, aside);
      }

      fs.writeFileSync(target, text, 'utf8');
      return { ok: true, path: target };
    } catch (err) {
      log.error?.(`[data-store] copy to ${targetDir} failed: ${err.code || ''} ${err.message}`);
      return { ok: false, reason: err.code || 'copy-failed' };
    }
  }

  return {
    filePath,
    dirPath,
    backupDir,
    copyRecordTo,
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
    importRecord,
    startWatching,
    stopWatching,
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
