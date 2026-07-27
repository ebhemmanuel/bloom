import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createDataStore, selectBackupsToPrune, isValidJson } from './data-store.js';

const silentLog = { warn: () => {}, error: () => {}, info: () => {} };

let tmp;
let store;

const doc = (n = 1) => JSON.stringify({ schemaVersion: 1, n });

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'acc-store-'));
  store = createDataStore({ dirPath: tmp, log: silentLog });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('load', () => {
  it('reports empty when nothing exists yet', () => {
    const r = store.load();
    expect(r.status).toBe('empty');
    expect(r.text).toBeNull();
  });

  it('reads a valid file', () => {
    fs.writeFileSync(store.filePath, doc(7));
    const r = store.load();
    expect(r.status).toBe('ok');
    expect(JSON.parse(r.text).n).toBe(7);
  });
});

describe('writeNow - atomicity', () => {
  it('writes and leaves no .tmp behind', () => {
    expect(store.writeNow(doc(1)).ok).toBe(true);
    expect(fs.existsSync(store.filePath)).toBe(true);
    expect(fs.existsSync(store.filePath + '.tmp')).toBe(false);
  });

  it('refuses to write invalid JSON rather than truncating the record', () => {
    fs.writeFileSync(store.filePath, doc(1));
    const r = store.writeNow('{ broken');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid-json');
    // The good file is untouched.
    expect(JSON.parse(fs.readFileSync(store.filePath, 'utf8')).n).toBe(1);
  });

  it('leaves the original intact when rename fails outright', () => {
    store.writeNow(doc(1));
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      const e = new Error('nope');
      e.code = 'EIO';
      throw e;
    });

    const r = store.writeNow(doc(2));
    expect(r.ok).toBe(false);
    spy.mockRestore();
    expect(JSON.parse(fs.readFileSync(store.filePath, 'utf8')).n).toBe(1);
  });

  it('retries past a transient EPERM and succeeds', () => {
    // The real-world case: Defender or district AV briefly holds a handle on the
    // freshly written temp file. Without the retry this is a random save failure
    // on exactly the machines this app ships to.
    store.writeNow(doc(1));

    const real = fs.renameSync;
    let calls = 0;
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation((...args) => {
      calls += 1;
      if (calls === 1) {
        const e = new Error('locked by another process');
        e.code = 'EPERM';
        throw e;
      }
      return real.apply(fs, args);
    });

    const r = store.writeNow(doc(2));
    spy.mockRestore();

    expect(r.ok).toBe(true);
    expect(calls).toBe(2);
    expect(JSON.parse(fs.readFileSync(store.filePath, 'utf8')).n).toBe(2);
  });

  it('preserves an external modification but still saves', () => {
    // A sync client, a backup agent or AV rewriting the file used to stall
    // autosave for the rest of the session. Both versions have to survive AND
    // the teacher's own edit has to land.
    store.writeNow(doc(1));
    fs.writeFileSync(store.filePath, doc(99));
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(store.filePath, future, future);

    const r = store.writeNow(doc(2));
    expect(r.ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(store.filePath, 'utf8')).n).toBe(2);

    const preserved = fs.readdirSync(store.backupDir).filter((n) => n.startsWith('data-external-'));
    expect(preserved).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(store.backupDir, preserved[0]), 'utf8')).n).toBe(
      99
    );
  });

  it('honours read-only mode', () => {
    store.setReadOnly(true);
    expect(store.writeNow(doc(1)).reason).toBe('readonly');
    expect(fs.existsSync(store.filePath)).toBe(false);
  });
});

/**
 * Autosave is the only thing standing between a teacher and a lost afternoon of
 * a legal record. A failed write is never allowed to be the end of the story.
 */
describe('a save is never abandoned', () => {
  function failRename(code = 'EPERM') {
    return vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      const e = new Error('locked');
      e.code = code;
      throw e;
    });
  }

  it('keeps the edit in hand when the write fails', () => {
    // The bug this replaces: flush() cleared the pending text BEFORE writing, so
    // one EPERM discarded the edit entirely - the renderer had moved on, nothing
    // was queued, and the change existed nowhere but in memory.
    store.save(doc(7));
    const spy = failRename();
    const r = store.flush();
    spy.mockRestore();

    expect(r.ok).toBe(false);
    expect(store.hasPendingWrite()).toBe(true);
  });

  it('lands the same edit once the lock clears', () => {
    store.save(doc(7));
    const spy = failRename();
    store.flush();
    spy.mockRestore();

    expect(store.flush().ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(store.filePath, 'utf8')).n).toBe(7);
    expect(store.hasPendingWrite()).toBe(false);
  });

  it('a newer edit supersedes the one that failed', () => {
    store.save(doc(7));
    const spy = failRename();
    store.flush();
    spy.mockRestore();

    store.save(doc(8));
    expect(store.flush().ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(store.filePath, 'utf8')).n).toBe(8);
  });

  it('rides out a long AV hold rather than giving up after one blink', () => {
    store.writeNow(doc(1));
    const real = fs.renameSync;
    let calls = 0;
    const spy = vi.spyOn(fs, 'renameSync').mockImplementation((...args) => {
      calls += 1;
      if (calls <= 4) {
        const e = new Error('locked');
        e.code = 'EBUSY';
        throw e;
      }
      return real.apply(fs, args);
    });

    const r = store.writeNow(doc(2));
    spy.mockRestore();
    expect(r.ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(store.filePath, 'utf8')).n).toBe(2);
  });

  it('writes a recovery copy on exit rather than losing the edit', () => {
    // Last resort, when the process is going away and the real location still
    // will not take the write. An awkward recovery file beats a lost afternoon.
    store.save(doc(7));
    const spy = failRename('EACCES');
    const r = store.flushBlocking();
    spy.mockRestore();

    expect(r.ok).toBe(false);
    expect(r.recoveryPath).toBeTruthy();
    expect(JSON.parse(fs.readFileSync(r.recoveryPath, 'utf8')).n).toBe(7);
    fs.unlinkSync(r.recoveryPath);
  });

  it('does not retry read-only, because trying again cannot help', () => {
    store.save(doc(7));
    store.setReadOnly(true);
    expect(store.hasPendingWrite()).toBe(false);
  });
});

describe('backups', () => {
  it('backs up the previous version on each write', () => {
    store.writeNow(doc(1));
    store.writeNow(doc(2));
    const names = fs.readdirSync(store.backupDir);
    expect(names.length).toBeGreaterThanOrEqual(1);
    expect(names.every((n) => /^data-\d{8}-\d{6}\.json$/.test(n))).toBe(true);
  });

  it('does not create a backup on the very first write', () => {
    store.writeNow(doc(1));
    expect(fs.existsSync(store.backupDir)).toBe(false);
  });

  it('lists and restores a backup', () => {
    store.writeNow(doc(1));
    store.writeNow(doc(2));

    const backups = store.listBackups();
    expect(backups.length).toBeGreaterThan(0);
    expect(backups[0].valid).toBe(true);

    const r = store.restoreBackup(backups[0].id);
    expect(r.ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(store.filePath, 'utf8')).n).toBe(1);
  });

  it('rejects a bogus backup id', () => {
    expect(store.restoreBackup('../../etc/passwd').ok).toBe(false);
    expect(store.restoreBackup('nonsense').ok).toBe(false);
  });
});

describe('selectBackupsToPrune', () => {
  const now = new Date(2026, 8, 16, 12, 0);

  it('keeps everything when under the rolling limit', () => {
    const names = ['data-20260916-090000.json', 'data-20260916-100000.json'];
    expect(selectBackupsToPrune(names, now)).toEqual([]);
  });

  it('keeps the newest 10 regardless of day', () => {
    const names = Array.from(
      { length: 14 },
      (_, i) => `data-20260916-${String(100000 + i).padStart(6, '0')}.json`
    );
    const pruned = selectBackupsToPrune(names, now);
    // 14 same-day files: 10 newest kept by the rolling rule, plus the newest of
    // that calendar day (already among them), so 4 go.
    expect(pruned).toHaveLength(4);
    expect(pruned).not.toContain('data-20260916-100013.json');
  });

  it('keeps one per calendar day inside the 30-day window', () => {
    // The daily rule only becomes observable once the rolling "newest 10" rule
    // is saturated, so fill today with 10 writes and put pairs on earlier days.
    const today = Array.from(
      { length: 10 },
      (_, i) => `data-20260916-${String(100000 + i).padStart(6, '0')}.json`
    );
    const names = [
      ...today,
      'data-20260910-080000.json',
      'data-20260910-170000.json', // newest of Sep 10 - keep
      'data-20260909-080000.json',
      'data-20260909-170000.json', // newest of Sep 9 - keep
    ];

    const pruned = selectBackupsToPrune(names, now);

    expect(pruned).toContain('data-20260910-080000.json');
    expect(pruned).toContain('data-20260909-080000.json');
    expect(pruned).not.toContain('data-20260910-170000.json');
    expect(pruned).not.toContain('data-20260909-170000.json');
    // Today's ten are all retained by the rolling rule.
    for (const n of today) expect(pruned).not.toContain(n);
  });

  it('prunes beyond the 30-day window', () => {
    const names = [
      'data-20260101-080000.json', // far outside the window
      ...Array.from(
        { length: 10 },
        (_, i) => `data-20260916-${String(100000 + i).padStart(6, '0')}.json`
      ),
    ];
    expect(selectBackupsToPrune(names, now)).toContain('data-20260101-080000.json');
  });

  it('ignores unrelated filenames', () => {
    expect(selectBackupsToPrune(['README.txt', 'data.json'], now)).toEqual([]);
  });
});

describe('corrupt-file recovery', () => {
  it('quarantines the bad file and never overwrites the evidence', () => {
    fs.writeFileSync(store.filePath, '{ this is not json');
    const r = store.load();

    expect(r.status).toBe('corrupt');
    expect(r.quarantined).toBeTruthy();
    expect(fs.existsSync(r.quarantined)).toBe(true);
    expect(fs.readFileSync(r.quarantined, 'utf8')).toBe('{ this is not json');
    expect(fs.existsSync(store.filePath)).toBe(false);
  });

  it('prefers .tmp over a backup - a .tmp means we crashed AFTER writing it', () => {
    fs.mkdirSync(store.backupDir, { recursive: true });
    fs.writeFileSync(path.join(store.backupDir, 'data-20260915-090000.json'), doc(1));
    fs.writeFileSync(store.filePath, 'corrupt!!');
    fs.writeFileSync(store.filePath + '.tmp', doc(2));

    const r = store.load();
    expect(r.status).toBe('recovered');
    expect(JSON.parse(r.text).n).toBe(2);
  });

  it('falls back to the newest valid backup', () => {
    fs.mkdirSync(store.backupDir, { recursive: true });
    fs.writeFileSync(path.join(store.backupDir, 'data-20260915-090000.json'), doc(1));
    fs.writeFileSync(path.join(store.backupDir, 'data-20260916-090000.json'), doc(2));
    fs.writeFileSync(store.filePath, 'corrupt!!');

    const r = store.load();
    expect(r.status).toBe('recovered');
    expect(JSON.parse(r.text).n).toBe(2);
  });

  it('skips a corrupt backup to reach a valid older one', () => {
    fs.mkdirSync(store.backupDir, { recursive: true });
    fs.writeFileSync(path.join(store.backupDir, 'data-20260915-090000.json'), doc(1));
    fs.writeFileSync(path.join(store.backupDir, 'data-20260916-090000.json'), 'also broken');
    fs.writeFileSync(store.filePath, 'corrupt!!');

    const r = store.load();
    expect(r.status).toBe('recovered');
    expect(JSON.parse(r.text).n).toBe(1);
  });

  it('recovers a .tmp when no primary file exists at all', () => {
    fs.writeFileSync(store.filePath + '.tmp', doc(5));
    const r = store.load();
    expect(r.status).toBe('recovered');
    expect(JSON.parse(r.text).n).toBe(5);
  });
});

describe('debounced save', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('coalesces rapid edits into a single write', () => {
    store.save(doc(1));
    store.save(doc(2));
    store.save(doc(3));
    expect(fs.existsSync(store.filePath)).toBe(false);

    vi.advanceTimersByTime(400);
    expect(JSON.parse(fs.readFileSync(store.filePath, 'utf8')).n).toBe(3);
  });

  it('writes at the 3s ceiling even under continuous typing', () => {
    // A teacher typing without pause must still get periodic durability.
    for (let i = 0; i < 20; i += 1) {
      store.save(doc(i));
      vi.advanceTimersByTime(200); // always shorter than the 400ms debounce
    }
    expect(fs.existsSync(store.filePath)).toBe(true);
  });

  it('flush writes immediately and clears the queue', () => {
    store.save(doc(9));
    expect(store.hasPendingWrite()).toBe(true);
    expect(store.flush().ok).toBe(true);
    expect(store.hasPendingWrite()).toBe(false);
    expect(JSON.parse(fs.readFileSync(store.filePath, 'utf8')).n).toBe(9);
  });

  it('flush with nothing queued is a no-op', () => {
    expect(store.flush().noop).toBe(true);
  });
});

describe('isValidJson', () => {
  it('discriminates', () => {
    expect(isValidJson('{"a":1}')).toBe(true);
    expect(isValidJson('[]')).toBe(true);
    expect(isValidJson('{ nope')).toBe(false);
    expect(isValidJson('')).toBe(false);
  });
});
