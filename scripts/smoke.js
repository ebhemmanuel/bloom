'use strict';

/**
 * Headless-ish renderer smoke check.
 *
 * Loads the built bundle exactly as the real app does — over file://, with the
 * production CSP and the real preload attached — then asserts that React actually
 * mounted and that nothing errored. Exits non-zero on failure so it can gate a
 * build.
 *
 * This exists because the failure mode it catches is silent: a bad `base` path,
 * a CSP that blocks the module script, or a preload throw all produce a window
 * that opens, logs nothing in main, and renders a blank white page.
 *
 * Run: npx electron scripts/smoke.js
 */

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const { hardenSession, hardenWebContents } = require('../electron/security');
const { registerIpcHandlers } = require('../electron/ipc-handlers');

const RENDERER = path.join(__dirname, '..', 'dist-renderer', 'index.html');

const problems = [];
const consoleErrors = [];

function fail(msg) {
  problems.push(msg);
}

app.whenReady().then(async () => {
  if (!fs.existsSync(RENDERER)) {
    fail(`renderer bundle missing at ${RENDERER} — run "npm run build" first`);
    return finish();
  }

  hardenSession();
  // The renderer calls these on mount; without them the smoke check reports an
  // unhandled-rejection that is an artifact of the harness, not a real defect.
  registerIpcHandlers();

  const win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  hardenWebContents(win.webContents);

  // Electron 43 passes an event object; older signatures passed positional args.
  win.webContents.on('console-message', (event) => {
    const isError = event.level === 'error' || event.level === 3;
    if (isError) {
      consoleErrors.push(`${event.message} (${event.sourceId}:${event.lineNumber})`);
    }
  });

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    fail(`did-fail-load ${code} ${desc} for ${url}`);
  });

  win.webContents.on('render-process-gone', (_e, details) => {
    fail(`render process gone: ${details.reason}`);
  });

  try {
    await win.loadFile(RENDERER);
  } catch (err) {
    fail(`loadFile threw: ${err.message}`);
    return finish();
  }

  // Give React a beat to mount and the effect to resolve.
  await new Promise((r) => setTimeout(r, 1500));

  const result = await win.webContents.executeJavaScript(`
    (() => {
      const root = document.getElementById('root');
      return {
        rootExists: !!root,
        childCount: root ? root.childElementCount : 0,
        text: root ? root.innerText.slice(0, 400) : '',
        bridgeAttached: typeof window.accommodations === 'object',
        styledBg: getComputedStyle(document.body).backgroundColor,
        stylesheetCount: document.styleSheets.length,
      };
    })()
  `);

  if (!result.rootExists) fail('#root element is missing from the document');
  if (result.childCount === 0) fail('React did not mount — #root has no children (blank window)');
  if (!result.bridgeAttached) fail('preload bridge not attached — window.accommodations is missing');
  if (result.stylesheetCount === 0) fail('no stylesheet loaded — CSS did not reach the renderer');
  // The token system sets a warm near-white. A transparent/default body background
  // means the SCSS custom properties never applied.
  if (result.styledBg === 'rgba(0, 0, 0, 0)') fail('body background unstyled — tokens did not apply');
  if (consoleErrors.length) fail(`renderer console errors:\n    - ${consoleErrors.join('\n    - ')}`);

  console.log('\n  renderer report');
  console.log('  ---------------');
  console.log(`  root children     : ${result.childCount}`);
  console.log(`  preload bridge    : ${result.bridgeAttached ? 'attached' : 'MISSING'}`);
  console.log(`  stylesheets       : ${result.stylesheetCount}`);
  console.log(`  body background   : ${result.styledBg}`);
  console.log(`  visible text      : ${JSON.stringify(result.text.replace(/\s+/g, ' ').trim())}`);

  finish();
});

function finish() {
  if (problems.length) {
    console.error('\n  SMOKE CHECK FAILED\n');
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error('');
    app.exit(1);
  } else {
    console.log('\n  ✓ smoke check passed — renderer mounted over file:// with CSP active\n');
    app.exit(0);
  }
}
