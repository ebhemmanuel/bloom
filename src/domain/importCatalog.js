import { CATEGORIES } from './constants.js';

/**
 * Import accommodations pasted from a spreadsheet (Google Sheets, Excel, or a
 * plain list). Pure - no I/O, no clipboard access; the UI hands over text.
 *
 * Google Sheets puts TAB-separated values on the clipboard, so tabs are the
 * primary delimiter. Commas are only used as a fallback when the paste contains
 * no tabs at all, because accommodation wording is full of commas
 * ("Preferential seating (front, near instruction)") and splitting on them by
 * default would shred real labels.
 */

/** Header words that mean "this row is a header, not data". */
const HEADER_HINTS = [
  'accommodation',
  'accommodations',
  'label',
  'name',
  'description',
  'support',
  'service',
];

const TRUTHY = ['yes', 'y', 'true', '1', 'x', 'required'];

/**
 * Fold a label to a comparison key.
 *
 * Case, accents, surrounding whitespace, internal whitespace runs, and trailing
 * punctuation are all ignored - those are the ways the same accommodation gets
 * typed differently across a district's spreadsheets. Deliberately conservative
 * beyond that: internal punctuation is preserved, because "Extended time (1.5x)"
 * and "Extended time (2x)" are genuinely different accommodations and must not
 * collapse into one.
 */
export function labelKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.;:,\s]+$/, '')
    .trim();
}

/**
 * Rows are NOT trimmed - only fully blank ones are dropped.
 *
 * Trimming a row strips a leading tab, which silently deletes an empty first
 * column and shifts every remaining field one place left. A spreadsheet with a
 * blank label column would then import its category as the accommodation name.
 * Cells are trimmed individually in splitCells instead.
 */
function splitRows(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0);
}

function splitCells(row, delimiter) {
  return row.split(delimiter).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
}

function looksLikeHeader(cells) {
  const first = labelKey(cells[0]);
  return HEADER_HINTS.includes(first);
}

function resolveCategory(value) {
  const key = labelKey(value);
  if (!key) return 'other';
  const byId = CATEGORIES.find((c) => c.id === key);
  if (byId) return byId.id;
  const byLabel = CATEGORIES.find((c) => labelKey(c.label) === key);
  return byLabel ? byLabel.id : 'other';
}

/**
 * Parse pasted spreadsheet text into catalog rows and classify each one.
 *
 * Column order, all optional past the first:
 *   1. label   2. category   3. requires detail (yes/true/1/x)
 *
 * @param {string} text            raw clipboard text
 * @param {Array}  existingCatalog current doc.catalog, for duplicate detection
 * @returns {{
 *   toAdd: Array<{label: string, category: string, requiresDetail: boolean}>,
 *   duplicatesInFile: Array<{label: string, line: number}>,
 *   duplicatesExisting: Array<{label: string, line: number, existingLabel: string}>,
 *   skipped: Array<{line: number, reason: string}>,
 *   headerSkipped: boolean,
 *   totalRows: number
 * }}
 */
export function parseCatalogPaste(text, existingCatalog = []) {
  const rows = splitRows(text);
  const result = {
    toAdd: [],
    duplicatesInFile: [],
    duplicatesExisting: [],
    skipped: [],
    headerSkipped: false,
    totalRows: 0,
  };

  if (rows.length === 0) return result;

  // Tabs win when present. Commas only when the paste has no tabs anywhere.
  const hasTabs = rows.some((r) => r.includes('\t'));
  const delimiter = hasTabs ? '\t' : rows.some((r) => r.includes(',')) ? ',' : null;

  // Existing labels, plus archived ones - re-importing something a teacher
  // deliberately archived should not silently resurrect it as a new entry.
  const existingByKey = new Map();
  for (const entry of existingCatalog) {
    existingByKey.set(labelKey(entry.label), entry.label);
  }

  const seenInFile = new Map();

  rows.forEach((row, index) => {
    const line = index + 1;
    const cells = delimiter ? splitCells(row, delimiter) : [row.trim()];
    if (cells.length === 0) return;

    if (index === 0 && looksLikeHeader(cells)) {
      result.headerSkipped = true;
      return;
    }

    result.totalRows += 1;

    const label = cells[0];
    if (!label) {
      result.skipped.push({ line, reason: 'empty' });
      return;
    }
    if (label.length > 300) {
      result.skipped.push({ line, reason: 'too long' });
      return;
    }

    const key = labelKey(label);
    if (!key) {
      result.skipped.push({ line, reason: 'empty' });
      return;
    }

    if (existingByKey.has(key)) {
      result.duplicatesExisting.push({ label, line, existingLabel: existingByKey.get(key) });
      return;
    }
    if (seenInFile.has(key)) {
      result.duplicatesInFile.push({ label, line });
      return;
    }

    seenInFile.set(key, label);
    result.toAdd.push({
      label: label.replace(/\s+/g, ' ').trim(),
      category: resolveCategory(cells[1]),
      requiresDetail: TRUTHY.includes(labelKey(cells[2])),
    });
  });

  return result;
}

/** Convenience count for the UI summary line. */
export function importSummary(parsed) {
  return {
    add: parsed.toAdd.length,
    duplicates: parsed.duplicatesInFile.length + parsed.duplicatesExisting.length,
    skipped: parsed.skipped.length,
  };
}
