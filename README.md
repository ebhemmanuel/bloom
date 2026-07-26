# Accommodations Tracker

A standalone, fully offline Windows desktop app for teachers to record daily IEP/504 accommodation delivery, structured as a Jira-style kanban board with one collapsible swimlane per student. Exports to printable PDF for compliance submission.

**The record never touches the network.** There is no database, no account, no sync. Data lives in a plain JSON file on the teacher's own machine.

---

## Start here

| If you are… | Read |
|---|---|
| **Designing this** | [`docs/DESIGN_REQUIREMENTS.md`](docs/DESIGN_REQUIREMENTS.md) — palette, motion system, screen-by-screen specs, and what's fixed vs. open |
| **Building this** | [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — architecture, the `data.json` schema, phased order |
| **Working in the code** | [`CLAUDE.md`](CLAUDE.md) — conventions and the rules that must not be broken |

---

## Running it

```bash
npm install
```

```bash
npm run dev
```

Renderer only, in a browser at `http://localhost:5180`. The Electron bridge is stubbed to `localStorage`, so the board is usable for UI work but is **not** the real data store — a banner says so.

```bash
npm run dev:electron
```

The real app with renderer hot-reload. Use this for anything touching data.

```bash
npm run electron:dev
```

Build then run, no HMR. The reliable fallback if HMR misbehaves.

```bash
npm run smoke
```

Loads the built bundle over `file://` with the production CSP and asserts React mounted, the preload bridge attached, and design tokens applied. Catches the silent blank-window failures that otherwise only surface on a teacher's machine.

```bash
npm test
```

The domain suite. Should stay green at all times.

```bash
npm run electron:build
```

Produces `dist-electron/Accommodations-Tracker.exe` — a single portable file, no installer.

---

## Architecture in one page

```
electron/          main process — CommonJS
  main.js          window, lifecycle, single-instance lock
  security.js      CSP + network kill switch  ← the offline guarantee
  preload.js       the entire main↔renderer contract, one namespace
  data-paths.js    where data.json lives, cloud-sync detection
  data-store.js    atomic write, backup, debounce, corrupt-file recovery
  pdf-export.js    offscreen render → printToPDF

src/
  domain/          PURE. no React, no Electron, no I/O. the test target.
  components/      React + SCSS/BEM
  print/           the PDF views — deliberately share no markup with the board
  styles/          tokens, motion primitives, component styles
```

**The domain layer is where correctness lives.** Every function is pure, synchronous, and takes `now` as an explicit parameter. That is why it can be tested exhaustively, and it is why it exists separately from the UI.

### Where the data file lives, and why

Not next to the `.exe` — ever. Two reasons:

1. The portable build unpacks to a random `%TEMP%` directory and runs from there, so `process.execPath` points at the temp dir, not the folder the teacher sees.
2. The USB stick is a delivery vehicle for the *app*. The record is born on the teacher's machine and stays there, so copying the app folder never carries student data with it.

Instead, onboarding asks for a folder and writes a **pointer** to `%APPDATA%\Accommodations Tracker\location.json`. That is on the local machine and scoped per Windows account, so it's inherently per-teacher on a shared computer and cannot travel on the stick.

> **The OneDrive problem.** On a school Microsoft 365 tenant, Known Folder Redirection points Documents at OneDrive **by default**. Defaulting there would sync student names, plan types, and disability accommodations to the cloud. `data-paths.js` detects this — including the tenant-branded `OneDrive - Northside ISD` shape — and offers a local-only alternative. This is the highest-value check in the app.

### How "not used" is decided

An accommodation left unassigned when the school day's cycle closes resolves to **Not Used**. But:

**A day with no record is `no_record`, never `not_used`.**

*No data was recorded* and *the accommodation was not delivered* are different claims, and conflating them would manufacture a compliance failure the teacher never committed. `sealDay` only ever touches dates that already have a record, so a teacher returning from three weeks' absence finds fifteen days of "no record" rather than fifteen days of documented failure. If one decision in this codebase is load-bearing, it is that one.

Sealed days are read-only. Correcting one requires an explicit **Amend** action that appends to a per-day audit log and leaves the day sealed — IEP records get audited, and an append-only amendment trail is what makes a correction defensible rather than suspicious.

---

## Status

| Phase | State |
|---|---|
| 0 — Skeleton, configs, packaging | **Done.** Portable exe builds, launches, renders; smoke gate in place |
| 1 — Domain layer + data store | **In progress.** `constants` `dates` `ids` `schema` `resolve` + `data-paths` done, 91 tests green. Remaining: `data-store` `seed` `selectors` `mutations` `bulkActions` `report` `migrations` |
| 2 — Kanban board MVP | Not started |
| 3 — Catalog, roster, assignments | Not started |
| 4 — Cycle logic and sealing | Not started |
| 5 — Bulk actions | Not started |
| 6 — PDF export | Not started |
| 7 — Splash + onboarding | Not started |
| 8 — Hardening and ship | Not started |

The Phase 0 boot screen in `src/App.jsx` is scaffolding and gets replaced in Phase 2.

---

## Known deployment risks

Verify these on a real district machine before building out further:

- **District AppLocker policy** may block unsigned executables from user-writable paths outright. Options if blocked: an OV/EV code-signing certificate, an IT hash allowlist, or a different distribution shape.
- **SmartScreen** shows "Windows protected your PC" on first launch of an unsigned exe. Not fatal, but a teacher will assume the app is broken unless the "More info → Run anyway" path is documented for them.
- **Write permissions** on locked-down machines. The app probes and refuses rather than silently relocating a teacher's data.

## Deliberately out of scope

- Any network feature, telemetry, or crash reporting
- Concurrent multi-machine editing. A lock file and mtime guard prevent lost updates; they do **not** merge concurrent edits.
- At-rest encryption. Plaintext for now; the schema can later be wrapped in an encrypted envelope without touching the domain layer.
