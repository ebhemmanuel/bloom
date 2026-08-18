import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveDataDir, dataFilePath } from './data-paths.js';
import { createDataStore } from './data-store.js';
import { migrate } from '../src/domain/migrations/index.js';
import { normalizeDoc } from '../src/domain/schema.js';
import { buildOnboardedDoc, setupStage } from '../src/domain/onboarding.js';

/**
 * The launch, end to end, for a teacher who already has a record.
 *
 * This is the chain a real launch walks: main resolves the folder, opens the
 * store, reads the file; the renderer parses, migrates, normalises, and asks
 * setupStage whether to show onboarding. Every link here is the real module.
 * The only thing not exercised is React drawing the answer.
 *
 * It exists because of a report that could not be allowed to happen twice:
 * teachers with a year of records launched a new build, were shown onboarding,
 * and had their record written over. Each scenario below is a way a teacher's
 * pointer can be missing while their record is not - and in every one the
 * chain must end at the board.
 */

const silentLog = { info() {}, warn() {}, error() {} };

/** Production identity: userData is %APPDATA%\Bloom, everything under tmp. */
function productionApp(appData, documents) {
  return {
    getPath: (name) => {
      if (name === 'userData') return path.join(appData, 'Bloom');
      if (name === 'appData') return appData;
      if (name === 'documents') return documents;
      throw new Error(`unexpected path request: ${name}`);
    },
  };
}

/** A record as v1.0.1 would have written it: setup finished, students, days. */
function teacherRecord() {
  const doc = buildOnboardedDoc(
    {
      name: 'Ms Rivera',
      grades: ['3'],
      periods: [1, 2],
      students: [{ name: 'Ada Nava', plan: 'IEP', periods: [1] }],
    },
    new Date('2026-08-05T08:00:00')
  );
  expect(doc.settings.onboardingCompletedAt).toBeTruthy();
  return JSON.stringify(doc, null, 2);
}

/** What the renderer does with the bytes main hands it. Mirrors DataContext. */
function rendererDecides(text) {
  const parsed = JSON.parse(text);
  const migrated = migrate(parsed);
  const { doc } = normalizeDoc(migrated.doc);
  return { doc, ...setupStage(doc, 'ok') };
}

let tmp;
let appData;
let documents;
let local;
let env;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'acc-launch-'));
  appData = path.join(tmp, 'AppData', 'Roaming');
  documents = path.join(tmp, 'Documents');
  local = path.join(tmp, 'AppData', 'Local');
  fs.mkdirSync(documents, { recursive: true });
  env = { LOCALAPPDATA: local };
  process.env.LOCALAPPDATA = local;
  delete process.env.ACCOMMODATIONS_DATA_DIR;
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.LOCALAPPDATA;
});

function launch(app) {
  const resolved = resolveDataDir(app, []);
  if (resolved.status !== 'ok') return { resolved };
  const store = createDataStore({ dirPath: resolved.dirPath, log: silentLog });
  const loaded = store.load();
  return { resolved, loaded, ...rendererDecides(loaded.text) };
}

describe('a teacher with a record launches the new build', () => {
  it('v1.0.1 teacher: pointer in the old app folder, record in Documents\\Bloom - opens the board', () => {
    const records = path.join(documents, 'Bloom');
    fs.mkdirSync(records, { recursive: true });
    fs.writeFileSync(dataFilePath(records), teacherRecord(), 'utf8');
    const legacyDir = path.join(appData, 'Accommodations Tracker');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(
      path.join(legacyDir, 'location.json'),
      JSON.stringify({ dirPath: records }),
      'utf8'
    );

    const run = launch(productionApp(appData, documents));

    expect(run.resolved.status).toBe('ok');
    expect(run.resolved.dirPath).toBe(path.resolve(records));
    expect(run.loaded.status).toBe('ok');
    expect(run.showOnboarding).toBe(false);
    expect(run.doc.students.map((s) => s.displayName)).toEqual(['Ada Nava']);
  });

  it('no pointer anywhere, record in Documents\\Bloom - opens the board', () => {
    const records = path.join(documents, 'Bloom');
    fs.mkdirSync(records, { recursive: true });
    fs.writeFileSync(dataFilePath(records), teacherRecord(), 'utf8');

    const run = launch(productionApp(appData, documents));

    expect(run.resolved.status).toBe('ok');
    expect(run.resolved.source).toBe('discovered');
    expect(run.showOnboarding).toBe(false);
  });

  it('no pointer anywhere, record in LocalAppData\\Bloom - opens the board', () => {
    const records = path.join(local, 'Bloom');
    fs.mkdirSync(records, { recursive: true });
    fs.writeFileSync(dataFilePath(records), teacherRecord(), 'utf8');

    const run = launch(productionApp(appData, documents));

    expect(run.resolved.status).toBe('ok');
    expect(run.showOnboarding).toBe(false);
  });

  it('no pointer, record under the OLD folder name from an early build - opens the board', () => {
    const records = path.join(documents, 'Accommodations Tracker');
    fs.mkdirSync(records, { recursive: true });
    fs.writeFileSync(dataFilePath(records), teacherRecord(), 'utf8');

    const run = launch(productionApp(appData, documents));

    expect(run.resolved.status).toBe('ok');
    expect(run.resolved.dirPath).toBe(path.resolve(records));
    expect(run.showOnboarding).toBe(false);
  });

  it('a record the teacher opened in Notepad and saved (BOM) still opens the board', () => {
    const records = path.join(documents, 'Bloom');
    fs.mkdirSync(records, { recursive: true });
    fs.writeFileSync(dataFilePath(records), '﻿' + teacherRecord(), 'utf8');

    const run = launch(productionApp(appData, documents));

    expect(run.loaded.status).toBe('ok');
    expect(run.showOnboarding).toBe(false);
    // Nothing was quarantined on the way.
    expect(fs.readdirSync(records).some((n) => n.startsWith('data.corrupt-'))).toBe(false);
  });

  it('second launch is ordinary: the pointer written on the first is what is read', () => {
    const records = path.join(documents, 'Bloom');
    fs.mkdirSync(records, { recursive: true });
    fs.writeFileSync(dataFilePath(records), teacherRecord(), 'utf8');
    const app = productionApp(appData, documents);

    const first = launch(app);
    expect(first.resolved.source).toBe('discovered');

    const second = launch(app);
    expect(second.resolved.source).toBe('pointer');
    expect(second.showOnboarding).toBe(false);
  });

  it('a genuinely fresh machine still gets onboarding, and no folder was created looking', () => {
    const run = launch(productionApp(appData, documents));

    expect(run.resolved.status).toBe('unconfigured');
    expect(fs.existsSync(path.join(documents, 'Bloom'))).toBe(false);
    expect(fs.existsSync(path.join(local, 'Bloom'))).toBe(false);
  });
});
