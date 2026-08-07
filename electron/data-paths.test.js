import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  detectSync,
  probeLocation,
  probeWritable,
  readPointer,
  writePointer,
  clearPointer,
  parseDataDirArg,
  resolveDataDir,
  dataFilePath,
  suggestLocations,
} from './data-paths.js';

/** Minimal stand-in for Electron's `app`. */
function fakeApp(userData) {
  return {
    getPath: (name) => {
      if (name === 'userData') return userData;
      if (name === 'documents') return path.join(userData, 'Documents');
      throw new Error(`unexpected path request: ${name}`);
    },
  };
}

let tmp;
let app;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'acc-paths-'));
  app = fakeApp(path.join(tmp, 'userData'));
  delete process.env.ACCOMMODATIONS_DATA_DIR;
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.ACCOMMODATIONS_DATA_DIR;
});

describe('suggestLocations - cloud first, and named for itself', () => {
  /*
    The ordering is a decision, not an accident, so it is asserted. District
    laptops get reimaged when they slow down and a reimage takes %LOCALAPPDATA%
    with it, which is a worse loss than the file living in the district's own
    Microsoft tenant - where the IEP it documents already lives.
  */
  it('offers the cloud folder before the local one', () => {
    const list = suggestLocations(app, {
      LOCALAPPDATA: path.join(tmp, 'Local'),
      OneDriveCommercial: path.join(tmp, 'OneDrive - Northside ISD'),
    });

    expect(list[0].id).toBe('cloud');
    expect(list[0].recommended).toBe(true);
    expect(list[1].id).toBe('local');
  });

  /*
    The path on the screen is the REAL one. It is built from the account signed
    in to the machine, never from a sample or a placeholder, because it is what
    a teacher would type into Explorer to go and find their own file.
  */
  it('builds every path from the real home folder, not a placeholder', () => {
    const home = path.join(tmp, 'Users', 'jrivera');
    const real = fakeApp(path.join(tmp, 'userData'));
    real.getPath = (name) => {
      if (name === 'userData') return path.join(tmp, 'userData');
      if (name === 'documents') return path.join(home, 'Documents');
      throw new Error(name);
    };

    const list = suggestLocations(real, {
      LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
      OneDrive: path.join(home, 'OneDrive'),
    });

    expect(list.map((o) => o.dirPath)).toEqual([
      path.join(home, 'OneDrive', 'Bloom'),
      path.join(home, 'AppData', 'Local', 'Bloom'),
      path.join(home, 'Documents', 'Bloom'),
    ]);
  });

  it('names the option OneDrive rather than warning about Documents', () => {
    // Documents already redirected, which is the default on a school tenant.
    const redirected = fakeApp(path.join(tmp, 'userData'));
    redirected.getPath = (name) => {
      if (name === 'userData') return path.join(tmp, 'userData');
      if (name === 'documents') return path.join(tmp, 'OneDrive - Northside ISD', 'Documents');
      throw new Error(name);
    };

    const list = suggestLocations(redirected, { LOCALAPPDATA: path.join(tmp, 'Local') });

    expect(list[0].label).toBe('OneDrive');
    expect(list[0].kind).toBe('cloud');
    // and it is not also offered a second time under its other name
    expect(list.some((o) => o.id === 'documents')).toBe(false);
  });

  it('falls back to local when there is no cloud folder at all', () => {
    const list = suggestLocations(app, { LOCALAPPDATA: path.join(tmp, 'Local') });

    expect(list[0].id).toBe('local');
    expect(list[0].recommended).toBe(true);
    // Documents survives as the findable third choice when it is not redirected.
    expect(list.some((o) => o.id === 'documents')).toBe(true);
  });
});

describe('detectSync - the OneDrive guard', () => {
  it('flags a plain OneDrive folder', () => {
    const r = detectSync('C:\\Users\\jrivera\\OneDrive\\Documents\\Bloom');
    expect(r.synced).toBe(true);
    expect(r.provider).toBe('OneDrive');
  });

  it('flags a tenant-branded OneDrive folder', () => {
    // This is the real-world shape on a school M365 tenant, and the one that
    // would otherwise slip through: "OneDrive - Northside ISD".
    const r = detectSync('C:\\Users\\jrivera\\OneDrive - Northside ISD\\Documents');
    expect(r.synced).toBe(true);
    expect(r.provider).toBe('OneDrive');
  });

  it('flags Dropbox, Google Drive and iCloud', () => {
    expect(detectSync('C:\\Users\\x\\Dropbox\\records').provider).toBe('Dropbox');
    expect(detectSync('C:\\Users\\x\\Google Drive\\records').provider).toBe('Google Drive');
    expect(detectSync('C:\\Users\\x\\My Drive\\records').provider).toBe('Google Drive');
    expect(detectSync('C:\\Users\\x\\iCloudDrive\\records').provider).toBe('iCloud Drive');
  });

  it('flags a UNC network share', () => {
    const r = detectSync('\\\\district-fs01\\staff\\rivera');
    expect(r.network).toBe(true);
    expect(r.synced).toBe(true);
  });

  it('does not flag ordinary local paths', () => {
    for (const p of [
      'C:\\Users\\jrivera\\AppData\\Local\\Bloom',
      'C:\\Users\\jrivera\\Documents\\Bloom',
      'D:\\records',
    ]) {
      expect(detectSync(p).synced).toBe(false);
    }
  });

  it('does not false-positive on a folder merely containing the word', () => {
    // "OneDriveway" and "Boxcar" are not sync roots.
    expect(detectSync('C:\\Users\\x\\OneDriveway\\records').synced).toBe(false);
    expect(detectSync('C:\\Users\\x\\Boxcar\\records').synced).toBe(false);
  });

  it('handles empty and non-string input', () => {
    expect(detectSync('').synced).toBe(false);
    expect(detectSync(null).synced).toBe(false);
    expect(detectSync(undefined).synced).toBe(false);
  });
});

describe('probeWritable', () => {
  it('succeeds in a writable folder and leaves no probe file behind', () => {
    const dir = path.join(tmp, 'writable');
    const r = probeWritable(dir);
    expect(r.writable).toBe(true);
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });

  it('reports a reason when the path cannot be used', () => {
    // A file where a directory is expected - mkdir fails with a real errno.
    const filePath = path.join(tmp, 'a-file');
    fs.writeFileSync(filePath, 'x');
    const r = probeWritable(path.join(filePath, 'nested'));
    expect(r.writable).toBe(false);
    expect(r.reason).toBeTruthy();
  });
});

describe('probeLocation', () => {
  it('reports a clean local folder as valid and unsynced', () => {
    const r = probeLocation(path.join(tmp, 'records'));
    expect(r.valid).toBe(true);
    expect(r.synced).toBe(false);
    expect(r.existingFile).toBe(false);
    expect(r.dataFile).toBe(path.join(path.resolve(tmp), 'records', 'data.json'));
  });

  it('notices an existing data.json so onboarding can offer to adopt it', () => {
    const dir = path.join(tmp, 'existing');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'data.json'), '{}');
    expect(probeLocation(dir).existingFile).toBe(true);
  });

  it('rejects empty input', () => {
    expect(probeLocation('').valid).toBe(false);
    expect(probeLocation('   ').valid).toBe(false);
  });
});

describe('pointer file', () => {
  it('round-trips', () => {
    const dir = path.join(tmp, 'chosen');
    writePointer(app, dir);
    expect(readPointer(app).dirPath).toBe(path.resolve(dir));
  });

  it('returns null when absent', () => {
    expect(readPointer(app)).toBeNull();
  });

  it('returns null when corrupt rather than throwing', () => {
    const p = path.join(tmp, 'userData', 'location.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'not json{{');
    expect(readPointer(app)).toBeNull();
  });

  it('returns null when the shape is wrong', () => {
    const p = path.join(tmp, 'userData', 'location.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ nope: true }));
    expect(readPointer(app)).toBeNull();
  });

  it('clears cleanly and is safe to clear twice', () => {
    writePointer(app, path.join(tmp, 'chosen'));
    clearPointer(app);
    expect(readPointer(app)).toBeNull();
    expect(() => clearPointer(app)).not.toThrow();
  });
});

describe('parseDataDirArg', () => {
  it('reads the space-separated form', () => {
    expect(parseDataDirArg(['electron', '.', '--data-dir', 'D:\\recs'])).toBe('D:\\recs');
  });

  it('reads the inline form', () => {
    expect(parseDataDirArg(['electron', '.', '--data-dir=D:\\recs'])).toBe('D:\\recs');
  });

  it('returns null when absent', () => {
    expect(parseDataDirArg(['electron', '.'])).toBeNull();
  });
});

describe('resolveDataDir', () => {
  it('reports unconfigured before onboarding has run', () => {
    expect(resolveDataDir(app, []).status).toBe('unconfigured');
  });

  it('uses the pointer once written', () => {
    const dir = path.join(tmp, 'records');
    fs.mkdirSync(dir, { recursive: true });
    writePointer(app, dir);

    const r = resolveDataDir(app, []);
    expect(r.status).toBe('ok');
    expect(r.source).toBe('pointer');
    expect(r.dirPath).toBe(path.resolve(dir));
  });

  it('reports missing - never silently starts fresh - when the folder is gone', () => {
    // The scenario: re-imaged machine, or a Documents folder that lived on a
    // drive that is no longer attached. Starting a blank record here would be
    // indistinguishable from losing a year of compliance data.
    const dir = path.join(tmp, 'vanished');
    fs.mkdirSync(dir, { recursive: true });
    writePointer(app, dir);
    fs.rmSync(dir, { recursive: true, force: true });

    const r = resolveDataDir(app, []);
    expect(r.status).toBe('missing');
    expect(r.dirPath).toBe(path.resolve(dir));
  });

  it('lets the CLI override win over the pointer', () => {
    const pointed = path.join(tmp, 'pointed');
    const forced = path.join(tmp, 'forced');
    fs.mkdirSync(pointed, { recursive: true });
    writePointer(app, pointed);

    const r = resolveDataDir(app, ['electron', '.', '--data-dir', forced]);
    expect(r.source).toBe('override');
    expect(r.dirPath).toBe(path.resolve(forced));
  });

  it('lets the env var override the pointer', () => {
    const forced = path.join(tmp, 'env-forced');
    process.env.ACCOMMODATIONS_DATA_DIR = forced;
    const r = resolveDataDir(app, []);
    expect(r.source).toBe('override');
    expect(r.dirPath).toBe(path.resolve(forced));
  });
});

describe('dataFilePath', () => {
  it('appends the fixed filename', () => {
    expect(dataFilePath('C:\\recs')).toBe(path.join('C:\\recs', 'data.json'));
  });
});
