import { describe, it, expect } from 'vitest';
import { buildBoardModel, normalizeSearch, matchesSearch, buildSearchIndex } from './selectors.js';
import { activeStudentsFor } from './seed.js';
import { STATUS, DERIVED_STATUS } from './constants.js';
import { makeDoc, withDay, T } from './test-helpers.js';

const TUE = '2026-09-15'; // Tuesday
const WED = '2026-09-16'; // Wednesday
const SAT = '2026-09-19';

const now = new Date(2026, 8, 16, 9, 0); // Wed 09:00

describe('normalizeSearch', () => {
  it('folds case and accents', () => {
    expect(normalizeSearch('Sofía')).toBe('sofia');
    expect(normalizeSearch('NÚÑEZ')).toBe('nunez');
    expect(normalizeSearch('  Álvarez  ')).toBe('alvarez');
  });

  it('handles nullish input', () => {
    expect(normalizeSearch(null)).toBe('');
    expect(normalizeSearch(undefined)).toBe('');
  });
});

describe('matchesSearch', () => {
  const doc = makeDoc();
  const index = buildSearchIndex(doc);

  it('matches an accent-free query against an accented name', () => {
    // A teacher typing quickly will not produce diacritics.
    expect(matchesSearch(index, T.jordan, 'alvarez')).toBe(true);
  });

  it('matches first name, last name, and "Last, First"', () => {
    expect(matchesSearch(index, T.jordan, 'jordan')).toBe(true);
    expect(matchesSearch(index, T.jordan, 'alva')).toBe(true);
    expect(matchesSearch(index, T.jordan, 'alvarez, jor')).toBe(true);
    expect(matchesSearch(index, T.jordan, 'jordan alvarez')).toBe(true);
  });

  it('matches the plan reference', () => {
    expect(matchesSearch(index, T.jordan, 'IEP-2026-0071')).toBe(true);
  });

  it('does not match an unrelated query', () => {
    expect(matchesSearch(index, T.jordan, 'zzz')).toBe(false);
  });

  it('an empty query matches everything', () => {
    expect(matchesSearch(index, T.jordan, '')).toBe(true);
    expect(matchesSearch(index, T.jordan, '   ')).toBe(true);
  });
});

describe('activeStudentsFor', () => {
  it('does not filter by createdAt', () => {
    // createdAt records when the row was TYPED, not when the student enrolled.
    // Filtering on it breaks the most ordinary workflow there is: set up the
    // roster today, then backfill last week. Every student would vanish.
    const doc = makeDoc();
    const backInTime = activeStudentsFor(doc, '2026-01-05');
    expect(backInTime).toHaveLength(2);
  });

  it('excludes inactive and archived students', () => {
    const doc = makeDoc();
    doc.students = doc.students.map((s) => (s.id === T.priya ? { ...s, active: false } : s));
    expect(activeStudentsFor(doc, WED).map((s) => s.id)).toEqual([T.jordan]);
  });
});

describe('buildBoardModel', () => {
  it('returns lanes even when no day record exists', () => {
    // The UI must be able to show the roster with an honest "no record" state
    // rather than an empty screen.
    const model = buildBoardModel(makeDoc(), { dateKey: WED, now });
    expect(model.hasRecord).toBe(false);
    expect(model.lanes).toHaveLength(2);
    expect(model.lanes[0].columns[STATUS.UNASSIGNED].length).toBeGreaterThan(0);
  });

  it('places cards in columns by STORED status, not resolved status', () => {
    // A resolved not_used still belongs in Unassigned so it stays visible and
    // correctable rather than disappearing off the board.
    const doc = withDay(makeDoc(), TUE, {});
    const model = buildBoardModel(doc, { dateKey: TUE, now });
    const lane = model.lanes.find((l) => l.studentId === T.jordan);

    expect(lane.columns[STATUS.UNASSIGNED].length).toBe(3);
    expect(lane.columns[STATUS.UNASSIGNED][0].resolved).toBe(STATUS.NOT_USED);
  });

  it('reports a recorded status in the right column', () => {
    const doc = withDay(makeDoc(), WED, {
      [T.jordan]: { entries: { [T.asgJordanExtTime]: STATUS.USED } },
    });
    const model = buildBoardModel(doc, { dateKey: WED, now });
    const lane = model.lanes.find((l) => l.studentId === T.jordan);
    expect(lane.columns[STATUS.USED].map((c) => c.assignmentId)).toEqual([T.asgJordanExtTime]);
  });

  it('flags noClassToday on a weekend', () => {
    // Without this the board shows a wall of ghosted, un-droppable cards and no
    // reason why.
    const model = buildBoardModel(makeDoc(), { dateKey: SAT, now });
    expect(model.noClassToday).toBe(true);
  });

  it('flags noClassToday on a non-instructional date', () => {
    const doc = makeDoc();
    doc.schoolCalendar.nonInstructionalDates = [WED];
    const model = buildBoardModel(doc, { dateKey: WED, now });
    expect(model.noClassToday).toBe(true);
    expect(model.isNonInstructional).toBe(true);
  });

  it('treats every student as in class on a school day, whatever their period', () => {
    // A period records which class a student is in, not when it runs - so no
    // weekday can put one lane out of scope and leave another in it.
    const model = buildBoardModel(makeDoc(), { dateKey: TUE, now });
    expect(model.noClassToday).toBe(false);
    expect(model.lanes.every((l) => l.meets)).toBe(true);
  });

  it('filters by period', () => {
    const model = buildBoardModel(makeDoc(), { dateKey: WED, periodIds: [T.p3], now });
    expect(model.lanes.map((l) => l.studentId)).toEqual([T.priya]);
  });

  it('filters by search and reports how many were hidden', () => {
    const model = buildBoardModel(makeDoc(), { dateKey: WED, search: 'raman', now });
    expect(model.lanes.map((l) => l.studentId)).toEqual([T.priya]);
    expect(model.hiddenBySearch).toBe(1);
  });

  it('marks a card needing detail when delivered without a narrative', () => {
    const doc = withDay(makeDoc(), WED, {
      // "Text read aloud" requires a detail.
      [T.jordan]: { entries: { [T.asgJordanReadAloud]: STATUS.USED_WITH_DETAIL } },
    });
    const model = buildBoardModel(doc, { dateKey: WED, now });
    const lane = model.lanes.find((l) => l.studentId === T.jordan);
    expect(lane.detailsMissing).toBe(1);
    expect(model.detailsMissing).toBe(1);
  });

  it('does not flag a card whose detail is present', () => {
    const doc = withDay(makeDoc(), WED, {
      [T.jordan]: {
        entries: {
          [T.asgJordanReadAloud]: { status: STATUS.USED_WITH_DETAIL, detail: 'Section 3.2.' },
        },
      },
    });
    const model = buildBoardModel(doc, { dateKey: WED, now });
    expect(model.detailsMissing).toBe(0);
  });

  it('reports absence on the lane and keeps recorded cards visible', () => {
    const doc = withDay(makeDoc(), WED, {
      [T.jordan]: { absent: true, entries: { [T.asgJordanExtTime]: STATUS.USED } },
    });
    const model = buildBoardModel(doc, { dateKey: WED, now });
    const lane = model.lanes.find((l) => l.studentId === T.jordan);

    expect(lane.absent).toBe(true);
    // Absence excludes the student from compliance math; it does not erase data.
    expect(lane.columns[STATUS.USED]).toHaveLength(1);
    expect(lane.summary.counts[DERIVED_STATUS.ABSENT]).toBeGreaterThan(0);
  });

  it('marks the model sealed and non-editable for a sealed day', () => {
    const doc = withDay(makeDoc(), TUE, { __sealed: true });
    const model = buildBoardModel(doc, { dateKey: TUE, now });
    expect(model.sealed).toBe(true);
    expect(model.editable).toBe(false);
  });

  it('carries the label snapshot so the board agrees with what will print', () => {
    const doc = withDay(makeDoc(), WED, {});
    // Reword the catalog after the day was created.
    doc.catalog = doc.catalog.map((c) =>
      c.id === T.catExtTime ? { ...c, label: 'RENAMED LATER' } : c
    );
    const model = buildBoardModel(doc, { dateKey: WED, now });
    const lane = model.lanes.find((l) => l.studentId === T.jordan);
    const card = lane.columns[STATUS.UNASSIGNED].find((c) => c.assignmentId === T.asgJordanExtTime);
    expect(card.label).toBe('snapshot');
    expect(card.label).not.toBe('RENAMED LATER');
  });
});

/**
 * A-Z means the surname, the way every other list a teacher holds is ordered.
 * This sorted on displayName - "Jordan A." - which files Jordan under J.
 */
describe('lane order', () => {
  const roster = (doc, sort) =>
    buildBoardModel(doc, { dateKey: WED, sort, now }).lanes.map((l) => l.displayName);

  function withNames(pairs) {
    const doc = makeDoc();
    return {
      ...doc,
      students: pairs.map(([firstName, lastName], i) => ({
        ...doc.students[0],
        id: `stu_${i}`,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName.slice(0, 1)}.`.trim(),
        sortOrder: i,
        periodIds: [],
      })),
      assignments: [],
    };
  }

  it('files by surname, not forename', () => {
    const doc = withNames([
      ['Zoe', 'Abbott'],
      ['Adam', 'Zeller'],
      ['Mia', 'Nkemelu'],
    ]);
    expect(roster(doc, 'az')).toEqual(['Zoe A.', 'Mia N.', 'Adam Z.']);
  });

  it('breaks a shared surname on the forename', () => {
    const doc = withNames([
      ['Sam', 'Rivera'],
      ['Ana', 'Rivera'],
    ]);
    expect(roster(doc, 'az')).toEqual(['Ana R.', 'Sam R.']);
  });

  it('reverses for Z-A', () => {
    const doc = withNames([
      ['Zoe', 'Abbott'],
      ['Adam', 'Zeller'],
    ]);
    expect(roster(doc, 'za')).toEqual(['Adam Z.', 'Zoe A.']);
  });

  it('files an accented surname where a reader expects it, not after Z', () => {
    const doc = withNames([
      ['Sofia', 'Núñez'],
      ['Tom', 'Oakes'],
      ['Rae', 'Nolan'],
    ]);
    expect(roster(doc, 'az')).toEqual(['Rae N.', 'Sofia N.', 'Tom O.']);
  });

  /** A roster pasted as bare single names has no surname to file under. */
  it('falls back to the forename when there is no surname', () => {
    const doc = withNames([
      ['Wren', ''],
      ['Ada', ''],
    ]);
    expect(roster(doc, 'az')).toEqual(['Ada .', 'Wren .']);
  });
});

/**
 * Grouping the roster by period. The period's own sortOrder, never digits read
 * out of its name - renaming "Period 3" to "Geometry" does not move it.
 */
describe('lane order by period', () => {
  const P1 = 'per_a';
  const P3 = 'per_b';

  function docWithPeriods(pairs) {
    const base = makeDoc();
    return {
      ...base,
      periods: [
        { ...base.periods[0], id: P1, name: 'Geometry', shortName: 'P1', sortOrder: 1 },
        { ...base.periods[0], id: P3, name: 'Algebra I', shortName: 'P3', sortOrder: 3 },
      ],
      students: pairs.map(([firstName, lastName, periodIds], i) => ({
        ...base.students[0],
        id: `stu_${i}`,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName.slice(0, 1)}.`.trim(),
        sortOrder: i,
        periodIds,
      })),
      assignments: [],
    };
  }

  const roster = (doc, sort = 'az') =>
    buildBoardModel(doc, { dateKey: WED, sort, sortBy: 'period', now }).lanes.map(
      (l) => l.displayName
    );

  it('groups by period and stays alphabetical inside each', () => {
    const doc = docWithPeriods([
      ['Zoe', 'Adams', [P3]],
      ['Bea', 'Young', [P1]],
      ['Ann', 'Baker', [P1]],
    ]);
    expect(roster(doc)).toEqual(['Ann B.', 'Bea Y.', 'Zoe A.']);
  });

  it('reverses both halves for Z-A', () => {
    const doc = docWithPeriods([
      ['Ann', 'Baker', [P1]],
      ['Bea', 'Young', [P1]],
      ['Zoe', 'Adams', [P3]],
    ]);
    expect(roster(doc, 'za')).toEqual(['Zoe A.', 'Bea Y.', 'Ann B.']);
  });

  /** A student in two of this teacher's classes belongs with the earlier one. */
  it('files a student in several periods under the earliest', () => {
    const doc = docWithPeriods([
      ['Zoe', 'Adams', [P3, P1]],
      ['Ann', 'Baker', [P3]],
    ]);
    expect(roster(doc)).toEqual(['Zoe A.', 'Ann B.']);
  });

  /** A loose end belongs at the bottom of a list, not the top of it. */
  it('sorts a student with no period last', () => {
    const doc = docWithPeriods([
      ['Zoe', 'Adams', []],
      ['Ann', 'Baker', [P3]],
    ]);
    expect(roster(doc)).toEqual(['Ann B.', 'Zoe A.']);
  });

  it('leaves the plain name order alone when it is not asked for', () => {
    const doc = docWithPeriods([
      ['Zoe', 'Adams', [P3]],
      ['Ann', 'Baker', [P1]],
    ]);
    const byName = buildBoardModel(doc, { dateKey: WED, sort: 'az', now }).lanes.map(
      (l) => l.displayName
    );
    expect(byName).toEqual(['Zoe A.', 'Ann B.']);
  });
});
