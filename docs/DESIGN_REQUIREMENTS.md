# Accommodations Tracker - Design Requirements

**Status:** first pass, authored alongside the implementation scaffold.
**Audience:** a design agent or designer picking this up to refine and extend.
**Companion docs:** the implementation plan (architecture, data schema, phases). This document covers look, feel, motion, and screen-by-screen intent only.

---

## 1. What this product is, and who is on the other side of it

A fully offline Windows desktop app that teachers use to record, every school day, whether they delivered each student's IEP/504 accommodations. It is a legal compliance record. It prints to PDF and lands in front of case managers, parents, and occasionally auditors.

Three facts about the user should drive every design decision:

1. **They are tired.** Primary use is 3:45–4:15pm, after teaching all day. This is the last task before going home.
2. **They feel watched.** This is compliance paperwork about disabled children. The tool must never feel like it is scoring them, catching them out, or accusing them of failing a student.
3. **They are fast and repetitive.** Thirty students × six to eight accommodations = ~240 decisions, most days, most of them the same as yesterday.

The design answer to all three is the same: **be calm, be soft, be quick, and never be alarming.** The app should feel like a well-lit room, not a dashboard.

### The central tension - read this before designing anything

The requested aesthetic is soft, blurred, gradient-lit, and gently animated. That is exactly right for **arrival** surfaces - splash, onboarding, empty states, completion moments - where we are welcoming someone into an experience.

It is exactly wrong for **working** surfaces - the board mid-entry, and above all the printed PDF. A teacher scanning 240 cards needs edges, contrast, and stillness. An auditor reading a compliance report needs an austere document.

**So the system has two registers, and the design must hold both:**

| Register    | Where                                                 | Character                                                                                                                       |
| ----------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Ambient** | Splash, onboarding, empty states, dialogs, completion | Soft gradients, blur, generous space, cascading entrances, ambient drift                                                        |
| **Working** | Board, cards, toolbar, manage screens, print          | Calm and soft in _palette_, but crisp in _edge and contrast_. Motion is functional only. No ambient drift. No blur behind text. |

Both registers share one palette, one type scale, and one motion vocabulary. They differ in how much of it they spend. Getting this split right is the single most important thing about this design.

---

## 2. Design principles

1. **Soft, not vague.** Softness lives in color, radius, shadow, and motion - never in contrast or legibility. A pastel background with 3:1 text is a failure, not a mood.
2. **Nothing cuts.** No hard swap between screens, ever. Every transition is a crossfade with a small positional settle. See §4.
3. **Things arrive, they don't appear.** Elements cascade into place in reading order. But cascades are budgeted - see §4.4, because a 30-lane board that takes 1.4s to assemble is a bug, not a delight.
4. **Status is a fact, not a verdict.** "Not Used" is amber, never red. A student may have been absent, or simply not needed the support that day. The palette must never imply the teacher failed.
5. **The record is sacred, the chrome is not.** Anything representing recorded data is precise and high-contrast. Decoration is free to be atmospheric.
6. **Accessible by default, because of who this is about.** A tool documenting disability accommodations that is itself inaccessible is indefensible. See §9.

---

## 3. Color

### 3.1 Direction

Shift from the crisp blue-grey currently scaffolded to a **warm, low-saturation, violet-leaning neutral** base with pastel status accents. Think morning light on paper, not a SaaS dashboard.

Base neutrals carry a slight violet warmth so that white surfaces sitting on top read as luminous rather than grey.

### 3.2 Core palette (light - primary)

| Token                    | Value     | Use                                                         |
| ------------------------ | --------- | ----------------------------------------------------------- |
| `--acc-bg`               | `#faf8fc` | App background - warm near-white, faint lilac cast          |
| `--acc-surface`          | `#ffffff` | Cards, panels, lanes                                        |
| `--acc-surface-sunken`   | `#f3f0f8` | Column wells, inset areas                                   |
| `--acc-surface-hover`    | `#f7f4fb` | Hover                                                       |
| `--acc-surface-selected` | `#eeeafd` | Selection                                                   |
| `--acc-border`           | `#e9e5f0` | Default hairline - deliberately very soft                   |
| `--acc-border-strong`    | `#d6d0e2` | Emphasis, dividers                                          |
| `--acc-fg`               | `#2a2438` | Primary text - soft near-black, violet-tinted, never `#000` |
| `--acc-fg-muted`         | `#6b6480` | Secondary                                                   |
| `--acc-fg-faint`         | `#9a93a8` | Tertiary, placeholders                                      |
| `--acc-accent`           | `#5b4bd6` | Primary action, focus                                       |
| `--acc-accent-soft`      | `#eeebfd` | Accent fills                                                |

### 3.3 Status palette

Pastel fills with a darker paired ink for text, so every status chip clears 4.5:1 without losing the soft feel.

| Status           | Ink       | Fill      | Glyph (print) | Rationale                                                          |
| ---------------- | --------- | --------- | ------------- | ------------------------------------------------------------------ |
| Unassigned       | `#7a7391` | `#f2eff7` | `·`           | Neutral. Not yet triaged is not a problem.                         |
| Used             | `#2f7d63` | `#e4f4ed` | `U`           | Sage green. Calm, not celebratory.                                 |
| Used with Detail | `#5b4bd6` | `#eeebfd` | `D`           | Periwinkle. Ties to accent - this is the "richest" record.         |
| Not Used         | `#a06a2c` | `#fbf1e2` | `-`           | **Warm apricot, never red.** See principle 4.                      |
| Absent           | `#8a839a` | `#f4f2f7` | `A`           | Recedes. Excluded from compliance math.                            |
| No record        | `#b5aec4` | -         | `∅`           | Faintest thing on screen. Must read as "nothing here", not "zero". |

**`Not Used` and `No record` must be visually distinct at a glance.** Conflating them is the app's most serious possible failure - one means "we did not deliver", the other means "we have no data". Give them different fills _and_ different glyph weights.

### 3.4 Plan-type pills

| Plan | Ink       | Fill      |
| ---- | --------- | --------- |
| IEP  | `#3d5bbf` | `#e8eeff` |
| 504  | `#6b4bb8` | `#f0e9fd` |

### 3.5 The aurora palette - onboarding and splash only

The blurred gradient blobs. Five soft washes, used at low opacity behind heavy blur:

| Name       | Value     |
| ---------- | --------- |
| Blush      | `#ffd9e8` |
| Periwinkle | `#d9dfff` |
| Mint       | `#d2f2e6` |
| Apricot    | `#ffe7cf` |
| Lilac      | `#ebdcff` |

**Rules:** never more than three blobs visible at once; never behind body copy that must be read (put copy on a solid or heavily-scrimmed surface); never on the board, manage screens, or print.

### 3.6 Dark theme

Ship it, but as an explicit opt-in setting - not `prefers-color-scheme`. A teacher's OS theme is a personal preference; this app's default appearance is a deployment decision, and a classroom projector mirroring a dark board is a legibility problem. Dark values invert the neutrals to a warm charcoal (`#191621` base) and lift status inks to their pastel side.

---

## 4. Motion - the core of this brief

This is where the "welcoming and smooth" requirement is actually delivered. Treat this section as a specification, not a mood board.

### 4.1 Durations

| Token               | Value   | Use                                         |
| ------------------- | ------- | ------------------------------------------- |
| `--acc-dur-instant` | `90ms`  | Hover, checkbox, press feedback             |
| `--acc-dur-fast`    | `160ms` | Tooltips, chips, small state change         |
| `--acc-dur-normal`  | `260ms` | Element entrance, popovers, expand/collapse |
| `--acc-dur-slow`    | `420ms` | Screen transitions, modal in                |
| `--acc-dur-ambient` | `900ms` | Splash reveal, onboarding hero              |
| `--acc-dur-drift`   | `24s`   | Aurora blob drift loop                      |

Nothing a user _waits on_ exceeds 420ms. Ambient durations apply only to things happening around them, never in front of them.

### 4.2 Easings

| Token                 | Curve                               | Use                                                                                                                          |
| --------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `--acc-ease-entrance` | `cubic-bezier(0.16, 1, 0.3, 1)`     | Everything arriving. Long decelerating tail - this curve _is_ the "smooth" feel.                                             |
| `--acc-ease-exit`     | `cubic-bezier(0.7, 0, 0.84, 0)`     | Everything leaving. Accelerates away, gets out of the way fast.                                                              |
| `--acc-ease-standard` | `cubic-bezier(0.65, 0, 0.35, 1)`    | Moves between two on-screen states                                                                                           |
| `--acc-ease-settle`   | `cubic-bezier(0.34, 1.28, 0.64, 1)` | Gentle overshoot. **Onboarding gradient pop-in, card drop.** Use sparingly - overshoot everywhere reads as bouncy and cheap. |

Asymmetry is intentional: things enter slowly and leave quickly. That is what makes an interface feel gracious rather than sluggish.

### 4.3 The standard entrance

Every element that arrives on screen uses the same recipe unless stated otherwise:

```
from: opacity 0, translateY(8px), scale(0.985)
to:   opacity 1, translateY(0),   scale(1)
duration: --acc-dur-normal (260ms)
easing: --acc-ease-entrance
```

`translateY` is small on purpose. Large travel reads as a slide transition; 8px reads as _settling into place_.

### 4.4 Cascade (stagger) - and its budget

Siblings enter in reading order at **45ms intervals**.

**The budget rule, which matters more than the stagger itself:** total cascade time for any one group is capped at **400ms**. Past item #8, remaining items share the final step and arrive together.

Why this is non-negotiable: a teacher with 30 students opens the board every single day. At an uncapped 45ms stagger the board takes 1.4 seconds to assemble - delightful once, infuriating by Wednesday.

**Cascade applies:**

- Onboarding steps, splash, empty states, completion screens - generously
- Board first mount only - capped, once per session
- Modal and popover contents - first 4–6 items

**Cascade must NOT apply:**

- Search or filter results. Re-cascading on every keystroke reads as the app re-loading. Filtered-out lanes crossfade out over 160ms; survivors simply _stay put_. This is the most common way to get this wrong.
- Any card whose status the user just changed. It should move, not re-enter.
- Date changes on the board. Crossfade the lane contents; do not re-stagger 30 lanes.

### 4.5 Screen transitions - never a cut

Every screen-to-screen change (splash → onboarding, step → step, board → manage, board → export) is a crossfade with overlap:

```
outgoing: opacity 1→0, translateY(0 → -6px), 200ms, --acc-ease-exit
incoming: opacity 0→1, translateY(8px → 0),  320ms, --acc-ease-entrance, delayed 120ms
```

The 120ms delay against a 200ms exit gives an 80ms overlap - the two states are briefly co-present, which is what removes the sense of a jump. Never let the container collapse to zero height between states; reserve the height or animate it with the same curve.

Onboarding step-to-step additionally shifts the aurora field (§5.2), so forward motion is felt in the background even though the foreground only fades.

### 4.6 Ambient motion

The aurora blobs drift continuously on splash and onboarding: slow `translate` + `scale` loops, 18–30s each, **desynchronised periods** so the field never visibly repeats. Amplitude stays under 6% of viewport - perceptible only if you look for it.

Ambient motion stops entirely once the user reaches the board. Nothing moves on a working surface unless the user moved it.

### 4.7 Reduced motion - mandatory

Under `prefers-reduced-motion: reduce`:

- All transforms drop; opacity crossfades remain, shortened to 120ms
- Stagger goes to 0 - groups appear together
- Aurora drift stops; blobs render static
- Drag-and-drop keeps its position updates (they are functional, not decorative)

This is not optional politeness. Vestibular disorders are among the conditions this very app exists to accommodate, and shipping motion sickness in an accessibility tool would be indefensible.

---

## 5. Screen specifications

### 5.1 Splash / intro loader

The first thing anyone sees. Runs while the app resolves the data location, reads the file, migrates, normalises, and builds the search index - **progress is real, never simulated.**

**Sequence:**

| t     | Event                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------ |
| 0ms   | Warm near-white field. Nothing else.                                                                                     |
| 120ms | Aurora blob 1 (periwinkle) fades up over 900ms, blurred ~80px, and begins drifting                                       |
| 320ms | Blob 2 (blush) - same, offset position and drift period                                                                  |
| 520ms | Blob 3 (mint)                                                                                                            |
| 600ms | Wordmark fades + settles in (`--acc-ease-entrance`)                                                                      |
| 800ms | Progress track fades in beneath it                                                                                       |
| -     | Status line crossfades between real stages: "Finding your records" → "Opening" → "Checking for updates" → "Almost ready" |
| exit  | Everything fades out over 320ms as onboarding or the board fades in underneath                                           |

The progress fill eases with `--acc-ease-standard` between real values; it must never appear to stall, so hold a minimum 400ms per visible stage even on a fast machine.

**Minimum splash time: 1100ms.** Long enough to feel like an arrival, short enough that a teacher opening it for the 180th time doesn't resent it.

### 5.2 Onboarding

First run only. Re-runnable from Settings. This is where the aesthetic is spent most freely - it is the one moment the product gets to feel like a welcome rather than a duty.

**Layout:** single centred column, max ~560px, generous vertical rhythm, floating on the aurora field. Content sits on a translucent card with a soft scrim so text contrast never depends on where a blob happens to be.

**Step sequence:**

1. **Welcome** - hero moment. See below.
2. **About you** - name, subject(s), grade level(s). See below.
3. **Data location** - where the record file lives. See below; the trickiest step to get right.
4. **Periods** - class periods and which weekdays they meet.
5. **Roster** - students, plan type (IEP/504), which periods they're in.
6. **Catalog** - the accommodation list.
7. **Assign** - check which accommodations apply to which student.
8. **Done** - completion moment.

Steps 4–7 are thin wrappers over the same forms used in the Manage screens (§5.7), so they must be designed once and reused. Progress is shown as a slim segmented bar, not a numeric "Step 3 of 8" - the count is discouraging and the wizard is skippable-with-defaults anyway.

#### 5.2a Welcome - the individually popping gradients

The specific request, specified precisely.

Blobs enter **one at a time, not as a group** - that individual arrival is the whole effect:

| Order | Blob       | Delay  | Duration | Enters from                                                |
| ----- | ---------- | ------ | -------- | ---------------------------------------------------------- |
| 1     | Periwinkle | 200ms  | 1000ms   | scale 0.75 → 1, opacity 0 → 0.55, from lower-left          |
| 2     | Blush      | 560ms  | 1000ms   | scale 0.7 → 1, opacity 0 → 0.5, from upper-right           |
| 3     | Mint       | 920ms  | 1000ms   | scale 0.8 → 1, opacity 0 → 0.45, from lower-right          |
| 4     | Apricot    | 1280ms | 1000ms   | scale 0.75 → 1, opacity 0 → 0.4, centre-top, furthest back |

Each uses `--acc-ease-settle` so it arrives with a barely-perceptible overshoot - the "pop". Blur radius 70–110px, varied per blob. Each begins its independent drift loop the moment its entrance finishes.

Foreground copy cascades in **after** blob 2 lands (~1400ms), so the field is established before it is written on:

- Greeting - "Welcome" - 1400ms
- Subhead - one warm sentence about what this is for - 1490ms
- A single line reassuring that everything stays on this computer - 1580ms
- Primary button - "Let's get started" - 1670ms

Total to interactive: ~1.7s. That is a long time by app standards and correct here - it happens exactly once, and it sets the tone for a tool the teacher will use daily for a year.

**Copy tone:** warm, plain, second person, no exclamation marks, no emoji. "Let's set up your classroom" - not "Welcome aboard!"

#### 5.2b About you

Three questions, revealed **progressively** rather than as a wall of fields - each answered field cascades the next one in (260ms, standard entrance). This is what makes a form feel like a conversation.

| Field              | Type                            | Notes                                                                                                                                                                                                              |
| ------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Name**           | Text                            | "What should we call you?" Accepts "Ms. Rivera" or "Jordan" - do not split into first/last, and do not require a title. Appears on every printed report, so show a live preview of how it will read there.         |
| **Subject(s)**     | Multi-select chips + free entry | "What do you teach?" Offer common ones (Math, ELA, Science, Social Studies, Special Education, Art, Music, PE, World Languages) and let them type anything. Multi-select - secondary teachers routinely teach two. |
| **Grade level(s)** | Multi-select chips              | "Which grades?" K–12 as compact chips, plus a range drag/shift-click affordance. Multi-select.                                                                                                                     |

Chips animate on selection with a 90ms fill transition and a subtle scale settle - never a hard color flip.

Subject and grades are **not** used for compliance logic. They personalise the printed report header and let future versions suggest a relevant starting accommodation catalog. Say so, briefly, so the teacher understands why they're being asked.

#### 5.2c Data location - handle with care

Functionally the most important step and the one most likely to be designed badly.

The app must explain, without jargon and without alarm, that:

- The record file is created on **this computer**, not on the USB stick
- It never goes to the internet
- If the suggested folder syncs to OneDrive, that would send student information to the cloud - and offer a local-only alternative

Present as two or three **cards**, not a dropdown:

1. **Recommended** - a local-only folder. Selected by default.
2. **Documents** - familiar and easy to back up. **If OneDrive redirection is detected, this card gets a soft amber advisory** - informative, not a red error. Wording along the lines of: "This folder syncs to the cloud. Your students' information would be copied off this computer."
3. **Choose a folder** - opens the native picker.

The advisory uses the `Not Used` amber family, never the danger red. This is guidance, not a mistake the teacher has made.

#### 5.2d Done

A short completion moment: aurora blooms slightly brighter over 600ms, a summary settles in ("4 students · 2 periods · 6 accommodations"), and the primary button reads "Open my board". On press, the whole onboarding field fades out over 420ms as the board fades in beneath - the single longest transition in the app, because it is the only one that earns it.

### 5.3 The board - primary working surface

Jira-style kanban. One collapsible **swimlane per student**; columns are statuses; the **last column is that student's daily notes**.

```
┌─ Toolbar ─────────────────────────────────────────────────────────┐
│ ◀ Fri, Sep 16 ▶   [Period ▾]  [Search…]   Copy yesterday  Close out │
└───────────────────────────────────────────────────────────────────┘

┌─ Jordan A.  [IEP]  3 of 4 recorded ───────────────── [Mark absent] ┐
│ ┌ Unassigned ─┐ ┌ Used ───────┐ ┌ Used w/ Detail ┐ ┌ Notes ──────┐ │
│ │ ▢ card      │ │ ▢ card      │ │ ▢ card         │ │ (textarea)  │ │
│ │ ▢ card      │ │             │ │                │ │             │ │
│ └─────────────┘ └─────────────┘ └────────────────┘ └─────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

**Register: working.** Soft palette, but crisp edges, real contrast, no blur, no ambient drift.

**Lane header:** disclosure chevron (rotates 200ms), student name, plan pill, a quiet progress readout, and **Mark absent pinned far right**. Collapsed lanes replace the body with a one-line summary strip of status counts - collapse/expand animates height + opacity over 260ms with `--acc-ease-standard`.

**Columns:** sunken wells with generous internal padding. Column headers are `.acc-subhead` style - small, uppercase, tracked, muted. Show a live count per column.

**Cards:** white, `--acc-radius-md`, hairline border, `--acc-shadow-card`. Contents: accommodation label, a "one-off" badge where applicable, and a detail indicator. Nothing else.

**Status is changed by dragging the card, and only by dragging the card.** There is no per-card status widget - the whole card is the drag handle, exactly as a Jira card behaves. Grab it anywhere, drop it in a column. A click without movement opens the detail editor.

This is a fixed decision. An earlier draft of this document proposed a three-button segmented control on each card as a co-equal affordance; it was built, rejected, and removed. It cluttered the card and it is not what a kanban card does. Do not reintroduce it.

Accessibility does not depend on it: `@hello-pangea/dnd` gives the handle keyboard dragging (Space to lift, arrows to move, Space to drop) with live-region announcements - the same model Jira ships. Design the **lift** and **focus** states explicitly, since keyboard drag is a real path and needs to be legible without a pointer.

**Drag feel:** lift raises the card with `--acc-shadow-drag` and a 1.02 scale over 160ms; the source position collapses smoothly rather than snapping; the destination column tints with its status fill; drop settles with `--acc-ease-settle`. Cards can never be dropped into another student's lane, and the design should make that _unmistakable_ - non-target lanes desaturate slightly during a drag rather than showing a rejection state on drop.

**Absent state:** the lane body desaturates and drops to ~55% opacity over 260ms, columns become visibly inert. Recorded statuses stay visible - absence excludes a student from compliance math, it does not erase what was already noted.

**Sealed (past) days:** a distinct, calm read-only treatment - slightly sunken lane background and a small lock affordance. It should read as _settled_, not as _disabled_. Editing requires an explicit "Amend" action.

### 5.4 Toolbar

Persistent, `--acc-toolbar-h` (56px), sits on `--acc-surface` with a hairline bottom border and a shadow that only appears once content scrolls beneath it (200ms fade - a small touch that does a lot of work).

Date stepper with ◀ / ▶ and a native date input. **Changing date crossfades the lane bodies (200ms), it does not re-cascade the board.** Period filter as chips. Search debounced 150ms - and per §4.4, filtering must never re-stagger.

A save-status pill sits at the right: "Saved" in muted grey, a soft pulse while writing, an unmissable but non-panicky treatment on failure. It should be quietly reassuring - this is a teacher trusting an app with a legal record.

### 5.5 Card detail popover

Opens on drop into "Used with Detail", or on demand. Scales up from the card's own position (0.96 → 1, 200ms, `--acc-ease-entrance`) with a soft scrim fading behind it - it should feel like it grew out of the card, not like a dialog appeared.

Textarea autofocused, `detailPrompt` as placeholder. Cancelling with the field empty reverts the card to its pre-drag status, and that revert should be _animated back_ so the teacher sees what happened rather than finding the card mysteriously moved.

### 5.6 Notes column

Per student, per day - the last column in each lane. A borderless textarea that grows to lane height, with a soft focus ring and a debounced saved-tick that fades in and out over 160ms. Placeholder should invite rather than instruct: "Anything worth documenting about today?"

### 5.7 Manage screens - Catalog, Periods, Roster, Assignments

Working register. Calm, list-based, roomy. Rows enter with a capped cascade on first mount. Adding a row settles it in; removing collapses its height while fading - never a disappearing jump.

The **Assign** view is a student × accommodation matrix. At realistic sizes (30 × 15) this needs sticky headers and careful density work; it is the least glamorous and most-used-in-anger screen in the app, and deserves real design attention rather than a default table.

### 5.8 Export dialog

Two report types: **date range × period × students** (with name search), and **single day, all students**. Modal, scrim fades 200ms, panel settles in 260ms. Show a live preview thumbnail that updates as options change - teachers should never have to generate a PDF to find out what it looks like.

### 5.9 Print / PDF - the austere register

**Everything above is suspended here.** No gradients, no pastel fills, no soft greys, no aurora. This is a legal document that will be photocopied, faxed, scanned, and read at arm's length.

- Pure black on white. Hairline rules. Letter portrait (day sheet) / landscape (range report).
- Status as **glyphs plus text**, never color alone - it will be printed in monochrome.
- Repeating table headers across pages, no student split across a page break, "Page X of Y".
- Header carries teacher name, subject and grades (from §5.2b), school, room, date range, generated-at.
- A signature and date block.
- A footer stating the data was read from a local file and not transmitted.
- **"No record" must be visually unmistakable from "Not Used"** on paper, in monochrome, at photocopy quality. Test this on an actual photocopy.

### 5.10 Idle lock

After a configurable idle period the app veils itself - the board blurs behind a scrim (this is the one place blur over content is correct, because the content is deliberately unreadable) and the aurora returns softly. Dismiss fades the veil over 320ms. Purpose is shoulder-surfing in a classroom, not authentication.

### 5.11 Empty, loading, and error states

Ambient register - these are the moments to be warm.

- **Empty board** (no students yet): a soft illustration or aurora wash, one sentence, one action.
- **No record for this date**: must clearly say _nothing was recorded_, not _nothing was delivered_. This distinction is the most important line of copy in the entire product.
- **Errors**: amber-family, plain language, always with a next action. Never a raw stack trace, never a red modal. A teacher seeing an error about a compliance file is already anxious - the design's job is to lower that, not raise it.

---

## 6. Typography

| Role                              | Size                               | Weight |
| --------------------------------- | ---------------------------------- | ------ |
| Display (splash, onboarding hero) | 28–32px                            | 600    |
| Heading                           | 20px                               | 600    |
| Subhead (column headers)          | 11px, uppercase, `0.08em` tracking | 600    |
| Body                              | 14px                               | 400    |
| Card label                        | 13–14px                            | 500    |
| Sub / meta                        | 12px                               | 400    |
| Tiny / counts                     | 11px                               | 500    |

Stack: Inter → Segoe UI → system-ui. **Fonts must be bundled locally** under `src/assets/fonts/` - a Google Fonts link would break offline operation and violate the product's core promise. If a licensed display face is introduced for the splash and onboarding hero, confirm desktop-app embedding rights before it ships.

Tabular numerals everywhere counts appear.

---

## 7. Space, radius, elevation

Spacing scale: `0, 4, 8, 12, 16, 20, 24, 32, 48`.

Radii: `sm 4px` (chips, inputs) · `md 8px` (cards) · `lg 14px` (panels, lanes) · `xl 20px` (onboarding card) · `pill 999px`.

Slightly larger radii than the current scaffold - it is a meaningful part of the "soft" ask.

Elevation is soft and violet-tinted, never neutral grey-black:

```
card:    0 1px 2px rgba(42, 36, 56, 0.06)
raised:  0 4px 12px -2px rgba(42, 36, 56, 0.10)
overlay: 0 12px 32px -8px rgba(42, 36, 56, 0.18)
drag:    0 16px 32px -8px rgba(42, 36, 56, 0.24)
```

---

## 8. Component inventory for the design agent

Needed as designed states (default / hover / focus / active / disabled / error where applicable):

**Ambient:** aurora field · splash · onboarding shell + progress · welcome hero · chip multi-select · data-location cards · completion
**Working:** toolbar · date stepper · period filter · search · save pill · swimlane header · absent toggle · status column · accommodation card · card status segmented control · detail popover · notes cell · collapsed summary strip · bulk action bar · lane drag states
**Structural:** modal · confirm · toast · banner (read-only, data-path advisory) · empty state · error state · idle lock · manage list row · assignment matrix
**Print:** day sheet · range report · header · signature block

---

## 9. Accessibility - non-negotiable

This app documents disability accommodations. It will be reviewed. It must be exemplary.

- **Contrast:** 4.5:1 body text, 3:1 large text and UI boundaries, against the _actual_ rendered background including any aurora behind it. Soft palettes fail this easily - verify every status chip.
- **Never color alone.** Every status carries a glyph and a text label as well as a fill. Required on screen; doubly required in monochrome print.
- **Full keyboard operation**, including drag: `@hello-pangea/dnd` provides space-to-lift / arrows / space-to-drop with live-region announcements. Do not design anything that breaks it, and design the visible focus and lift states explicitly.
- **Focus is always visible**, 2px accent ring at 2px offset. Never remove it.
- **Reduced motion** fully honoured per §4.7.
- **Screen reader:** lanes are labelled regions, columns are labelled lists, the notes textarea is labelled per student, and status changes announce.
- **Touch targets** ≥ 32px; ≥ 44px for the card status control, which is used hundreds of times a session on touchscreen laptops.

---

## 10. What is fixed, and what the design agent should push on

**Fixed - structural or legal:**

- Jira-style kanban: swimlane per student, statuses as columns, notes as the last column
- The three statuses plus the resolved "Not Used" state, and the `Not Used` ≠ `No record` distinction
- Mark-absent at the far right of the lane header
- Print output stays austere, monochrome-safe, and Letter-sized
- Nothing may reference a network resource
- Accessibility floors in §9

**Open - please improve:**

- The aurora composition itself: count, placement, blur radii, drift paths, whether it should respond subtly to cursor
- Exact palette values - the direction is warm violet-neutral, the specific hues are a first pass
- Onboarding copy, in full. It is currently described, not written.
- Whether the splash wordmark should become a small piece of motion identity rather than a static fade
- The assignment matrix, which is the hardest unsolved layout in the product
- Card density, and the drag lift / hover / keyboard-focus states
- An icon and wordmark - none exist yet
- Illustration style for empty states, if any

---

## 11. Handoff notes

- Design tokens live in `src/styles/abstracts/_tokens.scss` as a Sass map emitted to `--acc-*` CSS custom properties. Deliver palette changes as token values and they drop straight in.
- Styling is **BEM, with no inline styles** (`.acc-block__element--modifier`), per the house convention. The one unavoidable exception is the drag library's own transform style on dragging cards.
- Motion should be expressed as CSS custom properties and `@keyframes` - the app deliberately ships no animation runtime, so anything requiring a JS animation library needs to be raised rather than assumed.
- Target viewport is a 1366×768 school laptop at 100% and 125% Windows scaling. Design at 1440×900 but **verify at 1366×768 with 125% scaling**, which is the real-world worst case and where dense board layouts break.
