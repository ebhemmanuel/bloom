# Handoff: Settings modal redesign

## Overview
Redesign of the **Settings** modal in `accommodations-tracker` (Bloom). The current implementation (`src/components/shell/ProfileModal.jsx`) is a wide modal with a 200px left rail of four sections — You / School / Your day / Appearance — which over-splits seven fields (School is a 2-field page, Your day a 1-field page) and gives reminder preferences no home at all (they are set once in onboarding, then unreachable). The redesign adopts the **Add Student Wizard shell** (see `design_handoff_add_student_wizard/`) and consolidates to **three sections behind header tabs**: You · Your day · Appearance.

## About the Design Files
The files in this bundle are **design references created in HTML** (Design Component prototypes on `support.js`). They show intended look and behavior — they are NOT production code to copy. Recreate them in the app's existing environment: **React + SCSS/BEM**, consuming the existing `--acc-*` tokens from `src/styles/abstracts/_tokens.scss`. Every color/size below already exists as a token; use `var(--acc-*)`, never the raw hex.

- `Settings v2.dc.html` — the redesign. Open in a browser; all three tabs, chips, toggles and scene pick are interactive.
- `Settings (Current).dc.html` — recreation of today's ProfileModal, for before/after comparison.
- `support.js`, `fonts/` — prototype runtime + Inter/JetBrains Mono so the files open standalone. Ignore for implementation.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and motion all come from the app's token map and the shipped Add Student Wizard. Recreate pixel-perfectly with existing partials (`_controls.scss` chips/buttons, `_feedback.scss` scrim/modal, `_header.scss` fields, `_motion.scss`).

## Container (shared with Add Student Wizard)
- Same portalled `Scrim` (`--acc-scrim` rgba(42,36,56,0.28) + `blur(18px) saturate(1.1)`).
- Dialog: `width:min(900px,96vw); height:min(660px,92vh)`; flex column; `--acc-surface` #ffffff; radius `--acc-radius-xl` 20px; `--acc-shadow-overlay`. Fixed height so sections swap inside a stable frame (unlike current auto-height modal). No modal title, no header border.
- Three zones: header (tabs + close ×), scrollable content (each section vertically AND horizontally centered via `margin:auto`), footer (top border `--acc-border` #e9e5f0).
- Section swap: mount animation `stepIn` — 260ms `cubic-bezier(0.16,1,0.3,1)` (`--acc-ease-entrance`/`--acc-dur-normal`), fade + 10px slide-up. Keep dismissal on the existing `useDismissAnimation` path; click-outside must NOT close once anything has been typed (existing rule).

## Header
- Padding 20px 28px 0; close `×` (19px, `--acc-fg-faint` #9a93a8, hover `--acc-fg`) right-aligned.
- **Tabs absolutely centered** (the wizard's dots, grown into labeled pills since settings is non-linear): gap 6px; each tab = 26px-tall pill, padding 0 12px, 12px type, with a 6px leading dot. Current: bg `--acc-accent-soft` #eeebfd, text `--acc-accent` #5b4bd6 at 600, dot #5b4bd6. Others: transparent bg, `--acc-fg-muted` #6b6480 at 500, dot `--acc-border-strong` #d6d0e2. 160ms color transitions. `role="tablist"`/`role="tab"` + `aria-selected`.

## Footer
- Padding 14px 28px; border-top #e9e5f0; `justify-content:space-between`; left is a 64px spacer (no Back — sections are not steps).
- Center: tip text absolutely centered (12px `--acc-fg-muted` at 0.65 opacity, nowrap). Per tab: "Everything here saves as it changes - close whenever." / "Applies from today. Sealed days never change." / "Changes the scene immediately."
- Right: primary "Done" pill (38px, `--acc-accent`, 600, shadow `0 4px 12px -4px rgba(91,75,214,0.4)`, hover `--acc-accent-hover` #6d5ee6). Settings save on change; Done only dismisses.

## Screens / Views

### Tab 1 — You  (consolidates current "You" + "School")
- Column max-width 620px, gap 24px, centered.
- H1 28px/600/1.25 "You, on the printed report"; sub 14px `--acc-fg-muted`: "Everything here is the header of every report you sign. None of it affects your totals."
- **Identity row**: label 12px/500 "What should we call you?"; `grid-template-columns: 1fr 180px 90px; gap:8px` — name input (44px tall, padding 0 16px, 15px, placeholder "Ms. Rivera"), school input (44px, 14px, placeholder "School"), room input (44px, 14px, placeholder "Rm"). All: border #e9e5f0, radius 8, hover border #d6d0e2, focus accent border + 3px #eeebfd ring.
- **Live print preview** hint (11px muted, updates as you type): `Prints as "{name} · {school}, Rm {room}" at the top of every report.` Falls back to "Ms. Rivera" when name is blank; school/room segments drop out when blank. (Persist via existing `updateTeacher` — displayName, school, room.)
- **50|50 split** below (wizard's step-2 layout): `grid-template-columns: 1fr 1px 1fr; gap:24px`; middle column is the 1px vertical gradient rule `linear-gradient(to bottom, transparent, #d6d0e2, transparent)`.
  - Left cell (right-aligned): label "What do you teach?"; 28px subject chips (`SUBJECT_OPTIONS` from `constants.js`; off = #fff bg / #e9e5f0 border / #6b6480 text; on = #eeebfd / #5b4bd6 border+text; `white-space:nowrap`); custom entries render as selected chips with a trailing `×` and toggle off on click; a 28×28 circular `+` chip opens an inline pill input (28px, accent border + 3px #eeebfd ring, placeholder "Journalism"; Enter adds + selects with case-insensitive dedupe, Esc cancels). Hint 11px: "Pick as many as you teach. Use + for anything not listed."
  - Right cell (left-aligned): label "Which grades?"; K–12 as 28px chips, `min-width:28px; justify-content:center`. Hint: "Used on the report header and for suggested catalogs - nothing else."

### Tab 2 — Your day  (consolidates cycle end time + reminders)
- Column max-width 680px, gap 24px.
- H1 "Your day"; sub: "When the day closes out, and what Bloom says to you along the way."
- **End of school day**: replaces the raw `<input type="time">` with the onboarding's one-tap chips — `CYCLE_END_OPTIONS` from `constants.js` (2:30 / 3:00 / 3:30 / 4:00 / 4:30 / 5:00) as **40px chips** (pill, padding 0 16px, 13px/500; same on/off colors as above), single-select. Hint (existing copy): "After this, anything still unassigned shows as Not Used. Today stays editable until the date rolls over." Persist via `updateSettings({ cycleEndTime })`.
  - A prototype tweak `dayEndControl: time-field` shows the plain 40px time input instead, if product prefers free entry.
- **Reminders** (NEW in settings — currently only settable during onboarding; `REMINDER_OPTIONS` + `settings.reminders` already exist in the domain): three full-width toggle rows, gap 8px. Row = border #e9e5f0 radius 8 padding 12px 14px, flex, gap 14px; on-state: border #5b4bd6, bg #faf8ff. Left: title 13px/500 + body 11px muted (exact copy from `REMINDER_OPTIONS` in `constants.js`). Right: switch — 36×20px pill track (#d6d0e2 off, #5b4bd6 on, 2px padding), 16px white knob, `translateX(16px)` when on, 160ms `--acc-ease-entrance`. The whole row is the button (`aria-pressed`). Group hint: "All off unless you turn them on. Nothing here is ever urgent." Persist via `updateSettings({ reminders })`.
  - Prototype tweak `showReminders: false` removes the group if scope should stay 1:1 with current settings.

### Tab 3 — Appearance
- Column max-width 680px, gap 24px.
- H1 "The scene behind the board"; sub: "Three weathers, same room. The board itself stays clean white on all of them."
- **Scene cards**: `grid repeat(3,1fr), gap 12px`. Card = padding 8, border #e9e5f0, radius 14 (`--acc-radius-lg`), column, gap 6. Selected: border `--acc-accent` + `box-shadow: 0 0 0 3px #eeebfd`; 160ms transitions.
  - Swatch 64px tall, radius 8, overflow hidden, showing the REAL scene gradient (per `_manage.scss .acc-bgpick__swatch`): Aurora/Drift = `--acc-aurora-page` gradient at `background-size:180% 180%`; Calm = the paler gradient (`#f4efff → #fdf3f7 → #faf6ee → #eff7f3 → #f0f2fd`, 115deg). Every swatch carries the three white mote dots via `::after` (see `_manage.scss`).
  - Name row: 12px/500 name + a 10px/600 `✓` in accent when selected. Hint 10px `--acc-fg-faint`: "The standard scene" / "Paler, on a slower cycle" / "Blooms pan as one" (from `BACKGROUND_STYLES` in `constants.js`).
- Section hint (existing copy): "Calm is the scene setup opens in, so the board arrives in the room you started in rather than changing it as it appears." Persist via `updateSettings({ backgroundStyle })`.

## Interactions & Behavior
- Tabs switch sections directly (no gating, no Back); the incoming section replays `stepIn`.
- Everything commits on change (existing `commit`/`mutate` pattern) — Done and Esc/×/scrim only dismiss. Keep: dirty forms are not dismissible by click-outside.
- All chips/toggles are real buttons with `aria-pressed`; keyboard operable; focus ring = accent border + 3px `--acc-accent-soft` (never remove).
- `readOnly` mode (browser preview): disable all inputs at opacity per existing convention.
- Reduced motion: `stepIn` falls back to a 120ms opacity fade per `_motion.scss`.

## State Management
`section ('you'|'day'|'look')`, `draft {displayName, school, room, subjects[], gradeLevels[]}`, `addingSubj/newSubj`, plus direct `doc.settings` reads/writes for `cycleEndTime`, `reminders{morning,details,weekly}`, `backgroundStyle`. Derived: `printLine`. Reuse `updateTeacher` / `updateSettings` from `src/domain/mutations.js` unchanged.

## Design Tokens (all existing in `_tokens.scss`)
accent #5b4bd6 · accent-hover #6d5ee6 · accent-soft #eeebfd · fg #2a2438 · fg-muted #6b6480 · fg-faint #9a93a8 · border #e9e5f0 · border-strong #d6d0e2 · surface-sunken #f3f0f8 · bg #faf8fc · scrim rgba(42,36,56,0.28) · aurora-page gradient · radius 8/14/20/999 · shadow-overlay · ease-entrance cubic-bezier(0.16,1,0.3,1) · ease-standard cubic-bezier(0.65,0,0.35,1) · dur-fast 160ms / dur-normal 260ms · type: Inter (28/600 section headings, 15 name input, 14 subs, 13 toggle titles + 40px chips, 12 labels/tabs/buttons, 11 hints, 10 card hints), tokens `CYCLE_END_OPTIONS` / `REMINDER_OPTIONS` / `SUBJECT_OPTIONS` / `GRADE_OPTIONS` / `BACKGROUND_STYLES` from `src/domain/constants.js`.

## Assets
None beyond the repo's own fonts. No icons — ×/+/✓/dots are unicode or drawn shapes, per app convention.

## Files
- `Settings v2.dc.html` — the redesign (all three tabs + tweaks `dayEndControl`, `showReminders`)
- `Settings (Current).dc.html` — current-state recreation for comparison
- `support.js`, `fonts/` — prototype runtime only
