/**
 * Identifier generation.
 *
 * Ids are opaque and permanent. They are the join keys inside data.json and end
 * up embedded in years of day records, so they must never be recycled and never
 * be derived from mutable content (a student's name can change; their id cannot).
 *
 * Format: `<prefix>_<base36 time><counter><random>` — sortable-ish by creation,
 * short enough to stay readable when hand-inspecting the JSON.
 */

const PREFIX = {
  teacher: 'tch',
  period: 'per',
  student: 'stu',
  catalog: 'cat',
  assignment: 'asg',
};

let counter = 0;

function randomChunk() {
  // crypto is available in both Electron's renderer and Node 22 test runs.
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0].toString(36).slice(0, 4).padStart(4, '0');
  }
  return Math.random().toString(36).slice(2, 6).padStart(4, '0');
}

export function makeId(kind) {
  const prefix = PREFIX[kind] || kind;
  counter = (counter + 1) % 1296; // two base36 digits
  const time = Date.now().toString(36);
  return `${prefix}_${time}${counter.toString(36).padStart(2, '0')}${randomChunk()}`;
}

export const newTeacherId = () => makeId('teacher');
export const newPeriodId = () => makeId('period');
export const newStudentId = () => makeId('student');
export const newCatalogId = () => makeId('catalog');
export const newAssignmentId = () => makeId('assignment');

/**
 * Deterministic id factory for tests and fixtures, so a snapshot doesn't churn
 * on every run.
 */
export function createIdFactory(prefixSeed = 'test') {
  let n = 0;
  return (kind) => {
    n += 1;
    return `${PREFIX[kind] || kind}_${prefixSeed}${String(n).padStart(4, '0')}`;
  };
}
