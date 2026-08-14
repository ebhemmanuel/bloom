'use strict';

/**
 * Whether this copy has been paid for. Verified locally, offline, forever.
 *
 * The whole design follows from one constraint: this app holds a legal record
 * of accommodations delivered to disabled children, and a billing state must
 * never be able to take that away. So:
 *
 *   - Nothing expires. A licence is a signature over a name, not a lease.
 *   - Nothing phones home. Verification is an ed25519 check against a public
 *     key compiled into this file. It works on an air-gapped machine in 2040.
 *   - Nothing already recorded is ever gated. The first school year is free in
 *     full, and every year already in the file stays readable, editable,
 *     printable and exportable whether or not a licence exists.
 *
 * What a licence buys is the SECOND school year. See `isLicenceRequired`.
 *
 * Offline keys can be copied between machines and there is no way to detect it
 * without a server. That is accepted rather than fought: the key carries the
 * buyer's name and the app displays it, which is a social deterrent and the
 * only honest kind available here.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/**
 * The public half of the signing key. The private half never leaves the
 * developer's machine - see scripts/make-licence.js.
 *
 * Safe to publish, and it has to be: this file ships inside every copy of the
 * app and the repository is public. It can only CHECK a signature, never make
 * one, so reading it buys an attacker nothing.
 *
 * The BEGIN and END lines are part of the key rather than decoration. Node's
 * createPublicKey reads PEM and throws on a bare base64 body, and because
 * verifyKey swallows that throw, a headerless key here would not fail loudly -
 * it would quietly reject every licence ever issued. Hence the test.
 */
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEApH+A0Mu9HSHCCdnbwosLROuc+rWaP6NosL7zyePJWio=
-----END PUBLIC KEY-----`;

/**
 * Where a teacher goes to buy one. A Stripe Payment Link, opened in THEIR
 * browser by the main process, never in a window of ours.
 *
 * That is not squeamishness about webviews. Any page opened in-app runs in a
 * window with the preload bridge attached, one mistake away from the record,
 * and the renderer could not load Stripe anyway: connect-src is 'none' and the
 * request filter in security.js cancels every non-file: scheme. Card entry
 * belongs in a browser, in a window that has never seen a student's name.
 *
 * Null until the Payment Link exists. The buy button hides itself rather than
 * opening nothing, so an unconfigured build simply asks for a key instead of
 * offering a dead end.
 *
 * The link must collect NAME and EMAIL: they are the two arguments
 * scripts/make-licence.js takes, and the key is signed over them.
 */
const BUY_URL = 'https://buy.stripe.com/aFa6oH1m62NQei14xcgbm00';

const LICENCE_FILE = 'licence.json';

/**
 * A key looks like:  BLOOM-<base64url payload>.<base64url signature>
 *
 * The payload is readable on purpose. A teacher pasting a key can see their own
 * name in it, and a support email can be answered by reading the key rather
 * than by looking anyone up in a database that does not exist.
 */
function parseKey(raw) {
  const trimmed = String(raw || '')
    .trim()
    .replace(/\s+/g, '');
  const body = trimmed.replace(/^BLOOM-/i, '');
  const [payload, signature] = body.split('.');
  if (!payload || !signature) return null;

  try {
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return { json, payload, signature };
  } catch {
    return null;
  }
}

/**
 * Is this key genuine?
 *
 * Never throws. A malformed key, a truncated paste, a key for a different
 * product - all of it is the same answer to a teacher, which is "that key did
 * not work", and none of it should be able to crash the app on startup.
 */
function verifyKey(raw) {
  if (!PUBLIC_KEY_PEM) return { ok: false, reason: 'unsigned-build' };

  const parsed = parseKey(raw);
  if (!parsed) return { ok: false, reason: 'malformed' };

  try {
    const ok = crypto.verify(
      null, // ed25519 takes no separate digest
      Buffer.from(parsed.payload),
      crypto.createPublicKey(PUBLIC_KEY_PEM),
      Buffer.from(parsed.signature, 'base64url')
    );
    if (!ok) return { ok: false, reason: 'invalid' };
    if (parsed.json.product !== 'bloom') return { ok: false, reason: 'wrong-product' };
    return { ok: true, licence: parsed.json };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

// --- Storage ---------------------------------------------------------------
//
// TWO copies, and the second one is the important one.
//
// `userData` is the fast path: the machine this app is installed on. But
// %LOCALAPPDATA% is exactly what a district reimage takes away, and reimaging
// is common enough that it is why the records folder now defaults to OneDrive
// (see data-paths.js). A licence that lived only in userData would have to be
// re-requested by every teacher every time IT wiped a slow laptop.
//
// So a copy sits beside the record, in the folder the teacher already chose to
// keep safe. A reimaged machine that points back at the same OneDrive folder
// picks its licence up again with no email to anybody.
//
// NOT inside data.json. That file is a compliance document that gets printed
// and read by auditors, and who paid for the software has no business in it -
// it is a sibling file, ignorable and deletable without touching the record.
//
// The obvious objection: copying the records folder now copies the licence.
// True, and already true of any offline key - see the note at the top. This
// trades a theoretical increase in sharing for a real reduction in support
// email from people who have already paid.

function licencePath(app) {
  return path.join(app.getPath('userData'), LICENCE_FILE);
}

function readAt(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const result = verifyKey(raw.key);
    return result.ok ? { ...result.licence, key: raw.key } : null;
  } catch {
    return null;
  }
}

function writeAt(file, raw) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ key: String(raw).trim(), acceptedAt: new Date().toISOString() }, null, 2),
    'utf8'
  );
}

/**
 * The licence, from wherever it survived.
 *
 * Machine first, then the records folder. Finding it only beside the record -
 * the reimage case - copies it back to the machine on the way past, so the
 * recovery happens once and silently rather than on every launch.
 */
function readLicence(app, recordsDir = null) {
  const local = readAt(licencePath(app));
  if (local) return local;

  if (!recordsDir) return null;
  const beside = readAt(path.join(recordsDir, LICENCE_FILE));
  if (!beside) return null;

  try {
    writeAt(licencePath(app), beside.key);
  } catch {
    /* Read-only userData is survivable: it will be found here again tomorrow. */
  }
  return beside;
}

/**
 * Store a key once it has verified. An invalid key is never written anywhere.
 *
 * The records-folder copy is best-effort: a teacher whose folder is briefly
 * unreachable still gets a working licence on this machine.
 */
function saveLicence(app, raw, recordsDir = null) {
  const result = verifyKey(raw);
  if (!result.ok) return result;

  try {
    writeAt(licencePath(app), raw);
  } catch (err) {
    return { ok: false, reason: err.code || 'unwritable' };
  }

  if (recordsDir) {
    try {
      writeAt(path.join(recordsDir, LICENCE_FILE), raw);
    } catch {
      /* The machine copy is enough to work today. */
    }
  }

  return { ok: true, licence: result.licence };
}

module.exports = { verifyKey, readLicence, saveLicence, parseKey, licencePath, BUY_URL };
