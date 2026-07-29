# Handoff: Day Notes dialog (staged redesign)

## Overview
Redesign of the **Day notes** dialog in `accommodations-tracker` (`src/components/shell/DayNotesPanel.jsx` + `src/styles/components/_day-notes.scss`). The current 520px auto-height card is cramped; this redesign restages it on the same frame grammar as the Add Student Wizard handoff (`design_handoff_add_student_wizard/`): a fixed 720×640 white frame over the scrim, vertically centered content with a 28px heading, a large writing surface, and a footer with a centered tip and a primary pill. The report-an-absence flow is promoted from an inline expander to its own view that swaps inside the stable frame, like a wizard step.

## About the Design Files
The files in this bundle are **design references created in HTML** (a Design Component prototype on `support.js`). They show intended look and behavior — they are NOT production code to copy. Recreate in the app's existing environment: **React + SCSS/BEM**, consuming the existing `--acc-*` tokens from `src/styles/abstracts/_tokens.scss`. Every color/size below already exists as a token; use `var(--acc-*)`, never the raw hex.

- `Day Notes v2.dc.html` — the redesign. Open in a browser: type notes (Saved flash), click "Report an absence", pick a chip, submit, Undo.
- `support.js`, `fonts/` — prototype runtime + Inter/JetBrains Mono so it opens standalone. Ignore for implementation.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and motion all come from the app's existing token map. Recreate pixel-perfectly with existing partials (`_controls.scss` buttons/chips, `_feedback.scss` modal/scrim).

## Container
- Same portalled `Scrim` (`--acc-scrim` rgba(42,36,56,0.28) + `blur(18px) saturate(1.1)`), existing `useDismissAnimation`/`usePopoverDismiss` paths unchanged.
- Dialog: `width:min(720px,96vw); height:min(640px,90vh)`; flex column; `--acc-surface` #ffffff; radius `--acc-radius-xl` 20px; `--acc-shadow-overlay` (0 12px 32px -8px rgba(42,36,56,0.28)); overflow hidden; entrance `stepIn` 260ms cubic-bezier(0.16,1,0.3,1) (fade + 10px slide-up).
- Three zones: header (close × only — **no title, no bottom border**), scrollable content (view centered vertically AND horizontally via `margin:auto`, max-width 560px, padding 32px), footer (top border `--acc-border` #e9e5f0, padding 14px 28px).
- **Fixed height** so the two views swap inside a stable frame.

## Screens / Views

### View 1 — Notes (default)
Content column gap 20px, each view mounts with `stepIn`:
- H1 28px/600/1.25, **centered**: "What should tomorrow-you know?"
- Sub 14px `--acc-fg-muted` #6b6480, centered, `text-wrap:balance`: "Prep, reminders, where the day left off - a private note for your eyes only."
  - ⚠ Copy decision: subs must NOT be referenced as readers (legal — subs don't have access to accommodations). The production copy "For a sub, or for tomorrow-you…" in `DayNotesPanel.jsx` should be replaced with this teacher-only framing.
- **Textarea** (the room to write): width 100%, min-height 190px, rows 7, padding 16px 18px, radius 12, 15px/1.6. Resting: `--acc-surface-sunken` #f3f0f8 fill, transparent 1px border. Focus: white bg, border `--acc-accent` #5b4bd6, `0 0 0 3px` #eeebfd ring. Transitions 160ms. Placeholder "Handoff notes, prep for tomorrow…" (#9a93a8). Autofocus.
- **Context row** directly under the textarea (min-height 16px): date eyebrow **centered** — 11px/600 uppercase 0.08em `--acc-fg-faint` #9a93a8: "Day notes · Today, Tue, Jul 28" (use existing `relativeDayLabel` + `formatDateMedium`). "Saved" flash absolutely right-aligned in the same row (11px `--acc-status-used` green #2f7d63), debounced 500ms, visible 1400ms — existing autosave behavior unchanged.
- **Reported box** (only when an absence is recorded): sunken #f3f0f8, radius 8, padding 14px 16px; text 12px muted 1.5 "Absence noted — {reason}{: text}. This prints in the report header, so whoever reads the record knows why entries are thin."; right-aligned quiet **Undo** pill (26px, 11px/500, hover white bg). Undo removes the record AND the appended notes line (existing `clearTeacherAbsence` behavior).

### View 2 — Report an absence
Content column gap 24px:
- H1 28px/600: "What happened?" Sub 14px muted: "This appends a line to the day notes and flags the day in the report header, so a thin day carries its own explanation."
- **Reason chips** row (wrap, gap 8px), one selected: 40px pill, padding 0 16px, 13px/500. Off: #fff bg / #e9e5f0 border / #6b6480 text. On: #eeebfd bg / #5b4bd6 border+text. 120ms transitions. Reasons from `TEACHER_ABSENCE_REASONS`: Out sick / TDY / Left early / Sub covered.
- **Detail input**: 44px, padding 0 16px, radius 8, 14px; placeholder "Anything to add? (optional)"; focus accent border + 3px ring; Enter submits.

## Footer (both views)
`justify-content:space-between`, tip **absolutely centered** (12px #6b6480 at 0.65 opacity, nowrap):
- Notes view: left quiet pill **"Report an absence"** (32px, 12px/500, muted, hover #f3f0f8; hidden once an absence is recorded — Undo lives in the box); tip "Saves as you type · Prints on today's report" (or "The reason is on record for today's report." when reported); right primary **"Done"** (closes — notes already autosaved).
- Report view: left quiet **"Back"** (returns without recording, clears detail); tip "Back keeps your notes untouched."; right primary **"Add to notes"**.
- Primary pill: 38px, padding 0 20px, `--acc-accent` #5b4bd6, white 12px/600, radius 999, shadow `0 4px 12px -4px rgba(91,75,214,0.4)`, hover #6d5ee6.

## Interactions & Behavior
- View swap: unmount/mount with `stepIn` 260ms cubic-bezier(0.16,1,0.3,1) — the frame does not resize.
- Submit: run existing `reportTeacherAbsence(d, dateKey, reason, detail)` — appends `Absence — {reason}: {text}` to the notes, records `{reason, text}`, derives the notification. Return to Notes view, flash Saved, and **scroll the reported box into view** if the column overflows (set scroller scrollTop to max).
- Autosave: existing debounce + flush-on-unmount logic in `DayNotesPanel.jsx` unchanged.
- Escape / × / scrim-click dismiss through `useDismissAnimation`. In the prototype × and Done just close; in the app both call the existing dismiss.
- Locked days (`readOnly || sealed`): textarea disabled, report entry hidden — existing rules.
- **Variant** (prototype tweak `absenceEntry: inline`): the report entry renders as a bordered quiet pill under the notes column (above a top border), instead of in the footer — if product prefers the entry near the writing surface.

## State Management
`view ('notes'|'report')`, `draft`, `saved`, `reason`, `detail`; absence record read from the day model as today. No new domain state.

## Design Tokens (all existing in `_tokens.scss`)
accent #5b4bd6 · accent-hover #6d5ee6 · accent-soft #eeebfd · fg #2a2438 · fg-muted #6b6480 · fg-faint #9a93a8 · border #e9e5f0 · border-strong #d6d0e2 · surface-sunken #f3f0f8 · status-used/success #2f7d63 · scrim rgba(42,36,56,0.28) · radius 8/12/20/999 · shadow-overlay · type: Inter (28/600 heading, 15 textarea, 14 sub, 12 tips+buttons, 11 eyebrow+hints).

## Assets
None beyond the repo's own fonts (`fonts/`). No icons — × is unicode, per app convention.

## Files
- `Day Notes v2.dc.html` — the redesign (both views + inline variant tweak)
- `support.js`, `fonts/` — prototype runtime only
