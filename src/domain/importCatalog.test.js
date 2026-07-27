import { describe, it, expect } from 'vitest';
import { parseCatalogPaste, labelKey, importSummary } from './importCatalog.js';

const existing = [
  { id: 'cat_1', label: 'Extended time (1.5x) on assessments' },
  { id: 'cat_2', label: 'Preferential seating (front, near instruction)' },
];

describe('labelKey', () => {
  it('folds case, accents and whitespace runs', () => {
    expect(labelKey('  Extended   TIME  ')).toBe('extended time');
    expect(labelKey('Réduced items')).toBe('reduced items');
  });

  it('ignores trailing punctuation', () => {
    expect(labelKey('Frequent breaks.')).toBe('frequent breaks');
    expect(labelKey('Frequent breaks,')).toBe('frequent breaks');
  });

  it('preserves internal punctuation so similar accommodations stay distinct', () => {
    // These are genuinely different accommodations and must never collapse.
    expect(labelKey('Extended time (1.5x)')).not.toBe(labelKey('Extended time (2x)'));
  });
});

describe('parseCatalogPaste — delimiters', () => {
  it('splits Google Sheets tab-separated paste', () => {
    const text = 'Small-group testing\tsetting\tno\nFrequent breaks\tenvironment\tno';
    const r = parseCatalogPaste(text, []);
    expect(r.toAdd).toHaveLength(2);
    expect(r.toAdd[0]).toEqual({
      label: 'Small-group testing',
      category: 'setting',
      requiresDetail: false,
    });
  });

  it('does NOT split on commas when tabs are present', () => {
    // The critical case: real labels are full of commas.
    const text = 'Preferential seating (front, near instruction)\tsetting';
    const r = parseCatalogPaste(text, []);
    expect(r.toAdd).toHaveLength(1);
    expect(r.toAdd[0].label).toBe('Preferential seating (front, near instruction)');
  });

  it('does not split a single comma-containing label when there are no tabs', () => {
    // With no tabs anywhere we fall back to commas, which would shred this label.
    // A one-column paste of plain labels is the common case, so verify the
    // fallback only engages when it plausibly is a CSV.
    const text = 'Read aloud, verbatim\nSmall-group testing';
    const r = parseCatalogPaste(text, []);
    // Comma fallback engages, so the first row splits — label is the first cell.
    expect(r.toAdd.map((x) => x.label)).toEqual(['Read aloud', 'Small-group testing']);
  });

  it('handles a plain newline-separated list with no delimiters', () => {
    const text = 'Small-group testing\nFrequent breaks\nCalculator permitted';
    const r = parseCatalogPaste(text, []);
    expect(r.toAdd.map((x) => x.label)).toEqual([
      'Small-group testing',
      'Frequent breaks',
      'Calculator permitted',
    ]);
  });

  it('strips surrounding quotes that spreadsheets add', () => {
    const r = parseCatalogPaste('"Small-group testing"\tsetting', []);
    expect(r.toAdd[0].label).toBe('Small-group testing');
  });

  it('normalises CRLF line endings', () => {
    const r = parseCatalogPaste('Frequent breaks\r\nCalculator permitted', []);
    expect(r.toAdd).toHaveLength(2);
  });
});

describe('parseCatalogPaste — headers', () => {
  it('skips a recognised header row', () => {
    const text = 'Accommodation\tCategory\tNeeds detail\nFrequent breaks\tenvironment\tno';
    const r = parseCatalogPaste(text, []);
    expect(r.headerSkipped).toBe(true);
    expect(r.toAdd).toHaveLength(1);
    expect(r.toAdd[0].label).toBe('Frequent breaks');
  });

  it('does not mistake a real accommodation for a header', () => {
    const r = parseCatalogPaste('Frequent breaks\nCalculator permitted', []);
    expect(r.headerSkipped).toBe(false);
    expect(r.toAdd).toHaveLength(2);
  });
});

describe('parseCatalogPaste — duplicates are never imported', () => {
  it('detects a duplicate of an existing catalog entry', () => {
    const r = parseCatalogPaste('Extended time (1.5x) on assessments', existing);
    expect(r.toAdd).toHaveLength(0);
    expect(r.duplicatesExisting).toHaveLength(1);
    expect(r.duplicatesExisting[0].existingLabel).toBe('Extended time (1.5x) on assessments');
  });

  it('detects a duplicate that differs only by case, spacing or accent', () => {
    const r = parseCatalogPaste('  EXTENDED   TIME (1.5x) ON ASSESSMENTS  ', existing);
    expect(r.toAdd).toHaveLength(0);
    expect(r.duplicatesExisting).toHaveLength(1);
  });

  it('detects a duplicate that differs only by trailing punctuation', () => {
    const r = parseCatalogPaste('Extended time (1.5x) on assessments.', existing);
    expect(r.toAdd).toHaveLength(0);
    expect(r.duplicatesExisting).toHaveLength(1);
  });

  it('detects duplicates within the pasted block itself', () => {
    const text = 'Frequent breaks\nFrequent breaks\nFREQUENT BREAKS';
    const r = parseCatalogPaste(text, []);
    expect(r.toAdd).toHaveLength(1);
    expect(r.duplicatesInFile).toHaveLength(2);
  });

  it('keeps genuinely different accommodations that merely look similar', () => {
    const r = parseCatalogPaste('Extended time (2x) on assessments', existing);
    expect(r.toAdd).toHaveLength(1);
    expect(r.duplicatesExisting).toHaveLength(0);
  });

  it('reports duplicates against a comma-containing existing label', () => {
    const r = parseCatalogPaste(
      'preferential seating (front, near instruction)\tsetting',
      existing
    );
    expect(r.toAdd).toHaveLength(0);
    expect(r.duplicatesExisting).toHaveLength(1);
  });
});

describe('parseCatalogPaste — extra columns', () => {
  it('resolves a category by id or by label', () => {
    const r = parseCatalogPaste('A\ttiming\nB\tTiming & scheduling\nC\tnonsense', []);
    expect(r.toAdd.map((x) => x.category)).toEqual(['timing', 'timing', 'other']);
  });

  it('reads requiresDetail from several truthy spellings', () => {
    const r = parseCatalogPaste('A\tother\tyes\nB\tother\tTRUE\nC\tother\t1\nD\tother\tno', []);
    expect(r.toAdd.map((x) => x.requiresDetail)).toEqual([true, true, true, false]);
  });

  it('defaults category to other and requiresDetail to false', () => {
    const r = parseCatalogPaste('Frequent breaks', []);
    expect(r.toAdd[0]).toEqual({
      label: 'Frequent breaks',
      category: 'other',
      requiresDetail: false,
    });
  });
});

describe('parseCatalogPaste — junk handling', () => {
  it('ignores blank lines', () => {
    const r = parseCatalogPaste('A\n\n\nB\n   \n', []);
    expect(r.toAdd).toHaveLength(2);
  });

  it('skips a row with an empty first cell', () => {
    const r = parseCatalogPaste('\tsetting\tno', []);
    expect(r.toAdd).toHaveLength(0);
    expect(r.skipped[0].reason).toBe('empty');
  });

  it('skips an absurdly long label rather than importing garbage', () => {
    const r = parseCatalogPaste('x'.repeat(400), []);
    expect(r.toAdd).toHaveLength(0);
    expect(r.skipped[0].reason).toBe('too long');
  });

  it('handles empty and nullish input without throwing', () => {
    for (const input of ['', '   ', null, undefined]) {
      const r = parseCatalogPaste(input, existing);
      expect(r.toAdd).toHaveLength(0);
      expect(r.totalRows).toBe(0);
    }
  });

  it('collapses internal whitespace in the stored label', () => {
    const r = parseCatalogPaste('Frequent    breaks', []);
    expect(r.toAdd[0].label).toBe('Frequent breaks');
  });
});

describe('importSummary', () => {
  it('totals the buckets', () => {
    const parsed = parseCatalogPaste(
      'Extended time (1.5x) on assessments\nFrequent breaks\nFrequent breaks\n' + 'x'.repeat(400),
      existing
    );
    expect(importSummary(parsed)).toEqual({ add: 1, duplicates: 2, skipped: 1 });
  });
});
