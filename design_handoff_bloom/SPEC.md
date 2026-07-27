repo: ebhemmanuel/accommodations-tracker
branch: main

## Last sync

date: 2026-07-27T02:05:00Z

### Updated in this project

- Full sync to repo head (3b9e2459…→main, 3 commits / 40 files): app header, NotificationsPanel, card context menu, Refused column, 1200px frame
- Layered Bloom design iterations on top (see "Requested changes" below — not yet in the repo)

## Requested changes (to implement in the repo)

Everything below is prototyped in `Bloom Board.dc.html` — open it for exact colors/spacing. All corner radii on controls are pill (999px); tokens otherwise per `_tokens.scss`.

### App shell / chrome

- Page gets 16px padding on top/left/right; bottom is flush. Aurora gradient + drifting pastel blobs (the onboarding treatment, `aurora-*` tokens) render on the page background BEHIND the frame, not inside it. Overrides the "aurora never on the board" rule in DESIGN_REQUIREMENTS — the board card itself stays clean white; only the page backdrop blooms. (`_app-shell.scss`)
- Header detaches into a floating pill nav (border-radius 999px, `--acc-shadow-raised`, 12px gap below): left = brand mark + "Bloom" + date picker; center = student search (max-width 360px); right = "N students" count, save-status pill, day-notes icon, notifications bell, avatar. (`AppHeader.jsx`, `_header.scss`, `SaveStatusPill`, `StudentSearch`)
- Board container: white card, border-radius 20px 20px 0 0, `--acc-shadow-raised`, no bottom border, attached to viewport bottom.
- Product name is **Bloom** (onboarding wordmark, header brand, printed-report headers).

### Toolbar / board tools (`BoardToolbar.jsx`, `_toolbar.scss`)

- The toolbar row is no longer a bordered bar — it floats on the board surface above the first lane: [Add student] [period chips All/P1/P3/P5] …spacer… [Copy yesterday] [Close out day] [fold-toggle chevron].
- Fold all / Unfold all replaced by ONE 32px pill icon button right of Close out day, using the same chevron as swimlane headers: points down when lanes are open (click folds all), right when all folded (click unfolds).
- DatePicker moves into the header next to the brand and opens a calendar popover: month nav, Day|Range segmented toggle, weekends disabled, today ringed. Day mode navigates on click; Range mode picks start/end, shows "Jul 20 – Jul 24 · N school days" and a "Go to first day" action. (new `DatePicker` popover; nonInstructionalDates still apply)
- Copy-yesterday / seal notices render as floating toasts, fixed lower-LEFT (rounded 14px, overlay shadow), not banners in the flow.
- The details-missing warning is a collapsed amber pill fixed lower-RIGHT (warning triangle + count). Clicking expands a 320px panel upward from the pill; text wraps (`overflow-wrap`, line-height 1.5). Never overlaps lanes.

### Cards / board (`AccommodationCard.jsx`, `Board.jsx`, `mutations.js`)

- Multi-select: Ctrl/Cmd+click toggles card selection (bg `--acc-surface-selected`, border `--acc-accent`); Shift+click range-selects within a column. Selection is scoped to ONE student; selecting in another lane resets. Plain click clears. Dragging any selected card moves the whole group in one drop; group-drop on Used with Detail opens the detail editor for the grabbed card only. Selection clears after drop.
- The ×N use-count chip renders pinned bottom-right of the card (absolute, 8px inset), not in the meta row.
- Context menu gains a "This subject" group: **"Not relevant to subject"** toggle (undo label: "Counts for this subject again"). Marking it resets status to unassigned, clears any standing default, dims the card (0.45, drag disabled), shows a muted "Not relevant" chip, excludes the card from the lane denominator ("n of m recorded") and from details-missing counts, and on close-out it resolves as NOT_APPLICABLE — never NOT_USED. Note copy: "Excluded from this class's totals — it resolves as not applicable, never as Not Used." (`constants.js`, `resolve.js`, `selectors.js`)

### Day notes + teacher absence (new; `shell/`, `notifications.js`, `schema.js`)

- New note icon in the header left of the bell (dot indicator when the day has notes or a reported absence). Opens a "Day notes" popover: per-day handoff/prep textarea (for a sub, or tomorrow-you) with debounced Saved flash.
- "Report an absence" flow inside the panel: reason chips (Out sick / Personal day / Left early / Sub covered) + optional free text → appends a line to the day notes: `Absence — <reason>: <text>`, records `{reason, text}` on the day, and derives a notification ("Absence noted — <reason>", action opens Day notes) so the teacher reviews the day before close-out. Undo removes both the report and the appended line.
- deriveNotifications additions beyond repo head: sub-day advisory and testing/modified-schedule advisory (both dismissible, tone warn/info, actions navigate to the day).
- Absence reason chips are: Out sick / TDY / Left early / Sub covered.
- The "Add to notes" button in the absence form is full-width; there is no Cancel (closing the popover cancels).
- **Print integration (not in the prototype yet, must be coded):** day notes and the absence record (`{reason, text}`) print on the daily report — a "Day notes" block after the per-student tables, and the absence line ("Absence: <reason>: <text>") in the report header for that date. A day with a reported teacher absence prints that context so an auditor knows why records may be sparse. (`report/print.js` or equivalent, `schema.js`)

### Later prototype iterations (also to implement)

- Profile modal: clicking the avatar opens a centered modal editing teacher name, subject chips, grade chips (K-12); saving updates the avatar initial and tooltip. Esc/Cancel fades out (mirror of entrance animation); click-outside does NOT close modals with entered data.
- Period rename: right-click any period (filter menu row) opens a rename popover; label propagates to lane headers, filters, add-student modal. Clearing restores the P-number.
- Add student is a full modal (name, IEP/504/Other plan chips, P1-P8 period chips, catalog + custom accommodations with required-detail flag); the trigger is a + icon button in the header next to the "N students" count.
- Marking a student absent resets all their cards to Unassigned (details kept on cards).
- Custom scrollbar: native hidden; 6px pill track floats 8px right of the container, 45% height, centered; visible only while scrolling (fades 900ms after), draggable thumb.
- Frosted chrome: pill nav and board container are rgba(255,255,255,0.3) + 24px backdrop blur; lanes rgba(255,255,255,0.72); aurora gradient animates (bg-shift 18s, field pan 24s).
- Toolbar final layout (single floating row above lanes, inside scroll area): [Copy yesterday][date picker dropdown][fold-all chevron][spacer][Close out day][periods dropdown]. Periods are a dropdown menu (All + each period with count, multi-check, right-click row to rename), not chips. The global details-missing warning pill is GONE from the toolbar; the per-lane "N needs detail" chip sits in a right-aligned group immediately left of Mark absent.
- Toasts: action notices are 220px columns anchored just right of the container, expanding upward.
- Absence reasons: Out sick / TDY / Left early / Sub covered.
- Toolbar left cluster final order: [fold-all chevron][date picker dropdown][Copy yesterday]; right side: [Close out day][periods dropdown].
- Add accommodation in-lane: each student's Unassigned column ends with a dashed "+ Add accommodation" button opening an inline form. The input (a) autocompletes from the accommodation catalog (2+ chars, max 3 suggestions, excludes ones the student already has; catalog picks keep their requiresDetail flag and are NOT one-off), (b) accepts free text as a one-off custom, and (c) bulk-adds comma/tab/newline-separated entries (pasted Excel cells) with "Add all N" and duplicate-skip. New assignments carry an addedOn date and record from that day FORWARD ONLY - prior closed/open days must not gain the card (no retroactive Not Used). Hidden on sealed days and absent students. (`schema.js` add `assignedFrom` date to assignments; `resolve.js`/`selectors.js` filter by it)

## Screen map

| Screen                     | Repo files                                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Onboarding Welcome.dc.html | docs/DESIGN_REQUIREMENTS.md, src/styles/abstracts/_tokens.scss, _motion.scss, base/_typography.scss, src/domain/constants.js                                                                                                                                                                                                                           |
| Bloom Board.dc.html        | src/App.jsx, src/components/shell/_, src/components/board/_, src/components/toolbar/_, src/components/shared/_, src/domain/constants.js, notifications.js, resolve.js, selectors.js, src/styles/components/_board.scss, _card.scss, _controls.scss, _feedback.scss, _context-menu.scss, src/styles/layout/_header.scss, _toolbar.scss, _app-shell.scss |

## Sync history

- 2026-07-27T01:20:00Z — full sync to main (header/notifications/context menu/Refused/1200px frame); calendar picker, toolbar rearrange
- 2026-07-26T23:59:00Z — board synced to whole-card drag model; reminders tray added
- 2026-07-26T23:27:41Z — initial: onboarding flow built from DESIGN_REQUIREMENTS §5.2
