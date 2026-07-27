import { compareDateKeys, todayKey, formatDateMedium } from './dates.js';

/**
 * Derive the notification list from the document. Pure.
 *
 * Every item is computed from data we already hold — there is no feed and no
 * network. The bar for inclusion is that a teacher could act on it, so this stays
 * a short list of real problems rather than an activity log nobody reads.
 */
export function deriveNotifications(doc, { meta = {}, boardModel = null, now = new Date() } = {}) {
  const items = [];
  if (!doc) return items;

  // 1 — student data is syncing off the machine. The most serious thing we can
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

  // 2 — a claim on today's board that the printed report cannot support.
  if (boardModel?.detailsMissing > 0) {
    const n = boardModel.detailsMissing;
    items.push({
      id: 'details-missing',
      tone: 'warn',
      title: `${n} card${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} a detail`,
      body: 'Marked “used with detail” but no detail is written. Those print as an unsupported claim.',
    });
  }

  // 3 — past days still open. Left alone they resolve to Not Used, so it is
  //     worth surfacing while the teacher can still remember the day.
  const today = todayKey(now);
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

  // 4 — nothing recorded yet today. A gentle nudge, not an accusation.
  const todayRecord = doc.days?.[today];
  if (todayRecord && boardModel && !boardModel.noClassToday) {
    const touched = Object.values(todayRecord.students || {}).some(
      (s) => s.absent || (s.notes || '').length > 0 || hasUserEntry(s)
    );
    if (!touched) {
      items.push({
        id: 'nothing-today',
        tone: 'info',
        title: 'Nothing recorded today yet',
        body: 'Drag a card into Used as you deliver each accommodation.',
      });
    }
  }

  // 5 — setup is incomplete, so the board cannot be useful.
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

function hasUserEntry(studentDay) {
  return Object.values(studentDay.entries || {}).some(
    (e) => e.resolvedBy === 'user' || e.resolvedBy === 'auto'
  );
}
