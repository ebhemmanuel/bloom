#!/usr/bin/env node
'use strict';

/**
 * Issue a licence key, or create the keypair that signs them.
 *
 * The private key never ships and never leaves this machine. It lives outside
 * the repository on purpose - a signing key committed to a public repo is a
 * product that anyone can licence for free, permanently, with no way to revoke
 * it short of shipping a new binary.
 *
 *   Once, ever:
 *     node scripts/make-licence.js --init
 *       Writes the keypair to ~/.bloom-signing/ and prints the PUBLIC key to
 *       paste into electron/licence.js.
 *
 *   Per sale, after Stripe says the payment went through:
 *     node scripts/make-licence.js --name "Ms. Rivera" --email teacher@school.org
 *       Prints the key. Paste it into the reply.
 *
 * There is no database. The key IS the record: it carries the name, the email
 * and the date it was issued, signed. Stripe holds the payment side, and the
 * two are reconciled by the email address if they ever need to be.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const KEY_DIR = path.join(os.homedir(), '.bloom-signing');
const PRIVATE = path.join(KEY_DIR, 'private.pem');
const PUBLIC = path.join(KEY_DIR, 'public.pem');

function init() {
  if (fs.existsSync(PRIVATE)) {
    console.error(
      `A signing key already exists at ${PRIVATE}.\n` +
        'Refusing to overwrite it: every key ever issued was signed with it, and\n' +
        'replacing it would invalidate all of them. Delete it by hand if you are sure.'
    );
    process.exit(1);
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(PRIVATE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.writeFileSync(PUBLIC, publicKey.export({ type: 'spki', format: 'pem' }));

  const pem = fs.readFileSync(PUBLIC, 'utf8').trim();
  console.log(`Signing key written to ${KEY_DIR}\n`);
  console.log('Back it up somewhere safe and offline. If you lose it you cannot');
  console.log('issue keys to anyone who buys after that point.\n');
  console.log('Paste this into electron/licence.js as PUBLIC_KEY_PEM:\n');
  console.log('const PUBLIC_KEY_PEM = `' + pem + '`;\n');
}

function issue(name, email) {
  if (!fs.existsSync(PRIVATE)) {
    console.error('No signing key yet. Run: node scripts/make-licence.js --init');
    process.exit(1);
  }

  const payload = {
    product: 'bloom',
    name,
    email,
    // The day it was sold, for support. Nothing reads it as an expiry, and
    // nothing ever should - see the note at the top of electron/licence.js.
    issued: new Date().toISOString().slice(0, 10),
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .sign(null, Buffer.from(encoded), crypto.createPrivateKey(fs.readFileSync(PRIVATE)))
    .toString('base64url');

  const key = `BLOOM-${encoded}.${signature}`;

  /*
    Every key issued, appended locally.

    Not a database - a log. It exists so "I lost my key" and "did this person
    actually buy" can be answered by reading a file, and so you can see what you
    have sold without logging into Stripe.

    Re-issuing is safe: ed25519 is deterministic, so the same name, email and
    date produce the byte-identical key. Running this twice for one buyer gives
    them the same key rather than a second one.
  */
  fs.appendFileSync(
    path.join(KEY_DIR, 'issued.log'),
    `${new Date().toISOString()}\t${name}\t${email}\t${key}\n`,
    'utf8'
  );

  console.log(`\n${key}\n`);
  console.log(`Licensed to ${name} <${email}>, issued ${payload.issued}.`);
  console.log(`Logged to ${path.join(KEY_DIR, 'issued.log')}`);
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};

if (args.includes('--init')) {
  init();
} else {
  const name = flag('name');
  const email = flag('email');
  if (!name || !email) {
    console.error('Usage: node scripts/make-licence.js --name "Ms. Rivera" --email t@school.org');
    process.exit(1);
  }
  issue(name, email);
}
