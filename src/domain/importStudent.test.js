import { describe, it, expect } from 'vitest';
import {
  splitAccommodationList,
  resolveAccommodationList,
  addStudentWithAccommodations,
} from './importStudent.js';
import { createEmptyDoc } from './schema.js';
import { itemsForSet, STARTER_SETS, allStarterItems } from './starterSets.js';

const catalog = [
  { id: 'cat_1', label: 'Extended time (1.5x) on assessments' },
  { id: 'cat_2', label: 'Preferential seating (front, near instruction)' },
];

describe('splitAccommodationList — delimiters', () => {
  it('splits a pasted column on newlines', () => {
    const r = splitAccommodationList('Extended time\nSmall-group testing\nFrequent breaks');
    expect(r).toEqual(['Extended time', 'Small-group testing', 'Frequent breaks']);
  });

  it('splits a pasted row on tabs', () => {
    expect(splitAccommodationList('Extended time\tFrequent breaks')).toEqual([
      'Extended time',
      'Frequent breaks',
    ]);
  });

  it('splits a single cell on commas', () => {
    expect(splitAccommodationList('Extended time, Frequent breaks, Calculator permitted')).toEqual([
      'Extended time',
      'Frequent breaks',
      'Calculator permitted',
    ]);
  });

  it('protects commas inside brackets', () => {
    // The case that would otherwise shred a real accommodation in half.
    const r = splitAccommodationList(
      'Preferential seating (front, near instruction), Extended time (1.5x)'
    );
    expect(r).toEqual(['Preferential seating (front, near instruction)', 'Extended time (1.5x)']);
  });

  it('protects commas inside quotes', () => {
    const r = splitAccommodationList('"Read aloud, verbatim", Frequent breaks');
    expect(r).toEqual(['Read aloud, verbatim', 'Frequent breaks']);
  });

  it('prefers newlines over commas when both are present', () => {
    // A pasted column whose cells contain commas must split by row, not by comma.
    const r = splitAccommodationList('Seating (front, centre)\nExtended time, 1.5x');
    expect(r).toEqual(['Seating (front, centre)', 'Extended time, 1.5x']);
  });

  it('strips bullets and numbering that come with a pasted list', () => {
    const r = splitAccommodationList(
      '- Extended time\n• Frequent breaks\n1. Read aloud\n2) Scribe'
    );
    expect(r).toEqual(['Extended time', 'Frequent breaks', 'Read aloud', 'Scribe']);
  });

  it('collapses whitespace and drops blank cells', () => {
    expect(splitAccommodationList('  Extended    time  \n\n\n   \nFrequent breaks')).toEqual([
      'Extended time',
      'Frequent breaks',
    ]);
  });

  it('handles empty and nullish input', () => {
    for (const input of ['', '   ', null, undefined]) {
      expect(splitAccommodationList(input)).toEqual([]);
    }
  });

  it('handles a trailing delimiter without producing an empty item', () => {
    expect(splitAccommodationList('Extended time, Frequent breaks,')).toEqual([
      'Extended time',
      'Frequent breaks',
    ]);
  });
});

describe('resolveAccommodationList', () => {
  it('reuses an existing catalog entry and reports it as not new', () => {
    const r = resolveAccommodationList('extended TIME (1.5x) on assessments', catalog);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].isNew).toBe(false);
    expect(r.items[0].catalogId).toBe('cat_1');
    // Adopts the catalog's own wording rather than the pasted casing.
    expect(r.items[0].label).toBe('Extended time (1.5x) on assessments');
  });

  it('flags a genuinely new accommodation', () => {
    const r = resolveAccommodationList('Noise-cancelling headphones', catalog);
    expect(r.items[0].isNew).toBe(true);
    expect(r.items[0].catalogId).toBeNull();
  });

  it('drops duplicates within the paste', () => {
    const r = resolveAccommodationList('Frequent breaks, frequent breaks, FREQUENT BREAKS', []);
    expect(r.items).toHaveLength(1);
    expect(r.duplicates).toHaveLength(2);
  });
});

describe('addStudentWithAccommodations', () => {
  const base = () => {
    const doc = createEmptyDoc(new Date(2026, 8, 16));
    doc.teachers = [{ id: 'tch_1', displayName: 'Ms. R' }];
    doc.settings.activeTeacherId = 'tch_1';
    doc.periods = [
      {
        id: 'per_1',
        shortName: 'P1',
        name: 'P1',
        sortOrder: 1,
        archivedAt: null,
      },
    ];
    return doc;
  };

  it('creates the student with their SASID and plan type', () => {
    const { doc, studentId } = addStudentWithAccommodations(base(), {
      displayName: 'J.A.',
      sasid: '1234567890',
      planType: '504',
      periodIds: ['per_1'],
      accommodations: ['Frequent breaks'],
    });
    const student = doc.students.find((s) => s.id === studentId);
    expect(student.displayName).toBe('J.A.');
    expect(student.sasid).toBe('1234567890');
    expect(student.planType).toBe('504');
    expect(student.periodIds).toEqual(['per_1']);
  });

  it('creates catalog entries for new accommodations and links them', () => {
    const { doc, report } = addStudentWithAccommodations(base(), {
      displayName: 'J.A.',
      accommodations: ['Frequent breaks', 'Calculator permitted'],
    });
    expect(report).toMatchObject({ added: 2, created: 2, reused: 0 });
    expect(doc.catalog).toHaveLength(2);
    expect(doc.assignments).toHaveLength(2);
    expect(doc.assignments.every((a) => a.source === 'catalog' && a.catalogId)).toBe(true);
  });

  it('reuses an existing catalog entry rather than duplicating it', () => {
    // The whole point: a second student with the same accommodation must not
    // create a second catalog row.
    let doc = base();
    doc = addStudentWithAccommodations(doc, {
      displayName: 'A',
      accommodations: ['Frequent breaks'],
    }).doc;
    const second = addStudentWithAccommodations(doc, {
      displayName: 'B',
      accommodations: ['frequent BREAKS'],
    });

    expect(second.report).toMatchObject({ added: 1, created: 0, reused: 1 });
    expect(second.doc.catalog).toHaveLength(1);
    expect(second.doc.assignments).toHaveLength(2);
  });

  it('skips duplicates within one student', () => {
    const { report, doc } = addStudentWithAccommodations(base(), {
      displayName: 'A',
      accommodations: ['Frequent breaks', 'Frequent breaks'],
    });
    expect(report.added).toBe(1);
    expect(report.skipped).toBe(1);
    expect(doc.assignments).toHaveLength(1);
  });

  it('accepts starter-set items with their category and detail flag', () => {
    const { doc } = addStudentWithAccommodations(base(), {
      displayName: 'A',
      accommodations: itemsForSet('timing'),
    });
    const extended = doc.catalog.find((c) => c.label.startsWith('Extended time (1.5x)'));
    expect(extended.category).toBe('timing');

    const split = doc.catalog.find((c) => c.label.startsWith('Assessment split'));
    expect(split.requiresDetail).toBe(true);
    // Anything needing a narrative opts out of bulk automatically.
    expect(split.bulkEligible).toBe(false);
  });

  it('does not mutate the input document', () => {
    const doc = base();
    const before = doc.students.length;
    addStudentWithAccommodations(doc, { displayName: 'A', accommodations: ['X'] });
    expect(doc.students).toHaveLength(before);
    expect(doc.catalog).toHaveLength(0);
  });

  it('tolerates an empty accommodation list', () => {
    const { doc, report } = addStudentWithAccommodations(base(), {
      displayName: 'A',
      accommodations: [],
    });
    expect(report.added).toBe(0);
    expect(doc.students).toHaveLength(1);
  });

  it('end-to-end: paste text straight through to a saved student', () => {
    const pasted = 'Preferential seating (front, near instruction), Extended time (1.5x), Scribe';
    const doc = base();
    const resolved = resolveAccommodationList(pasted, doc.catalog);
    const { doc: next, report } = addStudentWithAccommodations(doc, {
      displayName: 'J.A.',
      sasid: '999',
      accommodations: resolved.items,
    });
    expect(report.added).toBe(3);
    expect(next.catalog.map((c) => c.label)).toContain(
      'Preferential seating (front, near instruction)'
    );
  });
});

describe('starter sets', () => {
  it('every set has items with a valid shape', () => {
    for (const set of STARTER_SETS) {
      expect(set.items.length).toBeGreaterThan(0);
      for (const [label, category, requiresDetail] of set.items) {
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(2);
        expect(typeof category).toBe('string');
        expect(typeof requiresDetail).toBe('boolean');
      }
    }
  });

  it('has no duplicate labels across all sets', () => {
    const labels = allStarterItems().map((i) => i.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
  });
});
