# Handoff: Bloom Onboarding v2

## Overview

A redesigned first-run onboarding for Bloom (`ebhemmanuel/accommodations-tracker`), replacing the current `OnboardingFlow.jsx`. It adds a cheerful animated intro that lands on the Bloom flower logo, presents the app's value quietly, then asks one question per screen — name (alone), subjects + grades, periods, day-end time + opt-in reminders — before an optional students-and-supports phase and a personalized outro that hands off to the board. Tone throughout: warm and quiet, no pressure.

## About the Design Files

The files in this bundle are **design references created in HTML** — a working prototype showing intended look and behavior, not production code to copy directly. The task is to **recreate this design in the app's existing React + SCSS environment** (`src/components/onboarding/`, `src/styles/`), reusing its established patterns (`acc-ob__*` classes, `_motion.scss` vocabulary, domain constants). `Bloom Onboarding v2.dc.html` runs in a browser via the bundled `support.js` runtime; treat that runtime as prototype plumbing only.

## Fidelity

**High-fidelity.** Colors, type, spacing, copy, and motion timings are final and should be recreated pixel-perfectly. All values below are exact.

## Flow (one question per screen)

`intro → welcome → name → teach (subjects+grades) → periods → day (end time + reminders) → set → roster ⇄ accom (per student) → outro → board`

Progress: 6 segments (26×3px, radius 999, on `#8f83e3` / off `#e5dff0`, 6px gap), centered at **bottom: 36px**. Hidden on intro/welcome/outro/board. Steps: name=1, teach=2, periods=3, day=4, set=5, roster/accom=6.

## Screens

### 1. Intro (logo reveal — no auto-advance)

- Full-viewport aurora over base `#faf8fc` (see Ambient below). Blob bloom-ins start at 150/400/650/900ms with `cubic-bezier(0.34, 1.4, 0.64, 1)`, 900ms.
- **Flower mark** 132×132 (viewBox 0 0 64 64): five ellipses (rx 9.5, ry 15, cy 17) rotated 0/72/144/216/288° around (32,32); fills `#b7a6f4`, `#f8aac9`, `#ffd39a`, `#96ddc1`, `#a9bcf7`. Petals pop in (scale 0.2→1 + fade, 640ms `cubic-bezier(0.34, 1.45, 0.64, 1)`) at 1250/1390/1530/1670/1810ms.
- **Center dot** r 7.5 `#5b4bd6`, "center pop" at 2120ms, 950ms, keyframed: 0% scale 0.2 → 45% scale 1.35 → 72% scale 0.92 → 88% scale 1.05 → 100% scale 1, each segment eased `cubic-bezier(0.45, 0, 0.55, 1)` (arrival segment `cubic-bezier(0.34, 0.8, 0.4, 1)`). Smooth, continuous — no hard stops.
- **Wordmark** "Bloom" 52px/600/-0.02em in lavender `#8f83e3`, enters at 3000ms; tagline "A calm record of the support you give." 16px `#6b6480` at 3400ms, 10px below the wordmark (grouped, gap 10px). Entrances are `acc-enter` (translateY 8px + scale 0.985 → identity, 700ms `cubic-bezier(0.16, 1, 0.3, 1)`).
- **CTA "Begin when you're ready"** (primary pill, below tagline, margin-top 12px) enters at 3800ms. The intro holds forever until pressed — it must never auto-advance.

### 2. Welcome ("Hi there.")

Centered 680px column, text-align center, gap 26px. Small flower (34px) + "BLOOM" eyebrow (15px/600, tracking 0.2em, uppercase, `#8f83e3`); h1 "Hi there." 44px/600/-0.015em `#2a2438`; lede 17px/1.65 `#6b6480` max 42ch: "Bloom is a calm place to keep a daily record of the support you give your students. A few quiet minutes at the end of the day."
Three detail cards (grid 3×1fr, gap 14px; bg `rgba(255,255,255,0.5)`, border 1px `rgba(255,255,255,0.7)`, radius 14, padding 18px 16px):

- "One board for the day" / "Move a card when support happens. That's the whole job."
- "Clean printed reports" / "Ready for IEP meetings, audits, and parent conferences."
- "Private by design" / "Everything stays on this computer. Nothing is ever sent anywhere."
  CTA: **"Continue"**. Staggered entrances at 150/300/480/660/840ms.

### 3. Name (solo — the only required field)

Glass card 560px (see Card below). Eyebrow "ABOUT YOU"; h2 "What should we call you?" 26px/600; sub 14px `#6b6480`: "However you'd like it to read on your printed reports, \"Ms. Rivera\" and \"Jordan\" are both fine."
Input 17px, padding 13px 16px, radius 10, border `#d6d0e2`, bg white; focus border `#5b4bd6` + ring `0 0 0 3px #eeebfd`. Placeholder "Ms. Rivera" (`#9a93a8`).
Once non-empty, a live report preview card reveals (white, border `#e9e5f0`, radius 8): label "ON YOUR PRINTED REPORTS" (10px/600, tracking 0.08em, `#b5aec4`) over "Bloom · Daily Accommodation Record · {name}" (12.5px, tabular-nums).
Footer: left hint "That's the only thing we need to start." (12px `#9a93a8`); right primary "Continue" — 45% opacity + default cursor until name is non-empty. Enter submits.

### 4. Teach (subjects + grades)

Glass card 620px. Eyebrow "YOUR CLASSROOM"; h2 "What do you teach, {name}?"; sub "Pick any that apply. These only personalize your reports — they're never used to score anything."
Subject chips from `SUBJECT_OPTIONS` in `src/domain/constants.js` (Mathematics, English / ELA, Science, Social Studies, Special Education, World Languages, Art, Music, Physical Education, Technology) + dashed free-entry pill "Something else…" (Enter adds). Grade chips `K–12` (min-width 38px, tabular-nums).
Chip anatomy (all selectable chips app-wide): 13px/500, padding 7px 14px, radius 999. Off: bg `rgba(255,255,255,0.75)`, ink `#6b6480`, border `#d6d0e2`. On: bg `#eeeafd`, ink `#5b4bd6`, border `#c9c0f2`. Hover border `#c9c0f2`; active scale 0.95.
Footer: ghost "Back" + primary "Continue" (never gated).

### 5. Periods (chips + optional rename)

Glass card 600px. Eyebrow "YOUR DAY"; h2 "Which periods do you see students?"; sub "Just the ones where you deliver accommodations. You can add or change these anytime." (This is accommodations delivery, NOT lesson planning.)
Chips P1–P8 (min-width 46px). When ≥1 selected, a rename list reveals: hint "Call them whatever you do out loud — optional." (12px/500 `#9a93a8`), then one row per selected period: "Period N" label (66px, 13px/600 `#5b4bd6`) + optional-name input (13px, radius 8, border `#e9e5f0`, bg `rgba(255,255,255,0.8)`; placeholder `e.g. "3rd Block"` on P3, "Optional name" otherwise). Persist to the periods model (`WEEKDAYS` meeting-days default all weekdays).

### 6. Day end + reminders

Glass card 620px. Eyebrow "YOUR RHYTHM"; h2 "When does your day usually end?"; sub "Bloom uses this to quietly close out the day. Nothing pings you at this time."
Time chips: 2:30 / 3:00 / 3:30 / 4:00 / 4:30 / 5:00, single-select, default **4:00** (`DEFAULT_CYCLE_END_TIME = '16:00'`).
Reminders section: title "Reminders, only if they help" (14px/500) + "You get enough pings already. These stay off unless you turn them on." (12.5px `#9a93a8`). Three toggle cards (radius 14; off bg `rgba(255,255,255,0.8)` border `#e9e5f0`; on bg `rgba(238,234,253,0.7)` border `#c9c0f2`; whole card is the button, `aria-pressed`), each with a 38×22 switch (track off `#d6d0e2` / on `#5b4bd6`; 18px white knob, left 2px→18px, 160ms):

- "A gentle morning check-in" / "One quiet note at the start of the day. Never urgent."
- "Details, before you close out" / "Only if a card says 'used with detail' and nothing's written yet." (wire to `detailsMissing` in `src/domain/notifications.js`)
- "A weekly recap" / "A short summary of the week, ready when reports are due."
  All default OFF.

### 7. All set

Centered glass card 540px, text-center. h2 "That's the paperwork done." 28px/600; summary pill (13px `#6b6480`, white/0.8 bg, border `#e9e5f0`, radius 999, tabular-nums): `{name} · {subjects (first 3)} · Grades {ranges, e.g. 3–5} · {n} periods · Day ends {time}`; body "Your students come next — names, plans, and their supports. A few minutes, or later. Both are fine."
Buttons: primary "Add my students" + ghost "Later — open my board" (goes straight to outro).

### 8. Roster

Glass card 640px. Eyebrow "YOUR STUDENTS"; h2 "Who are you supporting?"; sub "Names or initials — whatever you'd write on a sticky note. Add one, add all, or stop anytime."
Add row: name input (placeholder "e.g. J.M. or Jordan M.", Enter adds) + plan chips IEP/504/Other (single-select, `PLAN_TYPES`) + primary "Add" (45% opacity until non-empty).
Student rows (white/0.8, border `#e9e5f0`, radius 14, padding 12px 16px): 34px initials avatar (bg/ink pairs cycling: `#eeeafd`/`#5b4bd6`, `#fbe3ee`/`#b0487f`, `#e2f3ea`/`#3d8b68`, `#fdeedd`/`#a06a2c`, `#e4e9fd`/`#4a5cc4`); name 14px/600 + plan badge (10.5px/600 uppercase pill; IEP `#eeeafd`/`#5b4bd6`, 504 `#fbe3ee`/`#b0487f`, Other `#f0ede8`/`#8a7f6a`); count line "No supports chosen yet" / "N supports"; outline button "Choose supports"; `×` remove.
Footer: hint "You can also paste a whole list in from a spreadsheet later." + primary CTA — "Skip for now" when empty, "Open my board" once ≥1 student. Both go to outro.

### 9. Supports (per student)

Glass card 680px. Eyebrow "SUPPORTS · {NAME}"; h2 "What does {name} receive?"; sub "Start from the common wordings below. The plan's exact language wins — edit anything later to match it."
Six accordions, one open at a time (default: Presentation & instruction), sourced verbatim from `STARTER_SETS` in `src/domain/starterSets.js` (Presentation & instruction / Timing & scheduling / Setting / Response / Behaviour & regulation / Assistive technology, with their hints and items). Header: label 13.5px/600 + hint 12px `#9a93a8` + "N selected" pill (`#eeeafd`/`#5b4bd6`) when >0 + `▾` chevron (rotates 180°, 200ms). Items are multi-select chips (12.5px).
Below: selected custom chips (click removes, shows "label ×") + dashed input "Something specific to this student…" (Enter adds; preserve `requiresDetail` when mapping starter items to the catalog).
Footer: counter "Nothing chosen yet — that's fine" / "N supports chosen" + primary "Done" → back to roster.

### 10. Outro (finalize + handoff)

Triggered by any "open my board" action. Flower mark (96px) re-blooms: petals at 100/220/340/460/580ms, center pop at 800ms. h2 "One moment, {name}." at 400ms. Three status lines (14.5px `#6b6480`, 7px colored dot: `#b7a6f4`/`#f8aac9`/`#96ddc1`) enter at 1400/2000/2600ms:

1. "Saving your details"
2. "Seating N students" (or "Arranging your periods" if roster empty)
3. "Warming up your board"
   At ~3900ms the onboarding layer fades out (420ms `cubic-bezier(0.7,0,0.84,0)`) and the board loads. **The board entrance must be a cascade, not a flat load — see `SPEC — Outro to Board Handoff.md` in this bundle for the full choreography (cascade out → 250–350ms aurora beat → board cascade in, reduced-motion and interruptibility rules).**

## Ambient system (persists behind every screen)

- Base gradient sheet: `linear-gradient(115deg, #f4efff 0%, #fdf3f7 30%, #faf6ee 55%, #eff7f3 80%, #f0f2fd 100%)`, background-size 280%, position drifts 0%→100%→0% over 46s.
- Four blurred blobs (blur 80–110px, opacity 0.4–0.55): `#ffe7cf` 520px, `#d9dfff` 640px, `#ffd9e8` 660px, `#d2f2e6` 540px — each drifting on 22–30s loops.
- 8 rising "motes" (7–18px dots, colors `#c9c0f2` `#f6cade` `#bfe6d6` `#f7dfc2`, blur 1.5–5px) drifting up 34vh over 34–58s, breathing opacity 0.28↔0.6.
- Per-screen parallax: the whole blob field eases (900ms `cubic-bezier(0.65,0,0.35,1)`) to a slight translate/scale per step (e.g. name `translate(-3%,-2%) scale(1.05)`, outro `scale(1.12)`).

## Interactions & Behavior

- Screen transitions: exit `acc-exit` (opacity→0, translateY→-6px, 200ms `cubic-bezier(0.7,0,0.84,0)`), enter `acc-screen-in` (opacity 0/translateY 8px→identity, 320ms `cubic-bezier(0.16,1,0.3,1)`, 120ms delay). Within cards, children stagger `acc-enter` at 180/225/260/300ms.
- Hover/press: ALL interactive transitions run 220ms `cubic-bezier(0.4, 0, 0.2, 1)` (soft, never snappy); chip press-scale transforms 200ms `cubic-bezier(0.34,1.28,0.64,1)`.
- Focus: `0 0 0 2px #faf8fc, 0 0 0 4px #5b4bd6` ring on everything.
- Only the name gates progression. Every other step can be continued through empty.
- All state collected locally, committed once at the end (matches existing `OnboardingFlow.jsx` finish()).
- `prefers-reduced-motion: reduce`: collapse all animation durations/delays to ~0.

## State Management

`phase` (intro/welcome/name/teach/periods/day/set/roster/accom/outro), `leaving` (for exit anims), `name`, `subjects[]` (free entries allowed), `grades[]`, `periods[]` + `periodNames{}`, `endTime` (default '16:00'), `reminders{morning,details,weekly}` (all false), `students[] {id,name,plan,accoms[]}`, `editingId`, `openGroup`. On finish, write teacher profile + settings per existing `finish()` in `OnboardingFlow.jsx`, plus periods, cycle end time, reminder prefs, roster, and per-student catalog entries.

Note: the existing **data-location step** (`LocationStep`) is not in this design; keep its current "only when no folder is configured" behavior and slot it between `day` and `set` if required.

## Design Tokens

- Ink `#2a2438`; secondary `#6b6480`; muted `#9a93a8`; faint `#b5aec4`
- Accent `#5b4bd6`, hover `#6d5ee6`; lavender brand `#8f83e3`; accent wash `#eeeafd`, focus wash `#eeebfd`, accent border `#c9c0f2`
- Base bg `#faf8fc`; borders `#d6d0e2` (inputs) / `#e9e5f0` (cards)
- Petal palette: `#b7a6f4` `#f8aac9` `#ffd39a` `#96ddc1` `#a9bcf7`
- Glass card: bg `rgba(255,255,255,0.55)`, backdrop-blur 28px saturate 1.15, border 1px `rgba(255,255,255,0.7)`, radius 20, shadow `0 12px 32px -8px rgba(42,36,56,0.18)`, padding 52px 56px
- Primary button: `#5b4bd6` pill, 600 weight, shadow `0 4px 12px -2px rgba(91,75,214,0.35)`, active scale 0.98
- Radii: 20 card / 14 row-card / 10 input / 8 preview / 999 pill
- Type: Inter (400/500/600). h1 44, h2 26–28, wordmark 52, body 14–17, chips 13, hints/eyebrows 11–12 (eyebrows 600, tracking 0.08em, uppercase)

## Assets

No image assets. The Bloom flower mark is inline SVG (geometry above) — recreate as a shared component. Font: Inter via Google Fonts (weights 400/500/600).

## Files

- `Bloom Onboarding v2.dc.html` — the full prototype (markup + all logic in one file; `support.js` is its prototype runtime)
- `SPEC — Outro to Board Handoff.md` — motion spec for the outro→board cascade (phase 3 is not built in the prototype; engineer it per spec)
- `README.md` — this document
