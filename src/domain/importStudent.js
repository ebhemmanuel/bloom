import { labelKey } from './importCatalog.js';
import { newStudentId, newCatalogId, newAssignmentId } from './ids.js';
import { isoTimestamp } from './dates.js';
import { CATEGORIES, PLAN_TYPES } from './constants.js';

/**
 * Adding one student and their accommodations in a single step.
 *
 * The realistic input is a teacher with the student's IEP open, copying the
 * accommodation cells out of a spreadsheet. So the paste field has to cope with
 * whatever the clipboard actually contains: a column of cells (newlines), a row
 * of cells (tabs), or one cell holding a comma-separated list.
 */

/**
 * Split a pasted accommodation list.
 *
 * Delimiter precedence — newlines and tabs first, commas only as a last resort:
 *
 * Real accommodation wording is full of commas ("Preferential seating (front,
 * near instruction)"), so splitting on them eagerly would shred labels. When
 * commas ARE the delimiter, those inside brackets or quotes are protected, which
 * keeps that exact example intact.
 */
export function splitAccommodationList(text) {
  const raw = String(text ?? '').replace(/\r\n?/g, '\n');
  if (!raw.trim()) return [];

  // Newlines and tabs are unambiguous: Excel produced them, not the author.
  if (/[\n\t]/.test(raw)) {
    return raw
      .split(/[\n\t]+/)
      .map(cleanupCell)
      .filter(Boolean);
  }

  return splitOnTopLevelCommas(raw).map(cleanupCell).filter(Boolean);
}

/** Split on commas that are not inside (), [], {} or quotes. */
function splitOnTopLevelCommas(text) {
  const out = [];
  let current = '';
  let depth = 0;
  let quote = null;

  for (const char of text) {
    if (quote) {
      if (char === quote) quote = null;
      current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(' || char === '[' || char === '{') depth += 1;
    if (char === ')' || char === ']' || char === '}') depth = Math.max(0, depth - 1);

    if (char === ',' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  out.push(current);
  return out;
}

function cleanupCell(cell) {
  return (
    String(cell)
      .replace(/\s+/g, ' ')
      .trim()
      // Strip spreadsheet quoting and list bullets/numbering.
      .replace(/^["']|["']$/g, '')
      .replace(/^\s*(?:[-•*·–]|\d+[.)])\s*/, '')
      .replace(/[;,]$/, '')
      .trim()
  );
}

/**
 * Classify a pasted list against the existing catalog.
 *
 * @returns {{
 *   items: Array<{label: string, catalogId: string|null, isNew: boolean}>,
 *   duplicates: string[],
 *   totalParsed: number
 * }}
 */
export function resolveAccommodationList(text, catalog = []) {
  const labels = splitAccommodationList(text);
  const byKey = new Map(catalog.map((c) => [labelKey(c.label), c]));
  const seen = new Set();

  const items = [];
  const duplicates = [];

  for (const label of labels) {
    const key = labelKey(label);
    if (!key) continue;
    if (seen.has(key)) {
      duplicates.push(label);
      continue;
    }
    seen.add(key);

    const existing = byKey.get(key);
    items.push({
      label: existing ? existing.label : label,
      catalogId: existing ? existing.id : null,
      isNew: !existing,
    });
  }

  return { items, duplicates, totalParsed: labels.length };
}

/**
 * Create a student and attach their accommodations in one operation.
 *
 * Accommodations reuse a catalog entry when one already matches (case, accent and
 * spacing insensitive) and create one otherwise, so a teacher pasting the same
 * wording for a second student does not end up with a duplicated catalog.
 *
 * @returns {{ doc: object, studentId: string, report: object }}
 */
export function addStudentWithAccommodations(
  doc,
  {
    displayName,
    sasid = '',
    planType = 'IEP',
    periodIds = [],
    caseManager = '',
    accommodations = [],
  },
  now = new Date()
) {
  const stamp = isoTimestamp(now);
  const studentId = newStudentId();

  const student = {
    id: studentId,
    teacherId: doc.settings?.activeTeacherId || doc.teachers[0]?.id || null,
    // A single display label on purpose. Teachers are encouraged to use whatever
    // identifies the student to them — initials or a code work fine — so the file
    // need not hold a full legal name.
    firstName: '',
    lastName: displayName || '',
    displayName: displayName || 'Unnamed student',
    periodIds: [...new Set(periodIds)],
    planType: PLAN_TYPES.includes(planType) ? planType : 'IEP',
    sasid: String(sasid || '').trim(),
    planRef: '',
    caseManager,
    sortOrder: doc.students.length,
    active: true,
    archivedAt: null,
    createdAt: stamp,
  };

  const catalog = [...doc.catalog];
  const assignments = [...doc.assignments];
  const byKey = new Map(catalog.map((c) => [labelKey(c.label), c]));

  const report = { added: 0, reused: 0, created: 0, skipped: 0 };
  const seen = new Set();

  accommodations.forEach((item, index) => {
    const label = typeof item === 'string' ? item : item.label;
    const key = labelKey(label);
    if (!key) {
      report.skipped += 1;
      return;
    }
    if (seen.has(key)) {
      report.skipped += 1;
      return;
    }
    seen.add(key);

    let entry = byKey.get(key);
    if (entry) {
      report.reused += 1;
    } else {
      entry = {
        id: newCatalogId(),
        label: String(label).replace(/\s+/g, ' ').trim(),
        category: resolveCategory(typeof item === 'object' ? item.category : null),
        requiresDetail: typeof item === 'object' ? Boolean(item.requiresDetail) : false,
        detailPrompt: null,
        bulkEligible: !(typeof item === 'object' && item.requiresDetail),
        bulkActions: typeof item === 'object' && item.requiresDetail ? [] : ['mark_used'],
        archived: false,
        createdAt: stamp,
      };
      catalog.push(entry);
      byKey.set(key, entry);
      report.created += 1;
    }

    assignments.push({
      id: newAssignmentId(),
      studentId,
      source: 'catalog',
      catalogId: entry.id,
      label: null,
      category: null,
      requiresDetail: null,
      detailPrompt: null,
      bulkEligible: null,
      bulkActions: null,
      sortOrder: (index + 1) * 10,
      defaultStatus: null,
      defaultDetail: '',
      activeFrom: null,
      activeTo: null,
      createdAt: stamp,
    });
    report.added += 1;
  });

  return {
    doc: { ...doc, students: [...doc.students, student], catalog, assignments },
    studentId,
    report,
  };
}

/**
 * Attach accommodations to an EXISTING student, effective from a given date.
 *
 * `activeFrom` is the whole point: a card added in March records from March
 * forward. Earlier days never gain it, so they cannot retroactively seal it as
 * Not Used — the teacher would be documented as having missed something that had
 * not been assigned yet.
 *
 * @returns {{ doc: object, report: {added: number, created: number, reused: number, skipped: number} }}
 */
export function addAccommodationsToStudent(
  doc,
  studentId,
  accommodations,
  { effectiveFrom, now = new Date() } = {}
) {
  const stamp = isoTimestamp(now);
  const catalog = [...doc.catalog];
  const assignments = [...doc.assignments];
  const byKey = new Map(catalog.map((c) => [labelKey(c.label), c]));

  // Anything this student already has, so a re-paste is a no-op rather than a
  // duplicate lane entry.
  const existingForStudent = new Set(
    doc.assignments
      .filter((a) => a.studentId === studentId)
      .map((a) => {
        if (a.source === 'custom') return labelKey(a.label);
        return labelKey(catalog.find((c) => c.id === a.catalogId)?.label);
      })
  );

  const report = { added: 0, created: 0, reused: 0, skipped: 0 };
  const nextOrder = assignments.filter((a) => a.studentId === studentId).length;

  accommodations.forEach((item, index) => {
    const label = typeof item === 'string' ? item : item.label;
    const key = labelKey(label);
    if (!key || existingForStudent.has(key)) {
      report.skipped += 1;
      return;
    }
    existingForStudent.add(key);

    let entry = byKey.get(key);
    if (entry) {
      report.reused += 1;
    } else {
      const requiresDetail = typeof item === 'object' ? Boolean(item.requiresDetail) : false;
      entry = {
        id: newCatalogId(),
        label: String(label).replace(/\s+/g, ' ').trim(),
        category: resolveCategory(typeof item === 'object' ? item.category : null),
        requiresDetail,
        detailPrompt: null,
        bulkEligible: !requiresDetail,
        bulkActions: requiresDetail ? [] : ['mark_used'],
        archived: false,
        createdAt: stamp,
      };
      catalog.push(entry);
      byKey.set(key, entry);
      report.created += 1;
    }

    assignments.push({
      id: newAssignmentId(),
      studentId,
      // A catalog pick keeps its requiresDetail flag and is NOT a one-off; only
      // genuinely new free text becomes a custom entry, and even then it joins
      // the catalog so the next student can reuse it.
      source: 'catalog',
      catalogId: entry.id,
      label: null,
      category: null,
      requiresDetail: null,
      detailPrompt: null,
      bulkEligible: null,
      bulkActions: null,
      sortOrder: (nextOrder + index + 1) * 10,
      defaultStatus: null,
      defaultDetail: '',
      notRelevant: false,
      activeFrom: effectiveFrom || null,
      activeTo: null,
      createdAt: stamp,
    });
    report.added += 1;
  });

  return { doc: { ...doc, catalog, assignments }, report };
}

/**
 * Catalog suggestions for the in-lane autocomplete.
 *
 * Excludes anything the student already has — offering a duplicate is only ever
 * a mis-click waiting to happen.
 */
export function suggestAccommodations(doc, studentId, query, limit = 3) {
  const q = labelKey(query);
  if (q.length < 2) return [];

  const taken = new Set(
    doc.assignments
      .filter((a) => a.studentId === studentId)
      .map((a) =>
        a.source === 'custom'
          ? labelKey(a.label)
          : labelKey(doc.catalog.find((c) => c.id === a.catalogId)?.label)
      )
  );

  return doc.catalog
    .filter((c) => !c.archived)
    .filter((c) => !taken.has(labelKey(c.label)))
    .filter((c) => labelKey(c.label).includes(q))
    .slice(0, limit);
}

function resolveCategory(value) {
  const key = labelKey(value);
  if (!key) return 'other';
  const hit = CATEGORIES.find((c) => c.id === key || labelKey(c.label) === key);
  return hit ? hit.id : 'other';
}
