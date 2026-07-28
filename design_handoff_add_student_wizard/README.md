# Handoff: Add Student Wizard (stepped redesign)

## Overview
Redesign of the **Add a student** modal in `accommodations-tracker`. The current single-screen form (`src/components/manage/AddStudentForm.jsx`, rendered inside `src/components/shared/Modal.jsx`) asks for everything at once and feels heavy. This redesign breaks it into a 4-step near-full-screen wizard — **Who → Class details → Accommodations → Review** — with progress dots, vertically-centered content, and a finalized profile card as the review step.

## About the Design Files
The files in this bundle are **design references created in HTML** (Design Component prototypes on `support.js`). They show intended look and behavior — they are NOT production code to copy. Recreate them in the app's existing environment: **React + SCSS/BEM**, consuming the existing `--acc-*` tokens from `src/styles/abstracts/_tokens.scss`. Every color/size below already exists as a token; use `var(--acc-*)`, never the raw hex.

- `Add Student Wizard.dc.html` — the new design. Open in a browser to click through all 4 steps, multi-student paste, both accommodation paths, and the success state.
- `Add Student (Current).dc.html` — static recreation of today's modal, for before/after comparison.
- `support.js`, `fonts/` — runtime + Inter/JetBrains Mono so the prototypes open standalone. Ignore for implementation.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and motion all come from the app's existing token map. Recreate pixel-perfectly with existing partials (`_controls.scss` buttons/chips, `_feedback.scss` modal/scrim, `_header.scss` fields).

## Container
- Same portalled `Scrim` (`--acc-scrim` rgba(42,36,56,0.28) + `blur(18px) saturate(1.1)`).
- Dialog: `width:min(900px,96vw); height:min(660px,92vh)`; flex column; `--acc-surface` #ffffff; radius `--acc-radius-xl` 20px; `--acc-shadow-overlay`. Fixed height (unlike current auto-height modal) so steps swap inside a stable frame.
- Three zones: header (dots + close, **no title, no bottom border**), scrollable content (each step vertically AND horizontally centered via `margin:auto`), footer (top border `--acc-border` #e9e5f0).

## Header
- Padding 20px 28px 0; close `×` (19px, `--acc-fg-faint` #9a93a8, hover `--acc-fg`) right-aligned.
- Progress dots absolutely centered: 4 dots, gap 8px. Current = 22×6px pill `--acc-accent` #5b4bd6; completed = 6px circle #b7a6f4 (`--acc-petal-1`), clickable to jump back; upcoming = 6px circle `--acc-border-strong` #d6d0e2, not clickable. Width/color transition 260ms `cubic-bezier(0.16,1,0.3,1)`.

## Footer
- Padding 14px 28px; border-top #e9e5f0; `justify-content:space-between`.
- Left: "Back" quiet pill (32px, 12px/500, `--acc-fg-muted`; hover `--acc-surface-sunken`), hidden on step 1 (keep a 64px spacer so layout doesn't shift).
- Center: tip text **absolutely centered** (12px `--acc-fg-muted` at 0.65 opacity, nowrap). Per step: "Only a name is needed to continue." / "Skip anything you do not know yet." / "N accommodations ready" or "You can skip this and add accommodations later." / "This writes the record and seeds today's board."
- Right: primary pill (38px, `--acc-accent`, 600, shadow `0 4px 12px -4px rgba(91,75,214,0.4)`): "Next" on steps 1–3; "Add student" / "Add N students" on step 4. Disabled (opacity .45) only when step 1 has no name (and optionally when accommodations are required but empty).

## Screens / Views

### Step 1 — Who
- Content column max-width 620px, gap 20px, centered in the frame.
- H1 28px/600/1.25: "What should this student be called?" Sub 14px `--acc-fg-muted`: "Whatever you'll recognise on the board and on a printed report. Initials or a code work fine - the file does not need a full legal name."
- **Input group with attached plan select**: wrapper `border:1px solid #e9e5f0; border-radius:8px; overflow:hidden; display:flex` (hover border `--acc-border-strong`). Input: borderless, flex:1, padding 14px 16px, 15px; placeholder "J. Alvarez, or JA, or Student 4"; autofocus; Enter advances.
- Select (right end): borderless, left border #e9e5f0, `appearance:none`, padding 0 32px 0 14px, 12px/600, custom 12px chevron SVG at `right 12px center`. **Background/text/chevron take the plan-pill colors**: IEP `--acc-plan-iep-soft` #e8eeff / `--acc-plan-iep` #3d5bbf; 504 `--acc-plan-504-soft` #f0e9fd / `--acc-plan-504` #6b4bb8; Other `--acc-surface-sunken` #f3f0f8 / `--acc-fg-muted` #6b6480.
- Hint 11px muted: "Paste a whole list, separated by commas or one per line, to add several students together."
- **Multi-student**: name field splits on commas/newlines (paste with newlines is intercepted and re-joined with ", " — see `readPastedNames` in `src/domain/importStudent.js`). When >1 name: sunken preview box (#f3f0f8, radius 8, padding 12) — "N students, each getting everything set in the next steps" + accent chips (28px pill, #eeebfd bg, #5b4bd6 border/text) per name.

### Step 2 — Class details
- Max-width 680px. H1 "Class details" + sub "Set what you know and skip the rest - all of this is editable later." — both **text-centered**.
- **True 50|50 split**: `grid-template-columns: 1fr 1px 1fr; gap:28px`. Middle column is a 1px vertical **gradient rule**: `linear-gradient(to bottom, transparent, #d6d0e2, transparent)`, stretched to row height.
- Left cell (right-aligned, `align-items:flex-end; text-align:right`): label 12px/500 "Which periods?"; period chips **40px tall** (pill, padding 0 16px, 13px/500; off = #fff bg / #e9e5f0 border / muted text; on = #eeebfd / #5b4bd6 border+text), multi-select; `+` chip 40×40 circle opens an inline pill input (40px, accent border + 3px #eeebfd ring; Enter creates+selects, Esc cancels — mirrors `addPeriod` in `src/domain/mutations.js`). Hint 11px: "Pick as many as this student is in. Use + to name a new period."
- Right cell (left-aligned): label "Newly enrolled?"; date input **40px tall** (radius 8, max-width 220px, focus = accent border + 3px ring). Hint swaps: blank → "Leave blank if they have been in this class since the start of the year."; set → "Every day before {date} stays locked and reads "not applicable - enrolled {date}" …" (existing copy in `AddStudentForm.jsx`).
- Matching 40px control heights makes both hints sit on the same baseline.

### Step 3 — Accommodations
- Max-width 680px. H1 "How do you want to add their accommodations?" ("Their accommodations" when multi). Sub: "The plan's wording is what counts - edit anything later to match what it actually says."
- **Chooser (default state)**: two cards, `grid 1fr 1fr, gap 12px`; card = padding 24px 20px, border #e9e5f0, radius 14, hover border #d6d0e2 + `--acc-shadow-raised`. Titles 15px/600 "Paste from the IEP" / "Pick from a starter set"; body 12px muted. Exactly **one** skip tip on this step and it lives in the footer.
- After choosing: back link "‹ Choose a different way" (12px muted, nowrap), then the chosen path:
  - **Paste path**: label + mono textarea (JetBrains Mono 12px, min-height 130px, radius 8); bracket-safety hint; live parse preview in a sunken box — "N accommodations found, M duplicate skipped" + rows of label (ellipsized) + tag (10px/600 uppercase 0.08em: NEW = #2f7d63 on #e4f4ed; ALREADY IN YOUR LIST = muted on white). Parsing: split on newlines and top-level commas only (commas inside `()`/`[]` are safe) — reuse `resolveAccommodationList` from `src/domain/importStudent.js`.
  - **Starter path**: the six starter sets from `src/domain/starterSets.js` as accordions (border #e9e5f0, radius 8; head 10px 12px with name 12px/500, hint 11px faint, chosen-count badge on `--acc-accent`, +/− chevron; body sunken #f3f0f8 with "Select all"/"Clear all" quiet pill and multi-line toggle chips; items with `requiresDetail` show a small "detail" suffix).
- Combined list = parsed ∪ picked, deduped case-insensitively (starter picks the paste already covers are dropped).
- A **tweak/variant** exists (`accomPicker: both-visible`) showing paste + starters stacked with no chooser, if product prefers that.

### Step 4 — Review (finalized profile card)
- Max-width 620px. H1 "Ready to add {name}" / "Ready to add N students". Sub: "This is how the record will look - every part stays editable from the board."
- **Profile card** (border #e9e5f0, radius 14, shadow `--acc-shadow-raised`):
  - Header (padding 20px 24px 16px, flex, gap 14px): 44px circle #eeebfd with initials in #5b4bd6 (first letters of up to two words; the count number when multi) · name 17px/600 + plan pill (20px, 11px/600; plan colors above) wrapping together · meta line 12px muted "P1, P3 · Start of year" (or "No periods yet" / "Enrolled {date}").
  - Header edit affordance (top right, 11px): muted word "Edit" then links **"Name ∘ Details"** — hollow-circle divider = 5px ring, 1px #9a93a8 border. "Name" jumps to step 1, "Details" to step 2; hover `--acc-accent`.
  - Multi: a chips row of all names below the header.
  - Accommodations section (top border, `--acc-bg` #faf8fc fill, padding 16px 24px 20px): label "N accommodations" + right-aligned "Edit" (→ step 3); items as white wrap-safe pills (inline-block, padding 5px 12px, radius 999, 12px/1.4); empty state 12px faint "None yet - add them any time from the board."
  - Multi footnote box (sunken): "Each of the N students gets this same setup, editable per student afterwards."

### Success state
- Replaces content (footer hidden): 44px circle `--acc-success-soft` #e4f4ed with ✓ in `--acc-success` #2f7d63; H1 24px "Added {names}"; body "…was added with N accommodations. Today's board is seeded and ready to record against."; buttons "Add another student" (quiet, resets) + "Done" (primary).

## Interactions & Behavior
- Step transitions: mount animation `stepIn` — 260ms `cubic-bezier(0.16,1,0.3,1)`, fade + 10px slide-up (the app's `--acc-ease-entrance`/`--acc-dur-normal`).
- Dots: completed dots navigate back; never forward past the current step.
- Only the name gates progression. Accommodations may be empty (review shows the empty state).
- On submit, run the existing domain flow unchanged: `addStudentWithAccommodations` per name → `backfillDays`/`backfillRange` → `ensureDay(dateKey)` (see the current `submit()` in `AddStudentForm.jsx`).
- Escape/×/scrim-click dismiss through the existing `useDismissAnimation` path.

## State Management
`step (0–3)`, `done`, `name`, `plan ('IEP'|'504'|'Other')`, `periodIds[]`, `addingPeriod/newPeriod`, `enrolledFrom`, `mode (null|'paste'|'starter')`, `paste`, `picked[]`, `openSet`. Derived: `names[]`, `parsed {items, duplicates}`, `combined[]`.

## Design Tokens (all existing in `_tokens.scss`)
accent #5b4bd6 · accent-hover #6d5ee6 · accent-soft #eeebfd · fg #2a2438 · fg-muted #6b6480 · fg-faint #9a93a8 · border #e9e5f0 · border-strong #d6d0e2 · surface-sunken #f3f0f8 · bg #faf8fc · plan-iep #3d5bbf/#e8eeff · plan-504 #6b4bb8/#f0e9fd · success #2f7d63/#e4f4ed · petal-1 #b7a6f4 · radius 4/8/14/20/999 · shadows shadow-raised, shadow-overlay · type: Inter (28/600 step headings, 17/600 card name, 15 inputs, 14 subs, 12 labels+buttons, 11 hints), JetBrains Mono 12 for paste.

## Assets
None beyond the repo's own fonts. No icons — chevron/×/+/∘ are drawn or unicode, per app convention.

## Files
- `Add Student Wizard.dc.html` — the redesign (all steps + variants)
- `Add Student (Current).dc.html` — current-state recreation for comparison
- `support.js`, `fonts/` — prototype runtime only
