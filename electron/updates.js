'use strict';

/**
 * Checking whether a newer version exists. Receive-only, by construction.
 *
 * This is the ONE place the app touches the network, and the shape of it is the
 * whole argument for allowing it: a GET to a public releases endpoint carries no
 * body, no identifiers and no student data. What comes back is a version string
 * and a link. Nothing about a child, a plan or a classroom is expressible in
 * that request.
 *
 * The renderer is still sealed shut. `security.js` keeps `connect-src 'none'`
 * and cancels every non-file: request on the renderer session; this runs in the
 * MAIN process over Node's https, which those layers never see. That separation
 * is deliberate rather than a loophole: the surface that holds student data
 * cannot reach the network at all, and the surface that can reach the network
 * never holds student data.
 *
 * It never installs anything. The portable build unpacks to a random %TEMP%
 * directory each launch, so there is no installed copy to replace - the check
 * tells the teacher a new version exists and offers to open the release page in
 * their own browser. Downloading and running it stays a human decision.
 */

const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

/** Where releases live. Public on purpose: a token cannot ship in a client. */
const OWNER = 'ebhemmanuel';
const REPO = 'accommodations-tracker';
const LATEST = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
const RELEASES_PAGE = `https://github.com/${OWNER}/${REPO}/releases/latest`;

/** Short, because a school network that blocks this should not cost anyone a wait. */
const TIMEOUT_MS = 8000;

/** How long a check is good for. Guards against re-checking on every launch. */
const MIN_INTERVAL_MS = 20 * 60 * 60 * 1000;

const STATE_FILE = 'update-state.json';

/**
 * When we last looked, kept in userData rather than in the record.
 *
 * data.json is a compliance document. "The app checked GitHub on Tuesday" is
 * machine state and has no business in a file an auditor reads, so it lives
 * beside the location pointer instead.
 */
function statePath(app) {
  return path.join(app.getPath('userData'), STATE_FILE);
}

function readState(app) {
  try {
    return JSON.parse(fs.readFileSync(statePath(app), 'utf8')) || {};
  } catch {
    return {};
  }
}

function writeState(app, state) {
  try {
    fs.mkdirSync(path.dirname(statePath(app)), { recursive: true });
    fs.writeFileSync(statePath(app), JSON.stringify(state, null, 2), 'utf8');
  } catch {
    /* A lost timestamp costs one extra check. Never worth failing over. */
  }
}

/**
 * Compare two dotted versions. `v` prefixes are tolerated because GitHub tags
 * usually carry one and package.json never does.
 */
function isNewer(candidate, current) {
  const parse = (v) =>
    String(v || '')
      .replace(/^v/i, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0);

  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/**
 * One request, and it never rejects.
 *
 * Every failure - offline, blocked by the district firewall, rate limited,
 * unparseable - is the same outcome to a teacher: we do not know, carry on. An
 * update check that can interrupt someone's afternoon with an error dialog is
 * worse than no update check.
 */
function fetchLatest() {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const req = https.get(
      LATEST,
      {
        headers: {
          // GitHub rejects requests without one. Deliberately says only what
          // the app is - no machine name, no user, no version of anything else.
          'User-Agent': 'Bloom-Accommodations-Tracker',
          Accept: 'application/vnd.github+json',
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          done({ ok: false, reason: `HTTP ${res.statusCode}` });
          return;
        }

        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
          // A releases payload is a few KB. Anything larger is not our answer.
          if (body.length > 512 * 1024) {
            req.destroy();
            done({ ok: false, reason: 'oversized' });
          }
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            done({ ok: true, version: json.tag_name || json.name || null, url: json.html_url });
          } catch {
            done({ ok: false, reason: 'unreadable' });
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      done({ ok: false, reason: 'timeout' });
    });
    req.on('error', (err) => done({ ok: false, reason: err.code || 'network' }));
  });
}

/**
 * Ask whether there is a newer version.
 *
 * `force` is the manual check: it ignores the interval, because a teacher who
 * pressed the button is owed an answer rather than a cached one.
 */
async function checkForUpdate(app, { force = false } = {}) {
  const current = app.getVersion();
  const state = readState(app);

  if (!force && state.lastCheckedAt) {
    const age = Date.now() - Date.parse(state.lastCheckedAt);
    if (Number.isFinite(age) && age < MIN_INTERVAL_MS) {
      return { ok: true, skipped: true, current, ...(state.result || {}) };
    }
  }

  const latest = await fetchLatest();
  if (!latest.ok) {
    // The failure is not recorded as a check: a blocked network should not
    // suppress tomorrow's attempt.
    return { ok: false, reason: latest.reason, current };
  }

  const result = {
    latest: latest.version,
    available: isNewer(latest.version, current),
    url: latest.url || RELEASES_PAGE,
  };
  writeState(app, { lastCheckedAt: new Date().toISOString(), result });
  return { ok: true, current, ...result };
}

/**
 * The daily check, and one shortly after launch.
 *
 * The launch check exists because a teacher's app is rarely running at 07:30 -
 * it is opened when the day starts and closed when it ends, so a timer alone
 * would fire on almost nobody. The interval guard keeps that from becoming a
 * request on every launch.
 *
 * `getSettings` is read at fire time rather than captured, so turning the check
 * off in Settings takes effect without a restart.
 */
function startUpdateSchedule(app, { getSettings, onResult }) {
  let timer = null;
  const enabled = () => getSettings()?.updates?.enabled !== false;

  const run = async (force = false) => {
    if (!enabled()) return null;
    const result = await checkForUpdate(app, { force });
    if (result.available) onResult?.(result);
    return result;
  };

  // A beat after launch, so a cold start is never waiting on a socket.
  const kickoff = setTimeout(() => run(false), 12_000);
  kickoff.unref?.();

  /** Fires on the minute the teacher chose, checked once a minute. */
  const tick = () => {
    if (!enabled()) return;
    const at = String(getSettings()?.updates?.checkAt || '08:00');
    const [h, m] = at.split(':').map(Number);
    const now = new Date();
    if (now.getHours() === (h || 0) && now.getMinutes() === (m || 0)) run(false);
  };

  timer = setInterval(tick, 60_000);
  timer.unref?.();

  return {
    check: (force = true) => run(force),
    stop: () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    },
  };
}

module.exports = { checkForUpdate, startUpdateSchedule, isNewer, RELEASES_PAGE };
