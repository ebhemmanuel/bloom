# Handoff: Print Report (stepped view redesign)

## Overview
Redesign of the **Print report** modal in `accommodations-tracker` (`src/components/print/PrintReportModal.jsx`, rendered inside `src/components/shared/Modal.jsx`). The current 560px modal packs scope cards, period chips, the summary line and three actions into one cramped body. This redesign moves it onto the same near-full-screen 3-step frame as the Add Student Wizard handoff: **Coverage -> Periods -> Review & print**, with progress dots, one question per step, per-step footer tips, and a review card that shows exactly what reaches the paper before it prints.

## About the Design Files
The files in this bundle are **design references created in HTML** (Design Component prototypes on `support.js`). They show intended look and behavior - they are NOT production code to copy. Recreate them in the app's existing environment: **React + SCSS/BEM**, consuming the existing `--acc-*` tokens from `src/styles/abstracts/_tokens.scss`. Every color/size below already exists as a token; use `var(--acc-*)`, never the raw hex. No em-dashes and no exclamation marks in copy, per CLAUDE.md.

- `Print Report v2.dc.html` - the new design. Open in a browser to click through all 3 steps, range validation, period selection, review card and the saved state.
- `Print Report (Current).dc.html` - static recreation of today's modal, for before/after comparison.
- `support.js`, `fonts/` - prototype runtime + Inter/JetBrains Mono so the prototypes open standalone. Ignore for implementation.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and motion all come from the app's existing token map. Recreate pixel-perfectly with existing partials (`_controls.scss` buttons/chips, `_feedback.scss` scrim, `_header.scss` fields, `_menubar.scss` printopts where reusable).

## Container
- Same portalled `Scrim` (`--acc-scrim` rgba(42,36,56,0.28) + `blur(18px) saturate(1.1)`).
- Dialog: `width:min(900px,96vw); height:min(660px,92vh)`; flex column; `--acc-surface` #ffffff; radius `--acc-radius-xl` 20px; `--acc-shadow-overlay`. Fixed height (unlike the current auto-height modal) so steps swap inside a stable frame.
- Three zones: header (dots + close, **no title, no bottom border**), scrollable content (each step vertically AND horizontally centered via `margin:auto`), footer (top border `--acc-border` #e9e5f0). Footer is hidden on the saved state.

## Header
- Padding 20px 28px 0; close `×` (19px, `--acc-fg-faint` #9a93a8, hover `--acc-fg`) right-aligned.
- Progress dots absolutely centered: 3 dots, gap 8px. Current = 22×6px pill `--acc-accent` #5b4bd6; completed = 6px circle #b7a6f4 (`--acc-petal-1`), clickable to jump back; upcoming = 6px circle `--acc-border-strong` #d6d0e2, not clickable. Width/color transition 260ms `cubic-bezier(0.16,1,0.3,1)` (`--acc-ease-entrance`/`--acc-dur-normal`).

## Footer
- Padding 14px 28px; border-top #e9e5f0; `justify-content:space-between`.
- Left: "Back" quiet pill (32px, 12px/500, `--acc-fg-muted`; hover `--acc-surface-sunken`), `visibility:hidden` on step 1 (64px min-width keeps layout stable).
- Center: tip text **absolutely centered** (12px `--acc-fg-muted` at 0.65 opacity, nowrap). Per step: "Everything so far is the safe default." / "Leave All periods selected for the full record." / "Nothing is uploaded - the file is written on this computer."
- Right, steps 1-2: "Next" primary pill (38px, `--acc-accent`, 600, shadow `0 4px 12px -4px rgba(91,75,214,0.4)`). Disabled (opacity .45) only when step 1 has an invalid range.
- Right, step 3: "Save as PDF" (38px pill, #fff bg, border `--acc-border-strong` #d6d0e2, 12px/500; desktop only - a browser tab cannot write a file, see `isDesktop` in `src/lib/bridge.js`) + "Print" primary pill ("Preparing…" while printing). Both disabled (opacity .45) while printing or when the range holds 0 school days.

## Screens / Views

### Step 1 - Coverage
- Content column max-width 620px, gap 20px, centered; heading block text-centered.
- H1 28px/600/1.25: "What should this report cover?" Sub 14px `--acc-fg-muted`/1.5: "The report is the printable compliance record: one page per student, dates down the page, a column for each accommodation."
- **Scope cards** (radiogroup, `grid 1fr 1fr, gap 12px`, full width): card = padding 24px 20px, radius 14, text-align left, column gap 6px. Off: border #e9e5f0, #fff bg. On: border `--acc-accent`, bg `--acc-accent-soft` #eeebfd. Hover (both): border accent. Transition 160ms `--acc-ease-standard`.
  - Titles 15px/600: "Everything so far" / "A range of dates".
  - Hints 12px `--acc-fg-muted`/1.45: "From your first record through today. At the end of the year this is the whole year, so there is no separate whole-year option." / "For a review meeting, a quarter, or a single week. Set the first and last day on the next line."
- When "A range of dates" is on, a row animates in below (same stepIn animation): two labeled date fields, label 12px/500 "From"/"To", input 40px tall × 200px wide, padding 0 12px, border #e9e5f0, radius 8, 14px; focus = accent border + 3px #eeebfd ring. `max`/`min` clamp against each other as in the current `PrintReportModal.jsx`.
- Under the fields: hint 11px muted "Weekends and non-instructional days are left out automatically." - replaced by 12px/500 `--acc-danger` #a33a30 "The end date is before the start date." when from > to.

### Step 2 - Periods
- Max-width 620px, heading text-centered.
- H1 "Which periods should it include?" Sub: "For a meeting about one class, narrow it to that period. This only changes what prints - every period stays in the record."
- **40px chips** (pill, padding 0 16px, 13px/500, nowrap, gap 8px, wrap, centered): "All periods" + one per period. Off = #fff bg / #e9e5f0 border / `--acc-fg-muted`; on = #eeebfd / #5b4bd6 border+text. Selection model matches the app: empty selection means All ("All periods" chip on); picking any period deselects All; toggling all off returns to All.
- Hint 11px muted: "Students outside the chosen periods are left off this report."
- If the roster has no periods, skip this step entirely (2 dots).

### Step 3 - Review & print
- Max-width 620px, heading text-centered.
- H1 "Ready to print". Sub: "Check the coverage - this is exactly what reaches the paper."
- **Review card** (full width, border #e9e5f0, radius 14, shadow `--acc-shadow-raised`, text left):
  - Header (padding 20px 24px 16px, column gap 4px): baseline row of range label 17px/600 (`formatRangeLabel(resolved.from, resolved.to)`) + edit affordance right (11px: muted word "Edit", then links **"Coverage ∘ Periods"** - hollow-circle divider = 5px ring, 1px #9a93a8 border; links 11px/500 `--acc-fg-muted`, hover `--acc-accent`; "Coverage" jumps to step 1, "Periods" to step 2). Meta line 12px muted below: "{N} school days · {N} students · {All periods | P1, P3}". Counts come from `schoolDaysIn` and `buildReport(...).students.length` in `src/domain/report.js`.
  - Body (top border, `--acc-bg` #faf8fc fill, padding 16px 24px 20px, gap 6px): label 12px/500 "What prints"; body 12px muted/1.5: "One page per student: dates down the page, a column for each accommodation, and the day's status shown by glyph and text so the sheet survives a monochrome photocopier. Each student closes with their totals; the record closes with a signature and date line."
- Zero-days warning (replaces nothing, appears below the card): 12px on `--acc-warning-soft` #fbf1e2 / `--acc-warning` #a06a2c, padding 12, radius 8: "There are no school days in this range, so there is nothing to print yet." Amber, never danger red - a fact, not a failure.

### Saved state (after Save as PDF succeeds)
- Replaces content, footer hidden: 44px circle `--acc-success-soft` #e4f4ed with ✓ in `--acc-success` #2f7d63; H1 24px/600 "Saved"; body 14px muted, max-width 460px, centered: "The PDF covering {range} was written next to your record file. Nothing left this computer." (In the app, show the real `result.path` and wire "Open it" to `pdfBridge.reveal(path)` as today.)
- Buttons: "Open it" (quiet 32px pill, nowrap) + "Done" (primary 38px, closes or returns to step 1).
- Save/print failure keeps the existing copy: "That didn't work ({reason}). Your records are untouched - try again, or use Print." as a 12px `--acc-danger` note on `--acc-surface-sunken` above the footer.

## Interactions & Behavior
- Step transitions: mount animation `stepIn` - 260ms `cubic-bezier(0.16,1,0.3,1)`, fade + 10px slide-up.
- Dots: completed dots navigate back; never forward past the current step.
- Gating: step 1 Next disabled only on an invalid range; step 3 Print/Save disabled while printing or when `schoolDaysIn` returns 0.
- Print path unchanged from `PrintReportModal.jsx`: portal-mount `PrintReport`, two `requestAnimationFrame`s, then `pdfBridge.print({landscape:false})` / `pdfBridge.export({from, to, landscape:false})`. Portrait stays portrait - dates run down the page.
- Escape/×/scrim-click dismiss through the existing `useDismissAnimation` path.

## State Management
`step (0-2)`, `kind ('todate'|'range')`, `from`, `to`, `scopePeriods[]` (empty = all), `printing`, `saved (path|null)`, `error`. Derived: `resolved {from,to}` via `resolveScope`, `days` via `schoolDaysIn`, `report` via `buildReport`, `invalid`. Defaults as today: `from` = first recorded day, `to` = `todayKey()`.

## Design Tokens (all existing in `_tokens.scss`)
accent #5b4bd6 · accent-hover #6d5ee6 · accent-soft #eeebfd · fg #2a2438 · fg-muted #6b6480 · fg-faint #9a93a8 · border #e9e5f0 · border-strong #d6d0e2 · surface-sunken #f3f0f8 · bg #faf8fc · danger #a33a30 · warning #a06a2c/#fbf1e2 · success #2f7d63/#e4f4ed · petal-1 #b7a6f4 · scrim rgba(42,36,56,0.28) · radius 8/14/20/999 · shadows shadow-raised, shadow-overlay · motion ease-entrance cubic-bezier(0.16,1,0.3,1), ease-standard, dur-fast 160ms, dur-normal 260ms · type: Inter (28/600 step headings, 24/600 saved heading, 17/600 range label, 15/600 card titles, 14 subs, 12 labels+buttons+meta, 11 hints), JetBrains Mono unused here.

## Assets
None beyond the repo's own fonts. No icons - dots/×/∘/✓ are drawn or unicode, per app convention.

## Files
- `Print Report v2.dc.html` - the redesign (all 3 steps, validation, saved state; Tweaks props `initialStep`/`showSaved` preview any state)
- `Print Report (Current).dc.html` - current-state recreation for comparison
- `support.js`, `fonts/` - prototype runtime only
