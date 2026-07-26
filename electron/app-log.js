'use strict';

/**
 * Minimal append-only diagnostic log, mirroring bigchat/electron/app-health-log.js.
 *
 * Deliberately NOT written next to data.json: this is machine diagnostics, not part
 * of the compliance record, and it must never end up in a teacher's backup folder.
 * It lives under userData and is safe to delete at any time.
 *
 * Never log student names, notes, or accommodation labels here.
 */

const fs = require('node:fs');
const path = require('node:path');

let logPath = null;
let stream = null;

function init(userDataPath) {
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    logPath = path.join(userDataPath, 'app.log');

    // Rotate at 1 MB so this can never grow without bound on a school machine.
    try {
      const stat = fs.statSync(logPath);
      if (stat.size > 1024 * 1024) {
        fs.renameSync(logPath, path.join(userDataPath, 'app.prev.log'));
      }
    } catch {
      /* no existing log — first run */
    }

    stream = fs.createWriteStream(logPath, { flags: 'a' });
    write('info', `--- session start | pid ${process.pid} | electron ${process.versions.electron}`);
  } catch (err) {
    console.error('[app-log] init failed:', err);
  }
}

function write(level, message) {
  const line = `${new Date().toISOString()} [${level}] ${message}\n`;
  if (stream) stream.write(line);
  if (level === 'error') console.error(message);
}

const info = (msg) => write('info', msg);
const warn = (msg) => write('warn', msg);
const error = (msg) => write('error', msg);

function getLogPath() {
  return logPath;
}

module.exports = { init, info, warn, error, getLogPath };
