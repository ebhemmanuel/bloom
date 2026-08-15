# CLAUDE.md - Bloom

Offline desktop app for teachers to track daily IEP/504 accommodation delivery. Read [`README.md`](README.md) for architecture and [`docs/DESIGN_REQUIREMENTS.md`](docs/DESIGN_REQUIREMENTS.md) before touching UI.

## Stack

Electron 43 · Vite 7 · React 19 · SCSS/BEM · Vitest 3 · npm · packaged with electron-builder to a portable Windows `.exe`.

`electron/` is **CommonJS**. `src/` is **ESM**. Do not add `"type": "module"` to `package.json` - it would break the main process for no gain.

## NEVER

These are not style preferences. Each one, if broken, either violates the product's core promise or falsifies a legal record.

1. **Never let anything leave the machine.** No telemetry, no crash reporter, no CDN, no remote font, no analytics, and nothing that carries a byte of student data anywhere. The CSP in `electron/security.js` sets `connect-src 'none'` and a request filter cancels every non-`file:` scheme, so **the renderer - the only surface that holds student data - cannot reach the network at all.** This app documents disabled children; that guarantee is the product.

   The single exception is `electron/updates.js`, added deliberately: a GET from the MAIN process to a public GitHub releases endpoint, asking whether a newer version exists. It has no body, no identifiers, and no access to the record - main never parses `data.json`, it only moves its bytes. It is off with one switch in Settings, and the app is fully usable with it off forever. **Do not widen it.** Anything that sends rather than receives, or that reaches the network from the renderer, belongs under the rule above, not under this exception.

2. **Never use `toISOString().slice(0, 10)` to produce a date key.** That converts to UTC first, so any entry made after ~7pm in the Americas lands on the following day. On a compliance record that is a falsified date. Use `toDateKey()` from `src/domain/dates.js`. `dates.test.js` guards this.

3. **Never let a missing day record become `not_used`.** `no_record` and `not_used` are different claims - "we have no data" vs. "the accommodation was not delivered". `sealDay` must only ever touch dates already present in `doc.days`. Turning the first into the second would manufacture a compliance failure the teacher never committed.

4. **Never mutate a document in the domain layer.** Every function in `src/domain/` returns a new object. Tests deep-freeze inputs and will fail loudly.

5. **Never write a derived status.** `absent`, `not_applicable`, and `no_record` are computed by `effectiveStatus` only. Nothing may persist them into an entry.

6. **Never make `normalizeDoc` throw or reject a file.** It repairs and reports. For a compliance tool, "your record won't open" is the worst possible failure mode - a teacher who broke a comma by hand must still get their year back. This is why we don't use zod here.

7. **Never drop `labelSnapshot` from a day entry.** It is what makes an October report still say what it said in October after the catalog is reworded in March.

8. **Never hard-delete an assignment.** Use `activeFrom` / `activeTo`. Removing an accommodation in January must not erase September's record of it.

9. **Never use inline styles.** BEM classes only - inline styles bypass the token system. The single unavoidable exception is `@hello-pangea/dnd`'s own `provided.draggableProps.style` on a dragging card.

10. **Never put student data in a log.** `electron/app-log.js` is machine diagnostics. No names, notes, or accommodation labels.

## Conventions

- **No em-dashes.** Not in comments, not in UI copy, not in docs, not in commit messages. Use a comma, a colon, a semicolon, brackets, or two sentences. The only `—` left in the codebase is the Not Used status glyph in `constants.js` and the empty-rate mark in `report.js`, which are printed marks rather than punctuation.
- Components: `PascalCase.jsx`. SCSS partials: `_kebab-case.scss`. Utilities: `camelCase.js`.
- BEM: `.acc-block__element--modifier`. Every class is prefixed `acc-`.
- Design tokens are a Sass map in `src/styles/abstracts/_tokens.scss` emitted as `--acc-*` custom properties. Components consume `var(--acc-*)`, never the Sass variables.
- Motion comes from `src/styles/abstracts/_motion.scss`. Do not hand-roll durations or easings - and honour the cascade budget (§4.4 of the design doc): capped at 400ms, and **never re-cascade on search or filter**.
- The app ships **no JS animation runtime**. Everything is CSS. If something seems to need framer-motion, raise it rather than adding it.
- Domain functions take `now` as an explicit last-ish parameter. Never call `new Date()` inside domain logic.
- Fonts are bundled under `src/assets/fonts/`. No `@import` from a font CDN.

## Testing

`npm test` - Vitest, node environment, `src/domain/**/*.test.js` and `electron/**/*.test.js`.

The domain layer is the priority target because it is pure and it is where a bug becomes a falsified record. Use the fixture builders in `src/domain/test-helpers.js` rather than hand-assembling documents.

`npm run smoke` gates packaging: it loads the built bundle over `file://` with the production CSP and asserts React mounted, the preload bridge attached, and tokens applied. Run it before any `electron:build` you intend to hand to someone.

## Two design registers

Do not apply one to the other - see §1 of the design doc.

- **Ambient** (splash, onboarding, empty states): soft gradients, blur, cascading entrances, ambient drift.
- **Working** (board, toolbar, manage screens): soft _palette_, crisp _edges_. No blur behind text, no ambient motion.
- **Print** is a third, austere register: pure black on white, status conveyed by glyph and text as well as fill, because these sheets get photocopied in monochrome.

## Gotchas discovered the hard way

- `base: './'` in `vite.config.js` is mandatory. Absolute `/assets/` paths 404 under `file://` and produce a blank window with no error in main.
- The portable build unpacks to a **random** `%TEMP%` dir each launch, so `process.execPath` is not the folder holding the exe. `portable.unpackDirName: false` makes this worse, not better - leave it unset.
- `@vitejs/plugin-react@6` requires Vite 8. On Vite 7, stay on plugin-react 5.
- Modern Sass parses a bare `if()` as the CSS function. Use an `@if` block.
- Dev runs use a separate userData path (`bloom-dev`) so a dev session can never repoint a teacher's live data file.
