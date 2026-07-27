# Handoff: Bloom, Accommodations Tracker UI

## Overview

Design iterations for **Bloom** (repo: ebhemmanuel/accommodations-tracker, branch main), a local-only daily accommodation-tracking board for teachers. This bundle covers the onboarding flow and the daily board, evolved well past the current repo head.

## About the Design Files

The .dc.html files here are **design references built in HTML** (open them in a browser). They are prototypes showing intended look and behavior, NOT production code. The task is to **recreate these designs in the accommodations-tracker codebase** (React + SCSS, existing tokens in src/styles/abstracts/_tokens.scss) using its established patterns. Ignore the DC/support.js runtime scaffolding; treat markup, inline styles, and behavior as the spec.

## Fidelity

**High-fidelity.** Colors, spacing, radii, motion timings, and copy are final. Recreate pixel-perfectly with the codebase's tokens (values match _tokens.scss; anything new is listed in SPEC.md).

## The spec

**SPEC.md** (a copy of the project's github.md) is the implementation contract: a "Requested changes" section maps every change to repo files, plus later iterations and print-integration requirements. Work top to bottom; the prototypes resolve any ambiguity.

## Files

- `Onboarding Welcome.dc.html`, onboarding: aurora bloom intro, wordmark, name/subjects/grades, data location, done
- `Bloom Board.dc.html`, daily board: frosted chrome, toolbar, lanes, drag + multi-select, context menus, calendar day/range, notifications, day notes/absence, add student, in-lane add accommodation, custom scrollbar
- `SPEC.md`, the full change spec (from github.md)

## Key behaviors to preserve

- New accommodations record from their add date FORWARD only (assignedFrom); never retroactive.
- "Not relevant to subject" resolves NOT_APPLICABLE, never NOT_USED; excluded from totals.
- Close-out seals a day read-only; unassigned resolves Not Used. "No record" days print as no record.
- Absent students: cards reset to Unassigned, lane locked, excluded from compliance totals.
- Day notes + reported teacher absence print on the daily report (see SPEC.md print integration).

## Design tokens (net-new vs repo)

- Frost: rgba(255,255,255,0.3) + backdrop-blur(24px) saturate(1.2); lanes rgba(255,255,255,0.72)
- Aurora page bg: linear-gradient(115deg,#ece2ff,#ffe4ef,#fdf0dc,#dcf3e8,#dfe5ff) 320% size, 18s shift; blob field pans 24s
- Pill radius 999px on all controls; cards 8px; lanes 14px; container 20px 20px 0 0
- Amber advisory: #fbf1e2 bg / #a06a2c ink / #e8d9bd border. Accent #5b4bd6, hover #6d5ee6, selected bg #eeebfd/#eeeafd
- Motion: acc-enter 260ms cubic-bezier(0.16,1,0.3,1); exits mirror entrances; reduced-motion honored
