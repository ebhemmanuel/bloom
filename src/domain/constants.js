/**
 * Domain vocabulary. Pure data - no React, no Electron, no I/O.
 */

/** Statuses that are actually written to data.json. */
export const STATUS = {
  UNASSIGNED: 'unassigned',
  USED: 'used',
  USED_WITH_DETAIL: 'used_with_detail',
  /**
   * Offered, and the student declined it.
   *
   * Counts toward compliance. The obligation is on the teacher to provide the
   * accommodation, not on the student to accept it - so a documented refusal is
   * what protects the teacher, and it must never be filed as a failure to
   * deliver. Reported as "addressed" but not as "delivered", because nothing was
   * actually used.
   */
  REFUSED: 'refused',
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
  /**
   * The TEACHER was out that day.
   *
   * Anything left unrecorded on a day the teacher was absent must never resolve
   * to "not used" - that would document them as failing to deliver support on a
   * day they were not in the building. Excluded from the compliance denominator,
   * and reported as its own reason so the record explains itself rather than
   * merely staying silent.
   *
   * Statuses the teacher DID record before leaving still stand: this only
   * replaces what would otherwise have become not_used.
   */
  TEACHER_ABSENT: 'teacher_absent',
  /**
   * There was no obligation to deliver this: school was not in session (weekend
   * or non-instructional date), the assignment was not yet or no longer in
   * force, or it is marked not relevant to this subject.
   *
   * Never a period. A period records which class a student is in, not when it
   * runs, so it cannot put anyone out of scope.
   */
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

/** The drop targets on the board, left to right. */
export const BOARD_COLUMNS = [
  { id: STATUS.UNASSIGNED, label: 'Unassigned' },
  { id: STATUS.USED, label: 'Used' },
  { id: STATUS.USED_WITH_DETAIL, label: 'Used with Detail' },
  { id: STATUS.REFUSED, label: 'Refused' },
];

/** Statuses where a repeat-use count is meaningful. */
export const COUNTABLE_STATUSES = [STATUS.USED, STATUS.USED_WITH_DETAIL];

/** Offered on the context menu for "used more than once". */
export const USE_COUNT_OPTIONS = [1, 2, 3, 4, 5];

export const DROPPABLE_STATUSES = BOARD_COLUMNS.map((c) => c.id);

/**
 * Single-character glyphs for the printed report. Status must never be conveyed
 * by color alone - these sheets get photocopied in monochrome.
 */
export const STATUS_GLYPH = {
  [STATUS.UNASSIGNED]: '·',
  [STATUS.USED]: 'U',
  [STATUS.USED_WITH_DETAIL]: 'D',
  [STATUS.REFUSED]: 'R',
  [STATUS.NOT_USED]: '—',
  [DERIVED_STATUS.ABSENT]: 'A',
  [DERIVED_STATUS.TEACHER_ABSENT]: 'T',
  [DERIVED_STATUS.NOT_APPLICABLE]: 'n/a',
  [DERIVED_STATUS.NO_RECORD]: '∅',
};

export const STATUS_LABEL = {
  [STATUS.UNASSIGNED]: 'Unassigned',
  [STATUS.USED]: 'Used',
  [STATUS.USED_WITH_DETAIL]: 'Used with detail',
  [STATUS.REFUSED]: 'Refused',
  [STATUS.NOT_USED]: 'Not used',
  [DERIVED_STATUS.ABSENT]: 'Absent',
  [DERIVED_STATUS.TEACHER_ABSENT]: 'Teacher absent',
  [DERIVED_STATUS.NOT_APPLICABLE]: 'Not applicable',
  [DERIVED_STATUS.NO_RECORD]: 'No record',
};

/**
 * The three the chooser offers. NOT the three a student may carry.
 *
 * "Other" is a door, not an answer. A student on a health plan, a behaviour
 * plan, an RTI tier or a district's own scheme was previously recorded as
 * "Other" and printed as "Other", which tells an auditor nothing and tells the
 * teacher less. Choosing it now asks what to call it, and whatever comes back
 * is what the record says.
 */
export const PLAN_TYPES = ['IEP', '504', 'Other'];

/** Long enough for "Behaviour plan", short enough for a lane header pill. */
export const PLAN_LABEL_MAX = 24;

/**
 * Any non-empty wording, tidied. Blank falls back rather than being stored.
 *
 * Deliberately permissive: this is a label a teacher chose for a student in
 * their own class, not a code from a controlled vocabulary, and rejecting one
 * would leave them recording something they know to be wrong.
 */
export function normalizePlanType(value, fallback = 'IEP') {
  const text = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!text) return fallback;
  return text.slice(0, PLAN_LABEL_MAX);
}

/**
 * Which of the three pill colours a plan wears.
 *
 * Custom wordings all take the neutral one. The two the palette has a colour
 * for are the two an auditor reads for, and inventing a colour per tag would
 * turn a legend into a guessing game.
 */
export function planClassOf(value) {
  if (value === 'IEP') return 'iep';
  if (value === '504') return '504';
  return 'other';
}

export const ABSENCE_REASONS = [
  { id: 'excused', label: 'Excused' },
  { id: 'unexcused', label: 'Unexcused' },
  { id: 'partial', label: 'Partial day' },
];

/**
 * Reasons the TEACHER was out - distinct from a student absence above.
 *
 * A day the teacher missed explains why the record is thin, which is exactly the
 * context an auditor needs before reading a sparse day as non-delivery.
 */
export const TEACHER_ABSENCE_REASONS = [
  { id: 'sick', label: 'Out sick' },
  { id: 'tdy', label: 'TDY' },
  { id: 'left_early', label: 'Left early' },
  { id: 'sub', label: 'Sub covered' },
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
  /** The teacher set it deliberately. */
  USER: 'user',
  /** End-of-cycle resolution stamped it. */
  AUTO: 'auto',
  /**
   * Pre-set from a standing per-student default.
   *
   * Tracked separately from USER on purpose. A default asserts delivery on a day
   * nobody observed anything, which is legitimate for a permanent arrangement
   * (preferential seating: the desk is where it is) and misleading for a
   * conditional one (extended time on assessments, on a day with no assessment).
   * Keeping the provenance means the report can distinguish "standing
   * arrangement" from "observed today", instead of quietly inflating a delivery
   * rate.
   */
  DEFAULT: 'default',
};

/** Statuses that may be used as a standing per-student default. */
export const DEFAULTABLE_STATUSES = [STATUS.USED, STATUS.USED_WITH_DETAIL];

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

/** Starting suggestions for the "what do you teach" question. Free entry allowed. */
export const SUBJECT_OPTIONS = [
  'Mathematics',
  'English / ELA',
  'Science',
  'Social Studies',
  'Special Education',
  'World Languages',
  'Art',
  'Music',
  'Physical Education',
  'Technology',
];

export const GRADE_OPTIONS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

/**
 * The day-end times offered during onboarding.
 *
 * A short list of the times a school day actually ends, rather than a time
 * picker: choosing from four is one tap, and typing 15:30 into a field is a
 * decision about formatting rather than about your day.
 *
 * It stops at 4:00. The two later ones were there for symmetry rather than for
 * anybody - a school day that ends at five is after-school care, not the day
 * this setting closes out - and four fits beside the first-day field without
 * either wrapping.
 */
export const CYCLE_END_OPTIONS = [
  { value: '14:30', label: '2:30' },
  { value: '15:00', label: '3:00' },
  { value: '15:30', label: '3:30' },
  { value: '16:00', label: '4:00' },
];

/**
 * The advisories a teacher can opt into, all off by default.
 *
 * Off is the honest default for a tool used by someone who is already
 * interrupted all day. Each maps to something `deriveNotifications` can actually
 * compute from the document; none of them are marketing.
 */
export const REMINDER_OPTIONS = [
  {
    id: 'morning',
    title: 'A gentle morning check-in',
    body: 'One quiet note at the start of the day. Never urgent.',
  },
  {
    id: 'details',
    title: 'Details, before you close out',
    body: "Only if a card says 'used with detail' and nothing's written yet.",
  },
  {
    id: 'weekly',
    title: 'A weekly recap',
    body: 'A short summary of the week, ready when reports are due.',
  },
];

export const DEFAULT_REMINDERS = Object.fromEntries(REMINDER_OPTIONS.map((r) => [r.id, false]));

export const DEFAULT_CYCLE_END_TIME = '16:00';
export const DEFAULT_IDLE_LOCK_MINUTES = 10;

/**
 * The three scenes the app can sit in front of.
 *
 * `aurora` is the standard set by design_handoff_about_bloom: the sheet the
 * About screen uses, on an 18s cycle, blooms that arrive and drift, and glowing
 * motes. It is the default, and setup, the board and About all draw it, so
 * moving between them never changes the room.
 *
 * `calm` is the softer scene setup used to open in: a paler sheet on a much
 * slower cycle.
 *
 * `drift` is the board's original field - the same aurora, but the blooms pan
 * as one body rather than arriving individually.
 *
 * All three carry the same motes. The scenes differ in weather, not in what
 * they are made of.
 */
export const BACKGROUND_STYLES = [
  { id: 'aurora', label: 'Aurora', hint: 'The standard scene' },
  { id: 'calm', label: 'Calm', hint: 'Paler, on a slower cycle' },
  { id: 'drift', label: 'Drift', hint: 'Blooms pan as one' },
];

export const DEFAULT_BACKGROUND_STYLE = 'aurora';

/**
 * Low performance mode: everything instant, nothing animated.
 *
 * ON by default, and that is a deliberate reversal of the usual advice about
 * defaults. This ships to whatever machine a district happens to hand a
 * teacher, which is routinely a six-year-old laptop with 4GB of RAM shared with
 * a browser full of tabs. The board's cascades and the ambient scene are the
 * first things to stutter there, and a stuttering board reads as a broken app,
 * not as a pretty one under strain. A teacher on hardware that can afford the
 * motion can turn it off in one click; a teacher on hardware that cannot should
 * never have had to work out why the app felt slow.
 *
 * It is not the same setting as `prefers-reduced-motion`, which is an
 * accessibility request from the OS and is always honoured on top of this.
 */
export const DEFAULT_LOW_PERFORMANCE = true;
