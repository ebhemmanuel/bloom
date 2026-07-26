/**
 * Domain vocabulary. Pure data — no React, no Electron, no I/O.
 */

/** Statuses that are actually written to data.json. */
export const STATUS = {
  UNASSIGNED: 'unassigned',
  USED: 'used',
  USED_WITH_DETAIL: 'used_with_detail',
  /** Resolved: the cycle closed with no delivery recorded. */
  NOT_USED: 'not_used',
};

/**
 * Statuses that are COMPUTED and never persisted. `effectiveStatus` may return
 * these; nothing may ever write them into an entry.
 */
export const DERIVED_STATUS = {
  /** Student was absent. Excluded from the compliance denominator. */
  ABSENT: 'absent',
  /** Period doesn't meet this weekday, or it's a non-instructional date. */
  NOT_APPLICABLE: 'not_applicable',
  /**
   * No day record exists at all.
   *
   * This is the most important value in the domain. "We have no data" and "the
   * accommodation was not delivered" are different claims, and conflating them
   * would manufacture a compliance failure the teacher never committed.
   */
  NO_RECORD: 'no_record',
};

export const ALL_STATUSES = { ...STATUS, ...DERIVED_STATUS };

/** The three drop targets on the board, left to right. */
export const BOARD_COLUMNS = [
  { id: STATUS.UNASSIGNED, label: 'Unassigned' },
  { id: STATUS.USED, label: 'Used' },
  { id: STATUS.USED_WITH_DETAIL, label: 'Used with Detail' },
];

export const DROPPABLE_STATUSES = BOARD_COLUMNS.map((c) => c.id);

/**
 * Single-character glyphs for the printed report. Status must never be conveyed
 * by color alone — these sheets get photocopied in monochrome.
 */
export const STATUS_GLYPH = {
  [STATUS.UNASSIGNED]: '·',
  [STATUS.USED]: 'U',
  [STATUS.USED_WITH_DETAIL]: 'D',
  [STATUS.NOT_USED]: '—',
  [DERIVED_STATUS.ABSENT]: 'A',
  [DERIVED_STATUS.NOT_APPLICABLE]: 'n/a',
  [DERIVED_STATUS.NO_RECORD]: '∅',
};

export const STATUS_LABEL = {
  [STATUS.UNASSIGNED]: 'Unassigned',
  [STATUS.USED]: 'Used',
  [STATUS.USED_WITH_DETAIL]: 'Used with detail',
  [STATUS.NOT_USED]: 'Not used',
  [DERIVED_STATUS.ABSENT]: 'Absent',
  [DERIVED_STATUS.NOT_APPLICABLE]: 'Not applicable',
  [DERIVED_STATUS.NO_RECORD]: 'No record',
};

export const PLAN_TYPES = ['IEP', '504', 'Other'];

export const ABSENCE_REASONS = [
  { id: 'excused', label: 'Excused' },
  { id: 'unexcused', label: 'Unexcused' },
  { id: 'partial', label: 'Partial day' },
];

/** Weekday codes, indexed to match Date#getDay(). */
export const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export const WEEKDAY_LABEL = {
  SU: 'Sunday',
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
};

export const SEED_MODE = {
  /** Copies which cards appear; all statuses reset to unassigned. The default. */
  STRUCTURE: 'structure',
  /** Also copies statuses and details. Requires explicit confirmation. */
  FULL: 'full',
};

export const RESOLVED_BY = {
  USER: 'user',
  AUTO: 'auto',
};

/** Starter categories for the accommodation catalog. */
export const CATEGORIES = [
  { id: 'presentation', label: 'Presentation' },
  { id: 'response', label: 'Response' },
  { id: 'setting', label: 'Setting' },
  { id: 'timing', label: 'Timing & scheduling' },
  { id: 'assessment', label: 'Assessment' },
  { id: 'environment', label: 'Environment' },
  { id: 'behavior', label: 'Behavior & regulation' },
  { id: 'other', label: 'Other' },
];

export const DEFAULT_CYCLE_END_TIME = '16:00';
export const DEFAULT_IDLE_LOCK_MINUTES = 10;
