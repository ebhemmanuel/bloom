# Auto-signing on purchase

A single serverless function. Stripe calls it when a payment completes; it signs
a licence key and emails it to the buyer.

Nothing here ships inside the app, and the app never talks to it. The key it
produces is verified offline by `electron/licence.js` against a public key
compiled into the binary.

## The one risk, stated plainly

**This puts the private signing key on a server.** If that server is ever
compromised, an attacker can mint unlimited valid keys, and because verification
is offline there is no revocation list and no way to disable them. The only
remedy would be shipping a new binary with a new public key, which invalidates
every legitimate key too.

Two things follow, and both are worth doing:

1. **Use a separate signing key from the manual one.** Run `make-licence.js
   --init` a second time into a different directory and give this service that
   key. If it leaks, you burn only the keys issued through it, and every key you
   issued by hand still works.
2. **Keep issuing by hand while volume is low.** This exists for when replying
   to every purchase becomes the bottleneck, not before.

## Deploy

Any platform that runs a JS function on an HTTP POST. Cloudflare Workers,
Vercel, Netlify, Lambda - `handler.js` is plain Node with no framework.

Secrets to set:

| Name | What |
|---|---|
| `SIGNING_KEY` | The **private** PEM, as one env var. Never in the repo. |
| `STRIPE_WEBHOOK_SECRET` | From the Stripe dashboard, for signature checking |
| `RESEND_API_KEY` | Or Postmark, or whatever sends the mail |
| `FROM_EMAIL` | The address the key arrives from |

In Stripe: add a webhook endpoint pointing at the deployed URL, subscribed to
`checkout.session.completed` only.

On the Payment Link, require the buyer's **name** and **email** - the key is
signed over both, and the name is what the app displays.

## Verifying it works

Stripe's CLI replays a real event at your local machine:

    stripe listen --forward-to localhost:8787/webhook
    stripe trigger checkout.session.completed

The signed key it prints must verify with `verifyKey` from
`electron/licence.js`. If it does not, the public key in the app and the private
key in `SIGNING_KEY` are not a pair.
