# Accommodations Tracker — Implementation Plan

## Context

Teachers are legally required to document that they delivered each student's IEP/504 accommodations, and today that tracking is ad hoc. This builds a standalone, fully offline desktop app for daily accommodation tracking, structured as a Jira-style kanban board with one collapsible swimlane per student.

The hard constraint is that student PII and disability-plan references **must never touch the network**. That rules out any database or hosted service, so the record lives in a plain JSON file on the teacher's own machine. Distribution is via USB stick: the stick carries only the application, and on first run the onboarding wizard creates the data file in the teacher's local profile — deliberately _outside_ the app folder, so copying or re-cloning the app never drags student data with it. The output must print to PDF for compliance submission.

Target directory `C:\Users\akkis\Documents\Repos\accomidations` is currently empty. Precedent repos: `bigchat` (Electron + Vite + SCSS token pattern + splash/onboarding idiom) and `bipbup` (React + SCSS/BEM conventions).

---

## Confirmed decisions

| #   | Decision                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Electron + Vite**, portable Windows `.exe` via electron-builder, mirroring bigchat                                                                                                 |
| 2   | **True Jira kanban** — draggable cards, one collapsible swimlane per student                                                                                                         |
| 3   | Columns: `Unassigned` → `Used` → `Used with Detail`; unassigned auto-resolves to `Not Used` at cycle end                                                                             |
| 4   | **Notes is per-student-per-day**, the LAST column of the swimlane — not a field on cards                                                                                             |
| 5   | Shared accommodation **catalog + per-student custom one-offs**                                                                                                                       |
| 6   | **Data file lives in the teacher's local profile, never in the app folder** (see §3)                                                                                                 |
| 7   | Date filter — board shows one date at a time                                                                                                                                         |
| 8   | Student name search; all students on one page by default                                                                                                                             |
| 9   | Class **periods** are a real grouping/filter dimension                                                                                                                               |
| 10  | **Mark-absent** button at the far right of each swimlane header                                                                                                                      |
| 11  | **Copy from previous day** action                                                                                                                                                    |
| 12  | Bulk actions are an **extensible per-accommodation capability** — some opt out                                                                                                       |
| 13  | PDF: (a) date-range × period × all students with name search, (b) single-day all-students sheet                                                                                      |
| 14  | **Intro animation loader → onboarding** on startup                                                                                                                                   |
| 15  | Cycle completes **once per school day** at a configurable time                                                                                                                       |
| 16  | **One teacher per data file**                                                                                                                                                        |
| 17  | **Plaintext JSON.** Per user: the USB never carries data, and machine-local data is the teacher's responsibility. Ship a lock-on-idle screen + a deploy guide recommending BitLocker |

---

## 1. Stack

**React 19 + Vite 7 + SCSS/BEM.** bigchat's vanilla+jQuery idiom suits an overlay that paints a HUD; it is wrong here. The board renders as a pure function of `(doc, date, periodFilter, search, collapsedLanes, dragState)` — in jQuery that means hand-written DOM reconciliation of a ~240-cell grid on every keystroke and every card move. `bipbup\CLAUDE.md` already codifies React/SCSS/BEM, so there is no convention drift, and bigchat's Sass token pattern carries over unchanged.

**DnD: `@hello-pangea/dnd@^18.0.1`** — the maintained fork of Atlassian's `react-beautiful-dnd`, i.e. the library Jira's board shipped on. Droppable columns, drag placeholders, auto-scroll and drop animation are defaults, not work. Its whole dep tree (`@babel/runtime`, `css-box-model`, `raf-schd`, `react-redux`, `redux`) is bundled by Vite at build time — **no CDN, no runtime fetch**, runs clean under `file://` with `connect-src 'none'`. Built-in keyboard dragging + screen-reader announcements matter for a district accessibility review on anything touching IEP data.

Rejected: `react-beautiful-dnd` (archived, no React 19); `@dnd-kit/core` (headless — you author every board behavior; documented as the escape hatch if we ever exceed ~500 cards); native HTML5 DnD (no touch, poor a11y).

**No `framer-motion`** — the splash is CSS `@keyframes`, a direct port of bigchat's idiom.

```
react ^19.2.0   react-dom ^19.2.0   vite ^7.2.4   @vitejs/plugin-react ^5.1.1
sass ^1.97.2    @hello-pangea/dnd ^18.0.1
electron ^43.2.0   electron-builder ^26.15.3   vitest ^3.2.4   prettier ^3.5.3
```

Electron 43 rather than bigchat's pinned 41 — bigchat is pinned only because `uiohook-napi` needs a native rebuild. This app has **zero native dependencies**.

Copy `bigchat\.prettierrc.json` verbatim. Deliberately **not** copied from bigchat: the local HTTP server (`main.js:17`) and the Google Fonts `<link>` (`preview\index.html:9-11`) — both network-adjacent and disqualifying here.

---

## 2. Directory structure

```
accomidations/
├── .prettierrc.json .prettierignore .gitignore CLAUDE.md README.md
├── index.html                    # NO remote <link>/<script>
├── vite.config.js                # base: './'  ← required for file://
├── vitest.config.js  electron-builder.yml  build/icon.ico
│
├── electron/
│   ├── main.js  preload.js  ipc-handlers.js  app-log.js
│   ├── security.js            # CSP + network kill switch
│   ├── data-paths.js          # location pointer, folder picker, sync detection
│   ├── data-store.js          # load/migrate/normalize/atomic-write/backup/debounce
│   ├── data-lock.js           # lock file + heartbeat
│   └── pdf-export.js          # hidden BrowserWindow + printToPDF
│
├── src/
│   ├── main.jsx  App.jsx
│   ├── domain/                # PURE. no React, no electron, no I/O. the vitest target.
│   │   ├── constants.js ids.js dates.js schema.js migrations/index.js
│   │   ├── selectors.js       # buildBoardModel(doc, filters)
│   │   ├── mutations.js       # pure reducers
│   │   ├── resolve.js         # effectiveStatus / sealDay
│   │   ├── seed.js            # ensureDay / copyFromPreviousDay
│   │   ├── bulkActions.js     # extensible registry
│   │   └── report.js          # PDF aggregation + compliance math
│   ├── components/
│   │   ├── board/       Board · PeriodGroup · Swimlane · SwimlaneHeader · StatusColumn ·
│   │   │                AccommodationCard · CardStatusControl · CardDetailPopover ·
│   │   │                SwimlaneNotesCell · SwimlaneSummaryStrip · BulkActionBar
│   │   ├── toolbar/     BoardToolbar · DatePicker · PeriodFilter · StudentSearch ·
│   │   │                CopyPreviousDayButton · CloseOutDayButton
│   │   ├── manage/      CatalogManager · PeriodManager · StudentRoster ·
│   │   │                StudentAssignments · CustomAccommodationForm
│   │   ├── export/      ExportDialog · ExportRangeForm · ExportDaySheetForm
│   │   ├── onboarding/  SplashLoader · OnboardingFlow ·
│   │   │                steps/{Welcome,Teacher,DataLocation,Periods,Roster,Catalog,Assign,Done}Step
│   │   └── shared/      AppShell · Modal · Toast · SaveStatusPill · DataPathBanner ·
│   │                    IdleLockScreen · EmptyState · Icon
│   ├── print/           PrintRoot · PrintDaySheet · PrintRangeReport · PrintHeader ·
│   │                    PrintSignatureBlock
│   ├── context/         DataContext · BoardFilterContext · ToastContext
│   ├── hooks/           useDoc · useBoardModel · useDayRollover · useIdleLock ·
│   │                    useCollapsedLanes · useKeyboardShortcuts
│   ├── lib/bridge.js    # thin wrapper over window.accommodations
│   ├── assets/fonts/    # bundled locally. NO Google Fonts.
│   └── styles/
│       ├── main.scss
│       ├── abstracts/_tokens.scss _mixins.scss
│       ├── base/ layout/ components/ print/_print.scss
│
├── tests/fixtures/      # v1.json, v2.json … one per historical schema version
├── dev-data/            # gitignored dev store
└── dist-renderer/ dist-electron/   # gitignored
```

`_tokens.scss` mirrors `bigchat\assets\scss\themes\_marathon-shared.scss` — an `$acc-tokens` Sass map emitted as `--acc-*` custom properties on `:root, [data-theme='school']`.

---

## 3. Where data.json lives — `electron/data-paths.js`

**The app folder holds no data, ever.** The USB carries only the executable; copying or re-imaging the app folder carries nothing with it.

**The pointer, not the data, is what makes this work.** On first run, onboarding asks the teacher to confirm a data folder. The chosen absolute path is written to a one-line pointer file at `app.getPath('userData')\location.json`:

```jsonc
{ "dataDir": "C:\\Users\\jrivera\\Documents\\Accommodations Tracker", "chosenAt": "..." }
```

`userData` resolves to `%APPDATA%\Accommodations Tracker` — **on the local machine, never on the USB, and scoped per Windows account.** So the pointer is inherently per-teacher on a shared machine, and copying the app folder does not copy it. A teacher who moves to a new machine re-runs onboarding; their old machine's data is untouched.

**Default suggestion: `%USERPROFILE%\Documents\Accommodations Tracker\data.json`** — discoverable, so a teacher can back it up themselves.

### The OneDrive problem — the highest-value 30 lines in the app

On a school Microsoft 365 tenant, **Documents is Known-Folder-Redirected into OneDrive by default.** Defaulting blindly to Documents would sync student names and disability-plan references to the cloud, breaking the product's central promise.

At the DataLocation onboarding step, before writing anything:

1. Resolve the real Documents path (it may already be `…\OneDrive - Northside ISD\Documents`).
2. Flag it if it matches `/OneDrive|Dropbox|Google Drive|iCloudDrive/i` or starts with `\\`.
3. If flagged, present a **blocking** choice, stated in plain language — sync means the file leaves the machine:
   - **Use a local-only folder (recommended)** → `%LOCALAPPDATA%\Accommodations Tracker\` — never roams, never syncs.
   - **Pick another folder** → `dialog.showOpenDialog`, re-probed.
   - **Continue anyway** → allowed, but pins a persistent `DataPathBanner`.
4. **Writability probe** — write and delete `.acc-write-test`. On `EACCES`/`EPERM`/`EROFS`, refuse and re-prompt rather than silently relocating.

Resolution order at every launch: `--data-dir` CLI arg → `ACCOMMODATIONS_DATA_DIR` env → pointer file → onboarding. If the pointer names a folder that no longer exists (USB-only Documents, re-imaged machine), do **not** start fresh — show a recovery screen offering _Locate my file_ / _Start fresh_, because silently creating an empty record is indistinguishable from data loss.

---

## 4. The `data.json` schema

The single most important deliverable. Design rules, each load-bearing:

1. **`schemaVersion` is a root integer.** Never infer version from shape.
2. **Date keys are bare local `YYYY-MM-DD`.** Never `toISOString().slice(0,10)` — that is UTC and produces an off-by-one-day record for any teacher west of Greenwich after 7pm. Timestamps are full ISO **with offset**.
3. **Day entries are keyed by `assignmentId`, not `catalogId`** — the assignment is the stable per-student link and survives catalog edits.
4. **Every day entry carries `labelSnapshot`**, written at creation. If a catalog item is reworded in March, October's printed sheet must still say what it said in October. Non-negotiable for an auditable record.
5. **Assignments soft-delete via `activeFrom`/`activeTo`.** Removing an accommodation in January must not erase September.
6. **A missing day is `no_record`, not `not_used`.** See §7.

### Root shape

```jsonc
{
  "schemaVersion": 1,
  "app":      { "name", "createdAt", "lastOpenedAt", "lastWrittenBy": { "version", "host" } },
  "settings": { "activeTeacherId", "onboardingCompletedAt", "cycleEndTime": "16:00",
                "autoSealOnStartup": true, "copyPreviousDayMode": "structure",
                "idleLockMinutes": 10, "lastKnownDate", "theme" },
  "schoolCalendar": { "termStart", "termEnd", "nonInstructionalDates": ["2026-11-26"] },
  "teachers":    [ { "id", "displayName", "school", "room", "createdAt" } ],
  "periods":     [ { "id", "teacherId", "name", "shortName", "sortOrder", "archivedAt" } ],
  "students":    [ { "id", "teacherId", "firstName", "lastName", "displayName",
                     "periodIds": [], "planType": "IEP" | "504", "planRef",
                     "caseManager", "sortOrder", "active", "archivedAt", "createdAt" } ],
  "catalog":     [ { "id", "label", "category", "requiresDetail", "detailPrompt",
                     "bulkEligible", "bulkActions": [], "archived", "createdAt" } ],
  "assignments": [ { "id", "studentId", "source": "catalog" | "custom", "catalogId",
                     "label", "category", "requiresDetail", "detailPrompt",
                     "bulkEligible", "bulkActions", "sortOrder", "activeFrom", "activeTo" } ],
  "days": { "YYYY-MM-DD": { ... } }
}
```

### A day record

```jsonc
"2026-09-15": {
  "date": "2026-09-15",
  "createdAt": "2026-09-15T07:51:03.000-04:00",
  "seededFrom": "2026-09-14", "seedMode": "structure",
  "sealed": true, "sealedAt": "2026-09-16T07:48:22.600-04:00", "sealedBy": "auto",
  "amended": false, "amendments": [],
  "students": {
    "stu_0071": {
      "absent": false, "absenceReason": null,
      "notes": "Used break pass twice during group work. Quiz retake Thu.",
      "notesUpdatedAt": "2026-09-15T14:41:09.000-04:00",
      "entries": {
        "asg_a1": { "status": "used", "detail": "",
                    "labelSnapshot": "Extended time (1.5x) on assessments",
                    "resolvedBy": "user", "updatedAt": "2026-09-15T10:14:00.000-04:00" },
        "asg_a2": { "status": "used_with_detail",
                    "detail": "Section 3.2 word problems, read by aide.",
                    "labelSnapshot": "Text read aloud",
                    "resolvedBy": "user", "updatedAt": "2026-09-15T10:22:41.000-04:00" }
      }
    },
    "stu_0088": { "absent": true, "absenceReason": "excused", "notes": "", "entries": { … } }
  }
}
```

### Status vocabulary

| Persisted          | Meaning                                      | Column                            |
| ------------------ | -------------------------------------------- | --------------------------------- |
| `unassigned`       | not yet triaged today                        | Unassigned                        |
| `used`             | delivered                                    | Used                              |
| `used_with_detail` | delivered, narrative in `detail`             | Used with Detail                  |
| `not_used`         | **resolved** — cycle closed with no delivery | Unassigned, `--not-used` modifier |

Derived only, never persisted (computed by `effectiveStatus`): `absent` (excluded from the compliance denominator), `not_applicable` (weekend or non-instructional date, assignment out of its date range, or marked not relevant to this subject — **never** a period), `no_record` (no day record exists — prints as "— no record —").

**A period is a grouping, not a schedule.** It records which class a student is in and nothing about when that class runs, so nothing about a period can make an accommodation not applicable. An earlier draft of this plan gave periods a `meetingDays` list and derived applicability from it; that was invented here rather than asked for, and it greyed out whole student lanes against a timetable nobody had entered. Removed.

### Versioning & migration

`schema.js` exports `CURRENT_SCHEMA_VERSION`. `migrations/index.js` exports an ordered `{ from, to, up(doc) }` array; each `up` is pure and tested against a committed fixture. Load flow in `data-store.js`:

1. `schemaVersion > CURRENT` → **do not write.** Open read-only with a banner. Prevents an older copy from silently truncating fields.
2. `schemaVersion < CURRENT` → back up to `backups/data-pre-v{N}-{ts}.json`, migrate in sequence, write once.
3. `normalizeDoc()` — a **forgiving coercing normalizer, not a validator.** Fills missing arrays, drops orphan entries, de-dupes ids, coerces unknown status strings to `unassigned`, returns `repairs[]` shown as a dismissible toast. Never throws. For a compliance tool, refusing to open the file is the worst possible failure mode. (This is why not `zod` — the goal is repair, not rejection.)

---

## 5. Electron main / preload / IPC

### Atomic write

```
1. compare current mtimeMs against the value recorded at last read
     → mismatch means another process wrote → prompt Reload / Overwrite / Save-as-copy
2. copy data.json → backups/data-YYYYMMDD-HHmmss.json
3. write data.json.tmp   (same directory — rename is only atomic within a volume)
4. fsyncSync, close
5. renameSync(tmp, data.json)
6. retry 3× at 60ms on EPERM/EBUSY
```

Step 6 is not optional on Windows: Defender and district AV briefly hold a handle on a freshly written file and the rename fails with `EPERM`. Without the retry this ships as random save failures on exactly the target machines.

Backup rotation: last 10 rolling + one per calendar day for 30 days.

### Debounced saves

Renderer mutates optimistically and posts the whole doc; main coalesces with a **400ms trailing debounce and a 3s max-wait ceiling.** Forced flush on `before-quit`, `window-all-closed`, window `blur`, and `powerMonitor` `suspend`/`shutdown`/`lock-screen`. Never rely on quit alone — laptops get closed mid-thought.

### Corrupt-file recovery

Rename the bad file to `data.corrupt-{ts}.json` first — never overwrite evidence. Then, in order: `data.json.tmp` if it parses (crash between write and rename) → newest parsing file in `backups/` → a dialog offering _Open recovered copy from {date}_ / _Start fresh_ / _Quit_.

### Concurrency

`app.requestSingleInstanceLock()` for the same machine. `data.lock.json` (`{ pid, host, user, acquiredAt, heartbeatAt }`, 15s heartbeat, 60s staleness) plus the mtime guard prevents lost updates if a folder is somehow shared. It does **not** merge concurrent edits — state that plainly in the README.

### Preload surface

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, one namespace (bigchat's `preload.js:14` pattern). No raw `fs` crosses the bridge; every handler validates its payload shape in main.

```js
contextBridge.exposeInMainWorld('accommodations', {
  data: { load, save, flush, revealFolder, pickFolder, chooseLocation,
          exportBackup, restoreBackup, onStatus, onExternalChange },
  pdf:  { export: (kind, payload) => …, print: (kind, payload) => … },
  app:  { getInfo },
});
```

### Network kill switch — `electron/security.js`

This is the demonstrable enforcement of "never touches the network." Point district IT at these lines:

- CSP on every response: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; frame-src 'none'`
- `session.defaultSession.webRequest.onBeforeRequest` → cancel any scheme that isn't `file:`, `devtools:`, or `blob:`
- `setPermissionRequestHandler((_w, _p, cb) => cb(false))` — deny everything
- `setWindowOpenHandler(() => ({ action: 'deny' }))`, and block `will-navigate` to any non-`file:` URL

Renderer loads via `loadFile(path.join(RENDERER_DIR, 'index.html'))`, where `RENDERER_DIR` is `process.resourcesPath/dist-renderer` when packaged (same conditional as `bigchat\electron\main.js:713-715`).

---

## 6. PDF export — `webContents.printToPDF`

**Recommended over a bundled JS PDF library.** Both are offline-safe, so the decision is fit — and the deliverable _is_ a styled document with grouped tables, repeating headers, page breaks between students, and a signature block. Chromium already does that layout; with jsPDF you hand-compute y-offsets for a multi-page variable-height report. Zero new runtime dependency, `@page` / `break-inside: avoid` / `thead { display: table-header-group }` come free, and the print view is a real React route so preview and PDF are the **same code path**.

The one real cost is asynchrony. Render into a hidden `BrowserWindow` and don't call `printToPDF` until all three of `did-finish-load`, `document.fonts.ready`, and an explicit `print:ready` IPC ping from `PrintRoot` have fired. Fonts are bundled locally, so there is no font race against a network that doesn't exist.

```js
await win.webContents.printToPDF({
  pageSize: 'Letter', // Letter, not A4 — easy to get wrong
  landscape: kind === 'range',
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate,
  footerTemplate, // "Page X of Y" + compliance footer
  margins: { marginType: 'custom', top: 0.5, bottom: 0.5, left: 0.45, right: 0.45 },
});
```

Then `dialog.showSaveDialog` defaulting to `Accommodations_P1_2026-09-08_to_2026-09-16.pdf`, and offer `shell.openPath`. Also expose `webContents.print()` — schools print directly far more than they save.

**The print view shares zero markup with the board.** The kanban is an input surface; the report is a compliance document. Reusing board DOM for print is the classic mistake here.

- **Report (a) — date range × period × students, name-search filtered.** Landscape. Per period: accommodation rows × date columns with single-glyph statuses (`U`, `D`, `—`, `A`, `·`); then a per-student compliance summary (used / with-detail / not used / absent / N-A / no-record, plus delivery rate with absences excluded from the denominator); then a detail appendix reproducing every `used_with_detail` narrative and every daily note, dated.
- **Report (b) — single day, all students.** Portrait, one page per period. Also printable **blank** as a paper fallback when the laptop dies — genuinely appreciated in a classroom.

Both carry a header (teacher, school, room, plan-type counts, generated-at), a signature/date block, and a footer stating the data was read from a local file and not transmitted.

---

## 7. Auto-resolve / end-of-cycle logic

### One pure function, computed lazily, materialized on seal

`src/domain/resolve.js`:

```js
effectiveStatus(doc, date, studentId, assignmentId, now);
```

Precedence:

1. no `doc.days[date]` → **`no_record`**
2. weekend or non-instructional date → `not_applicable` (never a period — see above)
3. `day.students[sid].absent` → `absent`
4. `entry.status !== 'unassigned'` → that status
5. `day.sealed` → `not_used`
6. `date < today` → `not_used`
7. `date === today && now >= settings.cycleEndTime` → `not_used`
8. otherwise → `unassigned`

Both screen and paper read through this one function, so there is no clock-dependent divergence between them. Rules 6–7 mean the board shows "Not Used" the moment the cycle closes, before anything is written.

### When sealing fires

`sealDay(doc, date, now)` — pure, returns a new doc — invoked from exactly three places: **app startup** (every unsealed day before today), **`useDayRollover`** (a 60s tick crossing `cycleEndTime` or midnight), and the **Close Out Day** button. It stamps `not_used` + `resolvedBy: 'auto'` + `resolvedAt` on every still-`unassigned` entry, then sets `sealed`/`sealedAt`/`sealedBy`. Strict no-op on an already-sealed day (guarded and tested).

### The trap: never mass-manufacture "not used"

A teacher opens the app after three weeks off. A naive rollover marks 15 days × every student × every accommodation as "not used" — on paper, a catastrophic compliance failure the teacher never committed.

**`sealDay` therefore only ever touches days that already have a record in `doc.days`.** Dates with no record stay absent from the map, resolve to `no_record`, and print as "— no record —". _No data was recorded_ and _the accommodation was not delivered_ are different claims and the schema must never conflate them. **If one decision in this document is load-bearing, it is this one.**

### Freezing history

Sealed days render read-only. Changing one requires an explicit **Amend day** action that sets `amended: true`, appends `{ at, entryKey, from, to, reason, by }` to `amendments[]`, and leaves `sealed: true`. IEP records get audited; a silent retroactive edit is exactly what an auditor looks for, and an append-only amendment log is exactly what makes the record defensible. `copyFromPreviousDay` and auto-seal both refuse to touch a sealed day.

`settings.lastKnownDate` is written on every open. If the system clock moves **backwards** past it, warn and **never unseal** — a wrong BIOS clock or a district imaging event must not rewrite history.

### `copyFromPreviousDay` — default `structure`

- **`structure` (default)** — copies _which_ cards appear (respecting `activeFrom`/`activeTo`); statuses reset to `unassigned`; no details, no notes, no absent flags.
- **`full`** — also copies statuses and details. Behind a confirm dialog that says plainly what it does, and stamps `seedMode: 'full'` for provenance.

The default must be `structure`: copying yesterday's "Used" into today manufactures a record of delivery that did not happen.

---

## 8. Component design

```
<Board>                         ← single <DragDropContext>
  <BoardToolbar>                DatePicker · PeriodFilter · StudentSearch ·
                                CopyPreviousDayButton · CloseOutDayButton ·
                                ExportMenu · SaveStatusPill
  <BulkActionBar>               ← only when a selection exists
  <PeriodGroup>                 one per visible period
    <Swimlane>                  one per student
      <SwimlaneHeader>          ▸/▾ · name · plan pill · counts ──── MarkAbsentButton (far right)
      <SwimlaneBody>            CSS grid: 3 status columns + 1 notes column
        <StatusColumn status="unassigned" | "used" | "used_with_detail">
        <SwimlaneNotesCell>     ← LAST column. per-student, per-day. NOT on cards.
      <SwimlaneSummaryStrip>    ← replaces body when collapsed
```

**DnD wiring.** Droppable id `drop:{studentId}:{status}`; draggable id `card:{studentId}:{assignmentId}`. Critically, each swimlane's droppables take `type={`lane-${studentId}`}` — pangea then refuses to even highlight another student's columns mid-drag, enforcing "a card belongs to one student" at the library level rather than as a rejection branch in `onDragEnd`.

`onDragStart` sets `data-dragging="true"` on `<body>`; all drag visuals are BEM modifiers and attribute selectors. **No inline styles**, per bipbup's rule — the sole exception is pangea's own `provided.draggableProps.style`, which is the library's transform and unavoidable. Note it so a reviewer doesn't flag it.

**Dropping into "Used with Detail"** immediately opens `CardDetailPopover` with the textarea focused and `detailPrompt` as placeholder. Cancelling with an empty detail **reverts to the pre-drag status** — `used_with_detail` with no detail is a meaningless record.

**`CardStatusControl` — a three-button segmented control on every card, co-equal with dragging.** Drag is the requested affordance and should be excellent, but a teacher triaging 240 cards at 3:55pm will use buttons, and touchscreen and motor-impaired users need them. Ship both; the board remains a true drag-and-drop kanban.

**Collapse state lives in `localStorage`, not `data.json`** — the JSON is the compliance record, UI preferences do not belong in it. Keyed by student id, not by date.

**`SwimlaneNotesCell`** — textarea in the last grid column, `aria-label="Daily notes for {student}"`, debounced 500ms, with a saved-tick.

**`MarkAbsentButton`** — far right of the header. Toggles `absent`, optional reason (excused / unexcused / partial). The lane dims via `.acc-swimlane--absent`, columns become non-droppable, statuses are preserved but excluded from compliance math.

**Toolbar.** `DatePicker` is a native `<input type="date">` (offline, accessible, no dependency) plus a ◀ Today ▶ stepper that skips non-instructional dates. `StudentSearch` debounces 150ms against a normalized index built once per doc in `selectors.js` — case- and accent-folded, matching "First Last", "Last, First", and last-name prefix.

**Splash + onboarding.** `SplashLoader` ports `bigchat\js\src\preview\live-hud-main.js:1569-1593` — full-bleed overlay, faint inline SVG grid, pulsing status line driven by a direct port of `@keyframes marathon-loading-pulse` (`_marathon-live-hud.scss:284`), and a progress track/fill pair. Progress is **real**, not faked: it advances through resolve-location → load-file → migrate → normalize → build-index → first-paint.

`OnboardingFlow` ports `live-hud-main.js:1594-1632` — one container, `data-step` panels toggled with the `hidden` attribute plus `[hidden] { display: none !important }`. Steps: `welcome → teacher → dataLocation → periods → roster → catalog → assign → done`. Each step is a thin wrapper over the corresponding `manage/` component, so onboarding and ongoing editing share one implementation. Gated on `settings.onboardingCompletedAt`; re-runnable from Settings.

### Bulk actions — the extensible layer

Capability is **data** (`bulkEligible` + `bulkActions[]` on catalog items, overridable per custom assignment). Behavior is a **registry** in `src/domain/bulkActions.js`:

```js
export const BULK_ACTIONS = [
  {
    id: 'mark_used',
    label: 'Mark Used for all visible students',
    appliesTo: (item) => item.bulkEligible && !item.requiresDetail,
    confirm: (ctx) => `Mark "${ctx.label}" as Used for ${ctx.targets.length} students?`,
    run: (ctx) => ctx.targets.map((t) => ({ op: 'setStatus', ...t, status: 'used' })),
  },
  // adding an object here makes it appear in the UI. that is the entire cost.
];
```

`run` returns **patches**, never mutates; the caller wraps a batch in one undo bundle so a mis-click is one Ctrl+Z. An action appears only for a card whose `bulkActions[]` lists its id **and** whose `appliesTo` passes. A catalog item like "Text read aloud" ships `bulkEligible: false` — "read aloud to 28 students identically" is not a claim a teacher should make in one click. That is the opt-out. Ships with `mark_used` only; **the shape is the deliverable**, per the "more on that later" note.

---

## 9. Build & packaging

**`package.json` scripts**

```jsonc
"dev":            "vite",
"build":          "vite build",
"electron:dev":   "npm run build && electron .",
"dev:electron":   "concurrently \"vite\" \"wait-on tcp:5180 && cross-env ACC_DEV_SERVER=http://localhost:5180 electron .\"",
"electron:build": "npm run build && electron-builder --win",
"test":           "vitest run",
"format":         "prettier --write ."
```

`electron:dev` is bigchat's build-then-run pattern (`package.json:39`) and is the reliable fallback; `dev:electron` adds renderer HMR.

**`vite.config.js`** — `base: './'` is mandatory (absolute `/assets/` paths 404 under `file://` and are the single most common cause of a blank packaged window). `build.outDir: 'dist-renderer'`, `css.preprocessorOptions.scss.api: 'modern-compiler'`, `server.port: 5180`. Use `@use`, never `@import`.

**`electron-builder.yml`** — mirrors bigchat's:

```yaml
appId: com.classroom.accommodations
productName: Accommodations Tracker
directories: { output: dist-electron }
files: [electron/**/*, package.json]
extraResources: [{ from: dist-renderer, to: dist-renderer, filter: ['**/*'] }]
asar: true
compression: maximum
win:
  target: [{ target: portable, arch: [x64] }]
  icon: build/icon.ico
  signAndEditExecutable: false
portable:
  artifactName: 'Accommodations-Tracker.exe'
  unpackDirName: false # deterministic unpack dir → much faster launch from USB
```

---

## 10. Testing — vitest

Everything in `src/domain/` is pure, synchronous, and takes `now` as an explicit parameter. That is _why_ the layer exists.

| Suite                 | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dates.test.js`       | Local date keys across DST boundaries (2027-03-14, 2026-11-01), midnight, year rollover, under `TZ=America/New_York` and `TZ=America/Anchorage`. Explicit assertion that no path calls `toISOString().slice(0,10)`.                                                                                                                                                                                                                                 |
| `schema.test.js`      | `normalizeDoc` repairs — missing arrays, unknown statuses, orphan entries, duplicate ids, `null` days. Must never throw; every repair reported.                                                                                                                                                                                                                                                                                                     |
| `migrations.test.js`  | Each `tests/fixtures/v{n}.json` → current. Idempotence. Forward-version refusal.                                                                                                                                                                                                                                                                                                                                                                    |
| **`resolve.test.js`** | Table-driven over the full precedence chain: before cycle end → `unassigned`; after → `not_used` **computed but not persisted**; sealed → `not_used` + `resolvedBy: 'auto'`; absent excluded from denominator; non-meeting weekday and holiday → `not_applicable`; **missing day → `no_record`, never `not_used`**; `sealDay` idempotent and non-mutating (deep-frozen input); amend appends and preserves `sealed`; backwards clock never unseals. |
| `seed.test.js`        | `structure` resets statuses; `full` stamps `seedMode`; expired `activeTo` excluded; never copies notes or absent flags; refuses a sealed target.                                                                                                                                                                                                                                                                                                    |
| `selectors.test.js`   | Search normalization (accents, "Last, First", prefix), period filter, stable sort, and **referential stability** so `React.memo` actually works.                                                                                                                                                                                                                                                                                                    |
| `bulkActions.test.js` | Ineligible items skipped; `appliesTo` respected; batch groups into one undo step; unknown id is a no-op.                                                                                                                                                                                                                                                                                                                                            |
| `report.test.js`      | Compliance math — absences and `no_record` excluded from the denominator; inclusive range boundaries; snapshot of the **report data model**, not DOM.                                                                                                                                                                                                                                                                                               |
| `data-paths.test.js`  | Pointer read/write; OneDrive/UNC pattern detection; writability probe failure modes; missing-folder recovery path.                                                                                                                                                                                                                                                                                                                                  |
| `data-store.test.js`  | Real tmp dir: rename failure leaves the original intact; `.tmp` recovery; recovery ordering; backup rotation; `EPERM` retry succeeds on attempt 2; mtime-conflict detection fires.                                                                                                                                                                                                                                                                  |

---

## 11. Phased order

| Phase                       | Scope                                                                                                                                                                                                                                                                                                                                                                       | Est. |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| **0 — Skeleton**            | Scaffold, all configs, `main.js` loading a hello-world React app from `file://`, CSP + network kill switch, `npm run electron:build` producing a working portable exe. **Ship a nothing-app on day one** — packaging and path resolution are where this class of project dies. Retire that risk first.                                                                      | 0.5d |
| **1 — Data layer**          | All of `src/domain/*` + the full vitest suite. `data-paths.js` (pointer, picker, sync detection), `data-store.js`, `data-lock.js`, IPC, preload, `DataContext`, `SaveStatusPill`. No board. Prove it: mutate, kill the process, reopen, data survives; corrupt the file, recover; run the exe from a USB stick and confirm the JSON lands in the profile, not on the stick. | 1.5d |
| **2 — Board MVP**           | Toolbar, swimlanes + collapse, three columns, cards, pangea DnD, `CardStatusControl`, detail popover, notes cell, absent toggle, past-day read-only. `_tokens.scss` + all BEM styles.                                                                                                                                                                                       | 2d   |
| **3 — Data management**     | Catalog, periods, roster, per-student assignments, custom one-offs. **Precedes onboarding** — onboarding is a wizard shell over these same forms.                                                                                                                                                                                                                           | 1d   |
| **4 — Cycle logic**         | `useDayRollover`, seal on startup/tick/button, sealed visuals, amend flow, copy-from-previous-day (both modes).                                                                                                                                                                                                                                                             | 0.5d |
| **5 — Bulk actions**        | Registry, capability flags, selection model, `BulkActionBar`, undo grouping.                                                                                                                                                                                                                                                                                                | 0.5d |
| **6 — PDF**                 | Print routes, print stylesheet, hidden-window `printToPDF`, export dialog, both reports, save + open-after-save, direct print. Budget iterations — pagination always takes longer than expected.                                                                                                                                                                            | 1.5d |
| **7 — Splash + onboarding** | CSS-keyframe intro loader, `data-step` stepper incl. the DataLocation step, `onboardingCompletedAt` gate, replay from settings.                                                                                                                                                                                                                                             | 1d   |
| **8 — Hardening / ship**    | Idle-lock screen, read-only banner, external-change detection, backup/restore UI, keyboard shortcuts, empty states, icon, README + a one-page printable teacher deploy guide, **smoke test from a real USB stick on a machine that is not the dev box**.                                                                                                                    | 1d   |

**≈9.5 focused days.**

---

## 12. Verification

**Per phase, run `npm test`** — the domain suite is the primary gate and should stay green from Phase 1 onward.

**End-to-end smoke, after Phase 8, on a non-dev machine:**

1. `npm run electron:build` → copy `dist-electron\Accommodations-Tracker.exe` to a USB stick.
2. Run it from the stick on a clean Windows account. Confirm the splash animation plays, then onboarding appears.
3. Complete onboarding with 2 periods, 4 students, 5 catalog items, 1 custom one-off. At the DataLocation step, confirm the OneDrive warning fires if Documents is redirected.
4. **Verify the stick contains no `data.json`** and that the file exists at the chosen profile path. Copy the app folder elsewhere and confirm the copy sees no data until onboarding runs.
5. Drag cards across all three columns; confirm a card cannot be dropped into another student's lane. Fill a detail on drop into "Used with Detail"; cancel one and confirm it reverts.
6. Type per-student notes; mark a student absent; confirm the lane dims and columns lock.
7. Kill the process from Task Manager mid-edit. Reopen — confirm the last change survived (400ms debounce) and no corruption.
8. Set the system clock forward past `cycleEndTime`, reopen, confirm unassigned entries show Not Used and the day seals. Set the clock **back** and confirm nothing unseals.
9. Jump to a date with no record. Confirm it shows and prints as "— no record —", **never** "Not Used".
10. Export both PDFs. Open in a real reader: check page breaks between students, repeating table headers, "Page X of Y", correct glyphs (fonts embedded), Letter sizing, and that the compliance rate excludes absences.
11. Search by first name, last name, "Last, First", and an accented name. Filter by period. Confirm results are correct and the board stays responsive.
12. With DevTools open, confirm **zero** network requests in the Network tab across the entire session.

---

## Risks

**Deployment — these can invalidate the product; verify on a real target machine during Phase 0, before building nine days of features.**

1. **OneDrive Known Folder Redirection.** School M365 tenants redirect Documents into OneDrive by default. Defaulting there would sync student PII to the cloud. Mitigated by the onboarding detection in §3 — but confirm the detection actually fires on a real district-joined machine.
2. **AppLocker / unsigned-exe policy.** Many districts block unsigned executables from user-writable paths outright. If blocked, the options are an OV/EV code-signing cert, an IT hash allowlist, or a different distribution shape — all of which change the schedule.
3. **SmartScreen** on an unsigned exe shows "Windows protected your PC" on first launch. Not fatal, but document the More info → Run anyway path or the teacher will assume the app is broken.

**Correctness**

4. **Mass "not used" manufacture** after a usage gap — mitigated by the `no_record` vs `not_used` distinction (§7). The one to get right.
5. **UTC date keys** producing off-by-one records — enforced by `dates.test.js` under multiple `TZ` values.
6. **Catalog rename rewriting history** — mitigated by `labelSnapshot`.
7. **AV `EPERM` on rename** during atomic write — retry loop.
8. **Laptop closed mid-edit** — 400ms debounce + flush on blur/suspend, not just on quit.

**Technical**

9. **pangea performance ceiling** ~500 draggables. 30 students × 8 accommodations = 240, comfortable; a 40-student study hall × 12 = 480 will feel sluggish. Mitigations: `React.memo` on cards, collapse-by-default past N lanes. Escape hatch is `@dnd-kit` + virtualization, a rewrite of the board layer only.
10. **React 19 StrictMode + pangea** — the fork fixed this, but if drag misbehaves in dev, test without StrictMode before blaming anything else.
11. **`printToPDF` font embedding** — bundle fonts under `src/assets/fonts/` and verify glyphs in a generated PDF.

---

## Deferred

- **Bulk action catalogue** beyond `mark_used` — per the user, "more on that later." The registry shape is built so each addition is one object literal.
- **At-rest encryption** — plaintext for now; the schema can later be wrapped in an encrypted envelope without touching the domain layer.
- **CSV roster import** — likely valuable in a second pass; not scoped here.
- **Per-period cycle end times** — the schema supports it via a small addition to `periods[]`; the current design is one rollover per school day.
