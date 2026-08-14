'use strict';

/**
 * Windows portable build that sidesteps OneDrive file locks.
 *
 * electron-builder unpacks to win-unpacked.tmp then renames it. When the repo
 * lives under Documents (synced by OneDrive), that rename often fails with
 * EPERM. Building to C:\Temp\accom-electron-build avoids the lock; this script
 * copies the portable exe back into dist-electron when it is done.
 *
 * Run: npm run electron:build:win
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TEMP_OUT = 'C:/Temp/accom-electron-build';
// Must match `portable.artifactName` in electron-builder.yml, or the copy back
// into dist-electron finds nothing and the build fails at the last step.
const EXE_NAME = 'Bloom.exe';
const DEST_DIR = path.join(ROOT, 'dist-electron');
const DEST_EXE = path.join(DEST_DIR, EXE_NAME);
const BUILT_EXE = path.join(TEMP_OUT, EXE_NAME);

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('npx', ['electron-builder', '--win', `--config.directories.output=${TEMP_OUT}`]);

if (!fs.existsSync(BUILT_EXE)) {
  console.error(`Build finished but ${BUILT_EXE} was not found.`);
  process.exit(1);
}

fs.mkdirSync(DEST_DIR, { recursive: true });
fs.copyFileSync(BUILT_EXE, DEST_EXE);

const stat = fs.statSync(DEST_EXE);
console.log(`\nCopied portable exe to ${DEST_EXE} (${stat.size} bytes)`);
