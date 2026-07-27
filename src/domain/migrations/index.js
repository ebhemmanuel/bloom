import { CURRENT_SCHEMA_VERSION } from '../schema.js';

/**
 * Ordered schema migrations.
 *
 * Each entry is `{ from, to, up(doc) }` where `up` is PURE and must be safe to
 * run on a document that has already been normalised. Add a fixture under
 * `tests/fixtures/v<n>.json` alongside every new migration so the upgrade path
 * stays covered forever, not just on the release that introduced it.
 *
 * v1 is the initial schema, so there is nothing to migrate yet.
 */
export const MIGRATIONS = [];

export { CURRENT_SCHEMA_VERSION };

/**
 * Bring a document up to the current version.
 *
 * A document from a NEWER version is returned untouched with
 * `status: 'too-new'`. The caller must then open read-only - writing would
 * silently strip fields this build does not know about, which on a compliance
 * record is data loss disguised as a successful save.
 *
 * @returns {{ doc: object, status: 'ok'|'migrated'|'too-new', from: number, applied: string[] }}
 */
export function migrate(doc) {
  const from = Number(doc?.schemaVersion) || 0;

  if (from > CURRENT_SCHEMA_VERSION) {
    return { doc, status: 'too-new', from, applied: [] };
  }
  if (from === CURRENT_SCHEMA_VERSION) {
    return { doc, status: 'ok', from, applied: [] };
  }

  let current = doc;
  const applied = [];

  for (const migration of MIGRATIONS) {
    if (migration.from >= from && migration.to <= CURRENT_SCHEMA_VERSION) {
      current = migration.up(current);
      applied.push(`v${migration.from}→v${migration.to}`);
    }
  }

  return {
    doc: { ...current, schemaVersion: CURRENT_SCHEMA_VERSION },
    status: applied.length > 0 ? 'migrated' : 'ok',
    from,
    applied,
  };
}
