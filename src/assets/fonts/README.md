# Fonts

Self-hosted webfonts (woff2) for offline use. No Google Fonts, no CDN: the CSP
sets `connect-src 'none'` and cancels every non-`file:` request, so a remote
font would not just breach the offline promise, it would fail to load on the
machines this ships to.

- Inter 400 / 500 / 600 / 700 (from rsms/inter, SIL OFL 1.1)
- JetBrains Mono 400 / 500 (from JetBrains/JetBrainsMono, SIL OFL 1.1)

## What the build uses

`src/styles/base/_typography.scss` declares all six `@font-face` rules with
relative paths, so Vite resolves, hashes and copies the files into the bundle -
which is what keeps them working under `file://` alongside `base: './'`.

`fonts.css` here is the vendor drop's own manifest, kept for provenance. It is
NOT loaded by the app; editing it changes nothing. Add or remove a weight in
`_typography.scss`.
