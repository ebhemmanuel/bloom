# SPEC — Outro → Board handoff (motion)

Scope: the transition from onboarding outro to the live board in `accommodations-tracker`.
Prototype reference: `Bloom Onboarding v2.dc.html` (this project). The outro screen itself is built there; what follows is the engineering spec for the part the prototype fakes with a flat fade.

## Intent

No flat load. The outro hands the user to the board as one continuous gesture:
outro elements leave in a cascade → brief beat of empty aurora → board elements arrive in a cascade. The board should feel like it grows out of the same scene, not like a route change.

## Phase 1 — Outro cascade OUT (total ≈ 700ms)

After the third status line ("Warming up your board") has been visible ≥ 600ms:

- Elements exit in REVERSE order of arrival: status line 3 → line 2 → line 1 → heading → flower mark.
- Per element: 200ms, `cubic-bezier(0.7, 0, 0.84, 0)` (accelerating), opacity 1→0, translateY 0→-6px. Same as the prototype's `acc-exit`.
- Stagger: 60ms between elements.
- The flower mark exits last and differently: scale 1→0.85 + fade, 260ms — a small "tuck away", no translate.
- Aurora field and motes DO NOT fade. They persist through the whole handoff (they already exist behind the board — see `_ambient.scss`).

## Phase 2 — Beat (250–350ms)

Empty aurora only. This pause is intentional; do not trim it below 250ms.
During the beat, the aurora field transform eases from the outro shift (`scale(1.12)`) back to identity, 900ms `cubic-bezier(0.65, 0, 0.35, 1)` (it finishes under phase 3).

## Phase 3 — Board cascade IN (total ≈ 900ms)

Board mounts with all elements pre-hidden (opacity 0), then cascades:

- Order: app bar → date/day header → column headers (left→right, 40ms apart) → cards (top→bottom within columns, interleaved by row, 30ms apart) → side rail/notifications last.
- Per element: 220ms `EaseOutCubic`, opacity 0→1, translateY 6px→0. This matches the existing content-cascade vocabulary in `src/styles/abstracts/_motion.scss`.
- Cap the card stagger: after the first 12 cards, remaining cards share the final delay slot (long rosters must not stretch the cascade past ~900ms).

## Rules

- `prefers-reduced-motion: reduce` → skip phases 1–2 entirely, board appears with a single 200ms opacity fade, no transforms.
- The cascade must be interruptible: any click/keydown during phase 3 completes all animations instantly (jump-to-end, not cancel).
- First-run only. Normal app launches keep their current (faster) entrance; this choreography plays once, after `onboardingCompletedAt` is first written.
- No layout shift: elements animate opacity/transform only; space is reserved from first paint.

## Timing summary

| t (ms)   | event                                                 |
| -------- | ----------------------------------------------------- |
| 0        | last status line has settled                          |
| 0–620    | outro cascade out (5 elements × 60ms stagger + 200ms) |
| 620–900  | beat, aurora re-centers                               |
| 900–1800 | board cascade in                                      |
