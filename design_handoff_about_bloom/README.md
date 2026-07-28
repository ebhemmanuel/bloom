# Handoff: About Bloom screen

## Overview

A full-screen "About" for **Bloom** (the accommodations tracker in `ebhemmanuel/accommodations-tracker`). It reuses the onboarding's AMBIENT register: aurora backdrop, drifting motes, the BloomMark logo reveal, and five auto-cycling slides that explain what Bloom is, its privacy stance, why it was built, who it's for, and where it goes next. Opens with the main board cascading away, closes back to the board.

## About the Design Files

The files in this bundle are **design references created in HTML** — a prototype showing intended look and behavior, not production code to copy directly. Recreate this design inside the existing React + SCSS codebase (`src/components/onboarding/*` patterns, `--acc-*` tokens). `support.js` is only the preview runtime for the prototype; ignore it. The prototype's inline styles should become SCSS following the `.acc-ob` conventions in `src/styles/components/_onboarding.scss`.

## Fidelity

**High-fidelity.** Colors, type, spacing, and every animation timing are exact and sourced from the codebase's own tokens (`src/styles/abstracts/_tokens.scss`) and onboarding styles. Recreate pixel-perfectly, but prefer the existing implementations where they already exist:

- Reuse `BloomMark.jsx` (do not re-draw the SVG).
- Reuse the onboarding ambient scene (`OnboardingAmbient.jsx` / `.acc-ob__sheet`, `__blob`, `__mote`) rather than duplicating it.

## Entry / exit

- Route/trigger: an "About" item (menu or nav). The screen is full-viewport, `position: fixed; inset: 0`, over the board — same as `.acc-ob`.
- **Opening transition ("the cascade")**: the board is visible, then its rows cascade away — each row: 550ms `cubic-bezier(0.65,0,0.35,1)`, staggered 80/170/260/350/440ms, animating to `opacity:0; translateY(26px); blur(6px)`. A veil (page bg `#faf8fc`) then fades out 700ms at 750ms, revealing the aurora. In production, cascade the real board rows (top row first), not a mock.
- Close: × button top-right (40px circular ghost hover `rgba(255,255,255,0.6)`), returns to the board (reverse: aurora out, board rows cascade back in).

## Screens / Views

One screen, five stacked slides under a fixed logo anchor.

### Fixed chrome (never moves between slides)

| Element         | Spec                                                                                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand lockup    | top-left 28px/32px: BloomMark size 26 (static) + "BLOOM" 15px/600, `letter-spacing: 0.2em`, uppercase, color `var(--acc-brand)` `#8f83e3`. Enters at 2750ms (`acc-enter` 700ms entrance ease, `backwards`). |
| Close ×         | top: 28px; right: 32px; 40px circle; color `#9a93a8`, hover bg `rgba(255,255,255,0.6)` + ink `#2a2438`; 90ms standard ease. Enters 1400ms.                                                                  |
| Logo anchor     | BloomMark size 96, absolutely positioned: `left: calc(50% - 48px); top: calc(60vh - 306px)`. All slide text starts below it at a fixed y — slides can never shift vertically.                               |
| Stats pill      | see below; sits above the dots.                                                                                                                                                                             |
| Slider dots     | 5 dots, 8px, gap 10px, centered, 36px from bottom. Active: `#5b4bd6`, scale 1.25; inactive `rgba(42,36,56,0.18)`; 200ms standard ease. Click to jump.                                                       |
| Feedback button | bottom-right 32px/32px. See Interactions.                                                                                                                                                                   |

### Logo reveal (on open) — mirrors onboarding intro

- Petals: `acc-ob-pop` 640ms `cubic-bezier(0.34,1.45,0.64,1)`, per-petal delays 1500/1620/1740/1860/1980ms (step 120ms), `both`.
- Center: `acc-ob-center-pop` 950ms linear at 2270ms (overshoot-settle keyframe from `_onboarding.scss`).
- **Pinwheel idle**: after settling, the five petals (as one group, center dot excluded) rotate 360° every 30s, linear, infinite, starting at 4600ms. `transform-origin: 32px 32px`.
- With `BloomMark.jsx`: `<BloomMark size={96} bloom delay={1500} step={120} />` + a wrapper for the pinwheel.

### Slides (all: kicker → heading → paragraph, centered column, max-width 640px, gap 20px)

Layout per slide: `align-items: flex-start; justify-content: center; padding-top: calc(60vh - 186px)` — text top edge is fixed.

- Kicker: 11px/600, `letter-spacing: 0.18em`, uppercase, `#8f83e3` (slide 2 uses accent `#5b4bd6`).
- Heading: 38px/600, line-height 1.18 (`text-wrap: balance`). Hero heading: 48px/600, lh 1.12.
- Paragraph: 16px, line-height 1.7, `#6b6480`, max-width 540px (`text-wrap: pretty`). Hero: 17px, lh 1.65.

| #   | Kicker             | Heading                                         | Body copy (exact)                                                                                                                                                                                                                           |
| --- | ------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ABOUT              | A calm record of the support you give.          | A daily record of the accommodations you deliver, so you can show your work when someone asks.                                                                                                                                              |
| 2   | PRIVATE BY DESIGN  | Nothing leaves this computer.                   | Everything lives in one file on this computer. No account, no database, no network. It cannot send your students' information anywhere.                                                                                                     |
| 3   | WHY IT WAS BUILT   | Paperwork built for auditors, not for teachers. | Documenting IEP and 504 support is required, and the systems that exist for it are mostly built for administrators rather than for the person actually teaching. They ask for a lot of clicks, at the end of a day when you have none left. |
| 4   | WHO IT'S FOR       | For the person delivering the support.          | Classroom teachers with IEP and 504 students, not the office auditing them. A board you can run down in a few minutes after the last bell, that turns into a report when someone needs one.                                                 |
| 5   | WHERE IT GOES NEXT | Small on purpose.                               | An end-of-day close-out that seals each record, printable reports ready for compliance submission, and bulk actions for the busy days. Never an account, never a sync. That part doesn't change.                                            |

Hero title/lede first arrival: `acc-enter` 700ms entrance ease at 2750/3050ms, `backwards` (after the mark blooms).

### Stats pill

- Position: fixed, centered, bottom gap to dots = dots' gap to viewport bottom (~36px).
- Container: 460px wide, `padding: 14px 24px`, radius 999, bg `rgba(255,255,255,0.6)`, border 1px `rgba(255,255,255,0.8)`, shadow `0 4px 14px -6px rgba(42,36,56,0.2)`.
- Content: 3 equal grid columns, each number-over-label centered. Number: JetBrains Mono 17px, `tabular-nums`, `#2a2438`. Label: 12px `#9a93a8`.
- Data: live counts from the store — students, accommodations, days recorded. ("Records" was deliberately dropped.) Hide the pill if no data (`showStats`).

## Interactions & Behavior

- **Slide engine**: 5 slides, all mounted and absolutely stacked. Active: `opacity 1; translateY(0)`. Inactive: `opacity 0; translateY(±18px)` (− if before active, + if after), `pointer-events: none`. Transition 360ms `cubic-bezier(0.16,1,0.3,1)` on opacity+transform.
- **Idle auto-advance**: every 9000ms, wrapping (5 → 1). Any manual nav resets the timer.
- **Keyboard**: ← / → navigate (clamped by wrap logic, manual).
- **Dots**: click to jump (manual).
- **Feedback button (two-step, deliberate)**: a 40px "?" circle (same frost styling as the stats pill; "?" 16px/600 `#5b4bd6`, hover bg `#ffffff`). First click does NOT open mail — it flexes open leftward revealing "Send feedback" (13px/500; label `max-width` 0→140px, opacity 0→1, margin 0→7px; 260ms entrance ease). Second click fires `mailto:m.solothis@proton.me?subject=Bloom%20feedback`. Auto-collapses after 6s without a second click. Rationale: avoid accidentally launching Outlook on slow school machines.
- **Ambient**: aurora sheet `linear-gradient(115deg, #ece2ff, #ffe4ef 25%, #fdf0dc 50%, #dcf3e8 75%, #dfe5ff)` at 320% size, 18s position shift; four blurred blobs (periwinkle #d9dfff 640px/90px blur, blush #ffd9e8 660px/110px, mint #d2f2e6 540px/80px, apricot #ffe7cf 520px/100px) bloom in staggered 900–1650ms then drift 22–30s; ~11 glowing white motes (3–7px, blurred glow shadows) rise bottom→top with sideways sway, 18–34s linear, staggered delays.
- **Reduced motion**: kill all animation (durations → 0.01ms), as in `_onboarding.scss`.

## State Management

- `slideIndex: number` (0–4); `idleTimer` (9s interval, reset on manual nav, cleared on unmount).
- `feedbackOpen: boolean` + 6s collapse timeout.
- Counts (students / accommodations / daysRecorded) read from the app's existing store.

## Design Tokens (all from `src/styles/abstracts/_tokens.scss`)

- Ink `#2a2438`, muted `#6b6480`, faint `#9a93a8`, bg `#faf8fc`, accent `#5b4bd6` (hover `#6d5ee6`), brand `#8f83e3`.
- Petals: `#b7a6f4 #f8aac9 #ffd39a #96ddc1 #a9bcf7`; center dot = accent.
- Fonts: Inter (sans), JetBrains Mono (mono).
- Easing: entrance `cubic-bezier(0.16,1,0.3,1)`, exit `cubic-bezier(0.7,0,0.84,0)`, standard `cubic-bezier(0.65,0,0.35,1)`, settle/pop `cubic-bezier(0.34,1.45,0.64,1)`.
- Radii: 999 (pills), 14 (cards). Shadow overlay: `0 12px 32px -8px rgba(42,36,56,0.18)`.

## Assets

None external. The BloomMark is `src/components/onboarding/BloomMark.jsx` (5 ellipses rx 9.5 / ry 15 at cy 17, rotated 0/72/144/216/288 around 32,32; center circle r 7.5). Fonts via Google Fonts in the prototype; the app already loads them.

## Files

- `About Bloom v2.dc.html` — the full prototype (template + logic + all keyframes). Open in a browser to see it run.
- `support.js` — prototype preview runtime only; not part of the design.
