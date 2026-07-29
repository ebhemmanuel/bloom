# Handoff: Accommodation presets modal restage

## Overview
Restage of the **Accommodation presets** modal in `accommodations-tracker` (Bloom). The current implementation (`src/components/manage/CatalogModal.jsx` on the shared auto-height `Modal`/`Scrim`) is a wide dialog with a title header, a search field in the header slot, a scrolling list, and starter sets folded under the list. The redesign adopts the app's **fixed-frame sheet grammar** (`src/styles/components/_sheet.scss`, shared with the Add Student Wizard, Day Notes v2 and Settings v2): a stable 900x660 white frame over the scrim, close-only header, 28px in-view heading, footer with a centered tip and a primary Done pill, and **starter sets promoted from the bottom expander to their own view** that swaps inside the frame like a wizard step.

## About the Design Files
The files in this bundle are **design references created in HTML** (Design Component prototypes on `support.js`). They show intended look and behavior; they are NOT production code to copy. Recreate them in the app's existing environment: **React + SCSS/BEM**, consuming the existing `--acc-*` tokens from `src/styles/abstracts/_tokens.scss`. Every color and size below already exists as a token; use `var(--acc-*)`, never the raw hex.

- `Accommodation Presets v2.dc.html` - the redesign. Open in a browser: search filters, typing something new shows the dashed add row, rename/archive per row, the archived fold, and "Browse starter sets" swaps to the second view.
- `Accommodation Presets (Current).dc.html` - recreation of today's CatalogModal, for before/after comparison.
- `support.js`, `fonts/` - prototype runtime + Inter/JetBrains Mono so the files open standalone. Ignore for implementation.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and motion all come from the app's token map and the shipped sheet grammar. Recreate pixel-perfectly with existing partials (`_sheet.scss` frame/footer, `_controls.scss` buttons/chips/inputgroup/iconbtn, `_menubar.scss` catmod rows, `_manage.scss` starters).

## Container (the shared sheet)
- Same portalled `Scrim` (`--acc-scrim` rgba(42,36,56,0.28) + `blur(18px) saturate(1.1)`), existing `useDismissAnimation` path unchanged.
- Dialog: the `.acc-sheet__dialog--wide` frame - `width:min(900px,96vw); height:min(660px,92vh)`; flex column; `--acc-surface` #ffffff; radius `--acc-radius-xl` 20px; `--acc-shadow-overlay`; overflow hidden; entrance `stepIn` 260ms `cubic-bezier(0.16,1,0.3,1)` (fade + 10px slide-up). **Fixed height** so the two views swap inside a stable frame.
- Three zones: header (close x only, 19px `--acc-fg-faint`, padding 20px 28px 0 - no title, no border), content, footer (top border `--acc-border` #e9e5f0, padding 14px 28px).

## Screens / Views

### View 1 - Presets (default)
Column max-width 680px, padding 32px 32px 16px, gap 20px. **The heading and search are pinned; only the list scrolls** (`flex:1; min-height:0; overflow-y:auto` on the list), so search never scrolls out of reach.
- H1 28px/600/1.25: "Accommodation presets". Sub 14px `--acc-fg-muted` #6b6480: "The shared list every student picks from. Renaming one updates it everywhere it is used, and archiving never deletes anything."
- **Search** (one field for both jobs, per current behavior): 44px pill (radius 999), padding 0 18px, 14px, border #e9e5f0, hover #d6d0e2, focus accent border + 3px #eeebfd ring; placeholder "Search, or type a new one..."; autofocus. Enter adds the typed wording when addable.
- **Rows** (anatomy unchanged from CatalogModal): min-height 48px, padding 8px 12px, radius 8, gap 10px, hover `--acc-surface-hover` #f7f4fb; archived rows at opacity 0.5.
  - Wording 13px, `flex:1`, `min-width:18ch`.
  - Category: real `<select>`, appearance none, 160x32, radius 8, border #e9e5f0, the shared Caret drawn over it (right 12px, pointer-events none). `CATEGORIES` from `constants.js`.
  - "detail" checkbox (whole label clickable, 32px tall, title "Requires a written detail each time"), accent-color #5b4bd6.
  - Usage count: 24px wide, centered, 11px `--acc-fg-faint`, tabular-nums.
  - Icon actions: 32px `acc-iconbtn` pencil + archive/restore (`RowIcons.jsx`), radius 8, title AND aria-label per production copy.
  - Rename swaps the row for an `acc-inputgroup` (32px pill, Save action; Enter saves, Esc cancels) - existing `renameCatalogEntry` behavior.
- **Add row** when the typed wording is not already a preset (checked against the WHOLE catalog): dashed #d6d0e2 border, radius 8, min-height 46px, accent text, 20px circle + on #eeebfd; hover fills #eeebfd with accent border. Runs `addCatalogEntry`.
- Empty results: "That one is already in your list." / "Nothing matches." (12-13px `--acc-fg-faint`).
- **Archived fold** at the end of the list (scrolls with it): border-top, 34px head with rotating caret + "Archived" + total (counted across the whole catalog, not the search results), nested rows with restore only.

### View 2 - Starter sets (promoted from the bottom expander)
Column max-width 680px, padding 32px, gap 24px, centered via `margin:auto`, own scroll.
- H1 "Add from a starter set". Sub: "The wordings that recur across most districts, so a usable list is one click away. A starting point, not a standard: the authoritative wording is whatever the student's own plan says."
- Six accordions (`STARTER_SETS` from `starterSets.js`), border #e9e5f0, radius 8: head padding 12px 14px with name 13px/500 + the set's domain hint 11px `--acc-fg-faint` stacked, right-aligned count "N not yet added" / "all added" 11px, +/- glyph chevron. Open body: sunken #f3f0f8, border-top, padding 12px; "Add all N" 26px quiet pill (nowrap); wrap chips (min-height 28px, pill, padding 4px 12px, 12px/500, `flex:none` so long wordings grow in height rather than clip). Chips and Add all run `addCatalogEntry`; already-present wordings are filtered out, so nothing duplicates.

## Footer (both views)
`justify-content:space-between`, 64px left spacer, tip absolutely centered (12px #6b6480 at 0.65 opacity, nowrap):
- Presets view: left quiet pill **"Browse starter sets"** (32px, 12px/500, hover #f3f0f8); tip "Saves as it changes · Renaming updates every student together"; right primary **"Done"**.
- Starters view: left quiet **"Back"**; tip "Adding skips anything already in your list."; right primary **"Done"**.
- Primary pill: 38px, padding 0 20px, `--acc-accent` #5b4bd6, white 12px/600, radius 999, shadow `0 4px 12px -4px rgba(91,75,214,0.4)`, hover #6d5ee6. Everything commits on change (existing `mutate` pattern); Done and Esc/x/scrim only dismiss.

## Interactions & Behavior
- View swap: unmount/mount with `stepIn` 260ms `cubic-bezier(0.16,1,0.3,1)`; the frame does not resize.
- Keep every existing domain behavior unchanged: `renameCatalogEntry` (moves every student together), `setCatalogArchived` (never deletes), `updateCatalogEntry` (category; `requiresDetail` also flips `bulkEligible`/`bulkActions` - a narrative accommodation is never a one-click bulk claim), `addCatalogEntry` (dedupes by wording).
- Add-typed compares against the whole catalog, archived included, so an archived wording is never silently duplicated.
- `readOnly` mode: disable all inputs at the existing opacity convention.
- Reduced motion: `stepIn` falls back to the 120ms opacity fade per `_motion.scss`.
- Prototype tweaks: `showStarters:false` removes the starter-sets entry (scope 1:1 with today); `seedArchived:false` previews without the archived fold.

## State Management
`view ('list'|'starters')`, `query`, `renamingId`/`renameText`, `archivedOpen`, `openSet`. Usage counts come from the existing assignments selector (`usageCount` memo in CatalogModal). No new domain state.

## Design Tokens (all existing in `_tokens.scss`)
accent #5b4bd6 · accent-hover #6d5ee6 · accent-soft #eeebfd · fg #2a2438 · fg-muted #6b6480 · fg-faint #9a93a8 · border #e9e5f0 · border-strong #d6d0e2 · surface-hover #f7f4fb · surface-sunken #f3f0f8 · scrim rgba(42,36,56,0.28) · radius 8/20/999 · shadow-overlay · ease-entrance cubic-bezier(0.16,1,0.3,1) · dur-fast 160ms / dur-normal 260ms · type: Inter (28/600 view headings, 14 sub + search, 13 wordings, 12 tips/buttons/selects, 11 hints/counts).

## Assets
None beyond the repo's own fonts (`fonts/`). No icons beyond the existing `Caret.jsx` and `RowIcons.jsx` SVGs; x/+/- are unicode, per app convention.

## Files
- `Accommodation Presets v2.dc.html` - the redesign (both views + tweaks `showStarters`, `seedArchived`)
- `Accommodation Presets (Current).dc.html` - current-state recreation for comparison
- `support.js`, `fonts/` - prototype runtime only
