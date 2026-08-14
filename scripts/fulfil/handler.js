'use strict';

/**
 * Stripe says a payment landed; sign a key and email it.
 *
 * Deployed on its own, never bundled into the app. The app has no idea this
 * exists and never calls it - the key it produces is verified offline against a
 * public key compiled into the binary.
 *
 * Read scripts/fulfil/README.md before deploying. The short version: this holds
 * the PRIVATE signing key, offline verification means there is no revocation,
 * and it should therefore use a different key from the one you sign by hand.
 */

const crypto = require('node:crypto');

/**
 * The same payload and encoding as scripts/make-licence.js, and it must stay
 * that way - two issuers producing different shapes is how a teacher ends up
 * with a key the app cannot read.
 *
 * ed25519 is deterministic, so this and the manual script produce the identical
 * key for the same name, email and date. Re-issuing is always safe.
 */
function signLicence({ name, email, issued }, privatePem) {
  const payload = { product: 'bloom', name, email, issued };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .sign(null, Buffer.from(encoded), crypto.createPrivateKey(privatePem))
    .toString('base64url');
  return `BLOOM-${encoded}.${signature}`;
}

/**
 * Is this really Stripe?
 *
 * Without it, anyone who finds the URL can POST a fake purchase and mint
 * themselves a licence. Compared in constant time, because a timing-variable
 * compare on a signature is a real hole rather than a theoretical one.
 */
function verifyStripe(rawBody, header, secret) {
  const parts = Object.fromEntries(
    String(header || '')
      .split(',')
      .map((p) => p.split('='))
  );
  if (!parts.t || !parts.v1) return false;

  // Reject anything older than five minutes, so a captured request cannot be
  // replayed tomorrow to mint another key.
  const age = Math.abs(Date.now() / 1000 - Number(parts.t));
  if (!Number.isFinite(age) || age > 300) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${parts.t}.${rawBody}`)
    .digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function sendKey({ to, name, key }, env) {
  const body = {
    from: env.FROM_EMAIL,
    to,
    subject: 'Your Bloom licence key',
    text: [
      `Hello ${name},`,
      '',
      'Thank you. Here is your licence key:',
      '',
      key,
      '',
      'To use it: open Bloom, go to File > Settings > Reminders, and paste it',
      'into the licence field. It is checked on your own computer - Bloom never',
      'sends anything anywhere to verify it, and it does not expire.',
      '',
      'Keep this email. If your computer is ever replaced or reimaged you can',
      'paste the same key again. Bloom also keeps a copy beside your records',
      'folder, so pointing a new machine at that folder usually restores it on',
      'its own.',
      '',
      'If anything goes wrong, just reply to this message.',
    ].join('\n'),
  };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`mail failed: ${res.status} ${await res.text()}`);
}

/**
 * The endpoint.
 *
 * Returns 200 to Stripe for anything it has genuinely handled, including events
 * it does not care about - a non-200 makes Stripe retry, and retrying a
 * `checkout.session.completed` we deliberately ignored would go on for days.
 *
 * A FAILURE to email, though, returns 500 on purpose: that is exactly the case
 * where a retry is wanted, because a teacher has paid and has nothing.
 */
async function handleWebhook(rawBody, signatureHeader, env) {
  if (!verifyStripe(rawBody, signatureHeader, env.STRIPE_WEBHOOK_SECRET)) {
    return { status: 400, body: 'bad signature' };
  }

  const event = JSON.parse(rawBody);
  if (event.type !== 'checkout.session.completed') return { status: 200, body: 'ignored' };

  const session = event.data.object;
  const email = session.customer_details?.email;
  const name = session.customer_details?.name || 'there';

  // No address, no delivery. Answer 200 so Stripe stops trying, and let this
  // one land in your own inbox instead - it needs a human.
  if (!email) return { status: 200, body: 'no email on session' };

  const key = signLicence(
    { name, email, issued: new Date().toISOString().slice(0, 10) },
    env.SIGNING_KEY
  );

  await sendKey({ to: email, name, key }, env);
  return { status: 200, body: 'sent' };
}

module.exports = { handleWebhook, signLicence, verifyStripe };
