import {
  compareDateKeys,
  todayKey,
  formatDateMedium,
  isCycleComplete,
  isWeekend,
} from './dates.js';
import { recordedYears, schoolYearOf } from './licensing.js';

/**
 * Derive the notification list from the document. Pure.
 *
 * Every item is computed from data we already hold - there is no feed and no
 * network. The bar for inclusion is that a teacher could act on it, so this stays
 * a short list of real problems rather than an activity log nobody reads.
 *
 * Two kinds of item, and the difference matters:
 *
 *   - PROBLEMS are unconditional. A record that syncs off the machine, a claim
 *     the printed report cannot support, a student who has nothing recorded on a
 *     day that is about to be sealed: these are surfaced whatever the teacher
 *     opted into, because they are about the document being wrong.
 *
 *   - REMINDERS are opt-in, held in `settings.reminders` and chosen during
 *     setup. Each one here corresponds to an option in `REMINDER_OPTIONS`, and
 *     for a long time none of them did anything at all: the question was asked,
 *     the answer was stored, and nothing ever read it. An app that asks what you
 *     want and then ignores it is worse than one that never asked.
 */
export function deriveNotifications(
  doc,
  { meta = {}, boardModel = null, update = null, licensed = false, now = new Date() } = {}
) {
  const items = [];
  if (!doc) return items;

  const on = doc.settings?.reminders || {};

  /*
    A newer version exists.

    The only item here that did not come from the record. It is not a problem
    with the document and not a reminder the teacher opted into, so it sits at
    the top as plain information and offers the one thing it can: the release
    page, in their own browser. Nothing downloads or installs itself.
  */
  if (update?.available) {
    items.push({
      id: 'update-available',
      tone: 'info',
      title: `Version ${String(update.latest).replace(/^v/i, '')} is out`,
      body: `You are on ${update.current}. Downloading it is up to you, and your records are untouched either way.`,
      action: 'Open the download page',
      act: 'openRelease',
      payload: update.url,
    });
  }

  // 1 - student data is syncing off the machine. The most serious thing we can
  //     tell them, so it goes first.
  if (meta.synced) {
    items.push({
      id: 'synced',
      tone: 'warn',
      title: `Your records sync to ${meta.syncProvider || 'the cloud'}`,
      body: 'Student names and plan details are being copied off this computer. Move the file to a local-only folder.',
      action: 'Show me the folder',
      act: 'revealFolder',
    });
  }

  if (meta.tooNew) {
    items.push({
      id: 'too-new',
      tone: 'warn',
      title: 'Opened read-only',
      body: 'This file was written by a newer version of the app, so nothing can be saved over it.',
    });
  }

  if (meta.recoveredFrom) {
    items.push({
      id: 'recovered',
      tone: 'ok',
      title: 'Records recovered from a backup',
      body: 'The unreadable file was kept, not deleted, in case you want it looked at.',
      action: 'Show me the folder',
      act: 'revealFolder',
    });
  }

  // 2 - a claim on today's board that the printed report cannot support.
  if (boardModel?.detailsMissing > 0) {
    const n = boardModel.detailsMissing;
    items.push({
      id: 'details-missing',
      tone: 'warn',
      title: `${n} card${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} a detail`,
      body: 'Marked “used with detail” but no detail is written. Those print as an unsupported claim.',
    });
  }

  // 3 - the teacher reported being out. Surfaced so they review the day before
  //     closing it out, rather than sealing a thin record without context.
  const today = todayKey(now);
  const todayDay = doc.days?.[today];

  if (todayDay?.teacherAbsence) {
    items.push({
      id: 'teacher-absence',
      tone: 'warn',
      title: `Absence noted - ${todayDay.teacherAbsence.reason}`,
      body: "The reason was added to today's day notes, so the record shows why entries are thin. Review before closing out.",
      action: 'Open day notes',
      act: 'openNotes',
    });
  }

  // 4 - past days still open. Left alone they resolve to Not Used, so it is
  //     worth surfacing while the teacher can still remember the day.
  const openPast = Object.values(doc.days || {})
    .filter((d) => !d.sealed && compareDateKeys(d.date, today) < 0)
    .map((d) => d.date)
    .sort();

  if (openPast.length > 0) {
    items.push({
      id: 'open-past',
      tone: 'info',
      title: `${openPast.length} earlier day${openPast.length === 1 ? '' : 's'} not closed out`,
      body:
        `Oldest is ${formatDateMedium(openPast[0])}. Anything left unassigned on those days ` +
        'is recorded as Not Used.',
      action: 'Go to the oldest',
      act: 'goToDate',
      payload: openPast[0],
    });
  }

  /*
    5 - the last day worked, and who has nothing on it.

    The one a teacher actually needs, and the reason the whole panel existed.

    It deliberately looks at the last past day WHETHER OR NOT it is sealed. The
    first version only considered open days, which meant it never fired once in
    practice: days seal automatically at startup, so by the time anyone reads
    this panel yesterday is already closed and the moment to say anything has
    passed. A sealed day is exactly when this matters, because the Not Used is
    no longer a forecast - it is written - and re-opening the day is now a real
    thing a teacher can do about it.

    "Nothing recorded" means nothing a PERSON recorded. After a seal every entry
    carries `resolvedBy: 'auto'`, so a check for any resolution at all reports a
    day nobody touched as fully handled.
  */
  const past = Object.values(doc.days || {})
    .filter((d) => compareDateKeys(d.date, today) < 0 && !d.backfilled && !d.teacherAbsence)
    .map((d) => d.date)
    .sort();
  const lastWorked = past.length > 0 ? past[past.length - 1] : null;

  if (lastWorked) {
    const day = doc.days[lastWorked];
    const missed = Object.entries(day.students || {})
      .filter(([, s]) => !s.absent && !hasTeacherEntry(s))
      .map(([id]) => id);

    if (missed.length > 0) {
      const who = missed
        .map((id) => doc.students.find((s) => s.id === id)?.displayName)
        .filter(Boolean);
      const trail = `${who.slice(0, 3).join(', ')}${who.length > 3 ? ` and ${who.length - 3} more` : ''}`;

      items.push({
        id: 'nothing-last-day',
        tone: 'warn',
        title: `${missed.length} student${missed.length === 1 ? '' : 's'} with nothing on ${formatDateMedium(lastWorked)}`,
        body: day.sealed
          ? `${trail}. That day is closed out, so their accommodations are recorded as Not Used. Re-open it if that is wrong.`
          : `${trail}. Anything left unassigned there records as Not Used when the day closes out.`,
        action: 'Go to that day',
        act: 'goToDate',
        payload: lastWorked,
      });
    }
  }

  // 6 - nothing recorded yet today. A gentle nudge, not an accusation, and
  //     suppressed when an absence already explains the empty day.
  const todayRecord = todayDay;
  const todayTouched =
    todayRecord &&
    Object.values(todayRecord.students || {}).some(
      (s) => s.absent || (s.notes || '').length > 0 || hasUserEntry(s)
    );

  if (todayRecord && boardModel && !boardModel.noClassToday && !todayRecord.teacherAbsence) {
    if (!todayTouched) {
      items.push({
        id: 'nothing-today',
        tone: 'info',
        title: 'Nothing recorded today yet',
        body: 'Drag a card into Used as you deliver each accommodation.',
      });
    }
  }

  // --- The opt-in reminders ------------------------------------------------
  // Each is gated on `settings.reminders`, chosen during setup and until now
  // never read. See REMINDER_OPTIONS.

  const cycleDone = isCycleComplete(today, doc.settings?.cycleEndTime, now);
  const schoolDay = todayRecord && !isWeekend(today) && !boardModel?.noClassToday;

  /*
    A gentle morning check-in.

    Before the cycle closes, and only while the day is still untouched - after
    the first card moves it would be telling a teacher something they are
    visibly already doing. Deliberately says the size of the day rather than
    asking for anything.
  */
  if (on.morning && schoolDay && !cycleDone && !todayTouched && !todayRecord.teacherAbsence) {
    const lanes = boardModel?.laneCount || 0;
    items.push({
      id: 'reminder-morning',
      tone: 'info',
      title: 'Good morning',
      body: lanes
        ? `${lanes} student${lanes === 1 ? '' : 's'} on today's board. Record as you go, or all at once later.`
        : "Today's board is ready when you are.",
    });
  }

  /*
    Details, before you close out.

    The unconditional `details-missing` item above says the same fact all day.
    This is the one that matters at the end of it: the day is about to be sealed
    and an unsupported claim is about to be frozen into the record.
  */
  if (on.details && cycleDone && boardModel?.detailsMissing > 0 && !todayDay?.sealed) {
    const n = boardModel.detailsMissing;
    items.push({
      id: 'reminder-details',
      tone: 'warn',
      title: 'Close out is due',
      body: `${n} card${n === 1 ? '' : 's'} still say used with detail and have nothing written. Fill them in before the day seals.`,
    });
  }

  /*
    A weekly recap, on the last working day of the week.

    Friday, because reports are due at the end of a week and Monday is too late
    to fix what Friday got wrong. Counts the days actually recorded rather than
    the days that exist, so a week off does not report as a week of failure.
  */
  if (on.weekly && isFriday(now)) {
    const week = weekRecord(doc, today);
    if (week.days > 0) {
      items.push({
        id: 'reminder-weekly',
        tone: 'info',
        title: 'Your week, so far',
        body: `${week.days} day${week.days === 1 ? '' : 's'} recorded${
          week.open > 0 ? `, ${week.open} still open` : ' and all closed out'
        }. A good moment to print the week for your files.`,
      });
    }
  }

  /*
    A new school year has started, and this record is still in the old one.

    Not a sales notice - a practical one. A teacher who comes back in August and
    starts recording without moving the term start files September under last
    year, and the report they print in October covers the wrong range. The gate
    happens to live on the same action, and that is said plainly rather than
    hidden behind "set up your year".

    Only from August, only once the record's own year is genuinely behind us,
    and it names the licence only when one is actually needed. A licensed
    teacher gets the same reminder without the price.
  */
  const years = recordedYears(doc);
  const thisYear = schoolYearOf(today);
  if (years.length > 0 && thisYear > years[years.length - 1]) {
    items.push({
      id: 'new-school-year',
      tone: 'info',
      title: `${thisYear}-${thisYear + 1} has started`,
      body: licensed
        ? 'Set your first day of class to begin the new year. Everything from last year stays exactly as it is.'
        : `Your free year covered ${years[0]}-${years[0] + 1}, and all of it stays yours to open and print. Starting this one is a one-time $29.`,
      action: 'Set the first day',
      act: 'openSettings',
    });
  }

  // 5 - setup is incomplete, so the board cannot be useful.
  if ((doc.students || []).length === 0) {
    items.push({
      id: 'no-students',
      tone: 'info',
      title: 'No students yet',
      body: 'Add your roster and their accommodations to start tracking.',
    });
  } else if ((doc.catalog || []).length === 0) {
    items.push({
      id: 'no-catalog',
      tone: 'info',
      title: 'No accommodations yet',
      body: 'Paste your accommodation list in from a spreadsheet to get started quickly.',
      action: 'Import a list',
      act: 'openImport',
    });
  }

  return items;
}

/** Anything resolved at all, by a person or by the close-out. */
function hasUserEntry(studentDay) {
  return Object.values(studentDay.entries || {}).some(
    (e) => e.resolvedBy === 'user' || e.resolvedBy === 'auto'
  );
}

/**
 * Anything a PERSON recorded.
 *
 * The distinction is the whole point on a sealed day: closing out stamps every
 * untouched entry `not_used` with `resolvedBy: 'auto'`, so "has any resolution"
 * is true of a day nobody opened. Notes and an absence count too - both are a
 * teacher saying something about that student.
 */
function hasTeacherEntry(studentDay) {
  if ((studentDay.notes || '').trim().length > 0) return true;
  return Object.values(studentDay.entries || {}).some((e) => e.resolvedBy === 'user');
}

/** Weekday 5. Kept here rather than in dates.js: nothing else asks. */
function isFriday(now) {
  return now.getDay() === 5;
}

/**
 * How much of this week has a record, and how much of it is still open.
 *
 * Walks back from today to Monday over the days that EXIST, so a week with two
 * days off counts two fewer days rather than reporting them as missed.
 */
function weekRecord(doc, today) {
  const start = new Date(`${today}T00:00:00`);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

  let days = 0;
  let open = 0;
  for (const [dateKey, day] of Object.entries(doc.days || {})) {
    if (compareDateKeys(dateKey, todayKey(start)) < 0) continue;
    if (compareDateKeys(dateKey, today) > 0) continue;
    if (day.backfilled) continue;
    days += 1;
    if (!day.sealed) open += 1;
  }
  return { days, open };
}
