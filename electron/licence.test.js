import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { verifyKey, parseKey } = require('./licence.js');

/**
 * These tests cannot sign anything: the private key lives in ~/.bloom-signing/
 * and deliberately never reaches this repository. So there is no test here that
 * a genuine key verifies - that check happens by hand, once, when a key is
 * issued.
 *
 * What IS testable is the half that can silently break, and the way it breaks
 * is the reason this file exists. Every failure path in verifyKey returns a
 * value rather than throwing, which is right for a teacher pasting a key at
 * 4pm and wrong for a build mistake: paste the public key without its PEM
 * header lines and createPublicKey throws, the catch swallows it, and the app
 * rejects every licence ever sold while looking completely healthy.
 */

const PUBLIC_KEY_PEM = require('node:fs')
  .readFileSync(new URL('./licence.js', import.meta.url), 'utf8')
  .match(/const PUBLIC_KEY_PEM = `([^`]*)`/)?.[1];

describe('the compiled-in public key', () => {
  it('is present, so a paid build is never shipped unsigned', () => {
    expect(PUBLIC_KEY_PEM).toBeTruthy();
  });

  /*
    The bug this file was written for. A bare base64 body looks correct in a
    diff and is accepted by JavaScript as a perfectly good string.
  */
  it('is real PEM that node can actually load', () => {
    expect(PUBLIC_KEY_PEM).toMatch(/^-----BEGIN PUBLIC KEY-----\n/);
    expect(PUBLIC_KEY_PEM).toMatch(/\n-----END PUBLIC KEY-----$/);

    const key = crypto.createPublicKey(PUBLIC_KEY_PEM);
    expect(key.asymmetricKeyType).toBe('ed25519');
  });

  /*
    A key signed by anyone else must fail. This is the actual security claim,
    and it is testable without the real private key because a freshly generated
    one is exactly what an attacker has: a valid ed25519 key that is not ours.
  */
  it('rejects a well-formed key signed by a different keypair', () => {
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    const payload = Buffer.from(
      JSON.stringify({ product: 'bloom', name: 'Attacker', email: 'a@b.c', issued: '2026-08-14' })
    ).toString('base64url');
    const signature = crypto.sign(null, Buffer.from(payload), privateKey).toString('base64url');

    expect(verifyKey(`BLOOM-${payload}.${signature}`)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('verifyKey', () => {
  /*
    None of these may throw. A crash here happens on startup, before the board
    paints, and would make a billing detail look like data loss.
  */
  it.each([
    ['nothing', ''],
    ['null', null],
    ['undefined', undefined],
    ['no signature', 'BLOOM-eyJwcm9kdWN0IjoiYmxvb20ifQ'],
    ['not base64', 'BLOOM-!!!.!!!'],
    ['a sentence', 'here is the key you asked for'],
    ['the word null', 'null'],
  ])('answers rather than throws: %s', (_label, input) => {
    const result = verifyKey(input);
    expect(result.ok).toBe(false);
    expect(typeof result.reason).toBe('string');
  });
});

describe('parseKey', () => {
  /*
    Keys travel by email, and mail clients wrap long lines. A teacher who pastes
    a key back with a newline through the middle of it has done nothing wrong.
  */
  it('survives the round trip through an email client', () => {
    const payload = Buffer.from(JSON.stringify({ product: 'bloom', name: 'Ms. Rivera' })).toString(
      'base64url'
    );
    const raw = `  BLOOM-${payload.slice(0, 12)}\n${payload.slice(12)}.abc  `;
    expect(parseKey(raw).json.name).toBe('Ms. Rivera');
  });

  it('takes the key with or without the BLOOM- prefix', () => {
    const payload = Buffer.from(JSON.stringify({ product: 'bloom' })).toString('base64url');
    expect(parseKey(`${payload}.sig`)).toBeTruthy();
    expect(parseKey(`bloom-${payload}.sig`)).toBeTruthy();
  });
});
