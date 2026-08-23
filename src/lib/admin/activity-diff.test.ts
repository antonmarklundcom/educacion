import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ADMIN_ONLY_SNAPSHOT_ENTITIES,
  diffSnapshots,
  formatSnapshotValue,
  isAdminOnlySnapshot,
  restrictSnapshots,
} from './activity-diff';

describe('diffSnapshots', () => {
  it('returns only the keys that moved', () => {
    const changes = diffSnapshots(
      { name: 'UNA', city: 'Asunción', status: 'draft' },
      { name: 'UNA', city: 'Asunción', status: 'published' },
    );
    expect(changes).toEqual([
      { key: 'status', kind: 'changed', before: 'draft', after: 'published' },
    ]);
  });

  it('reads a create as every key added', () => {
    expect(diffSnapshots(null, { name: 'Sede Central' })).toEqual([
      { key: 'name', kind: 'added', before: undefined, after: 'Sede Central' },
    ]);
  });

  it('reads a delete as every key removed', () => {
    expect(diffSnapshots({ name: 'Sede Central' }, null)).toEqual([
      { key: 'name', kind: 'removed', before: 'Sede Central', after: undefined },
    ]);
  });

  it('distinguishes a key that went away from one that turned null', () => {
    // Both matter to a reader: "the field was dropped" and "the field was
    // cleared" are different edits, and a diff that merged them would make the
    // log lie about which one happened.
    expect(diffSnapshots({ website: 'https://una.py' }, {})).toEqual([
      { key: 'website', kind: 'removed', before: 'https://una.py', after: undefined },
    ]);
    expect(diffSnapshots({ website: 'https://una.py' }, { website: null })).toEqual([
      { key: 'website', kind: 'changed', before: 'https://una.py', after: null },
    ]);
  });

  it('does not report a nested object that only changed key order', () => {
    const changes = diffSnapshots({ utm: { a: '1', b: '2' } }, { utm: { a: '1', b: '2' } });
    expect(changes).toEqual([]);
  });

  it('reports a nested object that really changed', () => {
    const changes = diffSnapshots({ utm: { a: '1' } }, { utm: { a: '2' } });
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe('changed');
  });

  it('sorts, so the same edit always renders the same way', () => {
    const changes = diffSnapshots(null, { zeta: 1, alpha: 2, mu: 3 });
    expect(changes.map((change) => change.key)).toEqual(['alpha', 'mu', 'zeta']);
  });

  it('is empty for two nulls', () => {
    expect(diffSnapshots(null, null)).toEqual([]);
  });

  it('does not report a change against Object.prototype', () => {
    // `key in obj` walks the prototype chain, so a snapshot with a key called
    // `constructor` or `toString` would report a phantom `changed` and hand the
    // formatter a *function*. `Object.hasOwn` is what makes this an addition.
    expect(diffSnapshots(null, { constructor: 'x' })).toEqual([
      { key: 'constructor', kind: 'added', before: undefined, after: 'x' },
    ]);
    expect(diffSnapshots({}, { toString: 'y', valueOf: 'z' })).toEqual([
      { key: 'toString', kind: 'added', before: undefined, after: 'y' },
      { key: 'valueOf', kind: 'added', before: undefined, after: 'z' },
    ]);
  });

  it('treats a payload that is not an object as no detail, rather than throwing', () => {
    // `before_json` is an untyped `json` column. A string or an array in it must
    // not 500 the one screen you open when something has gone wrong.
    expect(diffSnapshots('hola' as unknown, { a: 1 })).toEqual([
      { key: 'a', kind: 'added', before: undefined, after: 1 },
    ]);
    expect(diffSnapshots([1, 2] as unknown, null)).toEqual([]);
    expect(diffSnapshots(42 as unknown, 43 as unknown)).toEqual([]);
  });

  it('does not confuse 0, false and an empty string with absence', () => {
    // `0` and `''` are falsy, and a diff written with truthiness checks would
    // report them as removals. `installmentsPerYear: 0` is a real edit.
    expect(diffSnapshots({ n: 1 }, { n: 0 })).toEqual([
      { key: 'n', kind: 'changed', before: 1, after: 0 },
    ]);
    expect(diffSnapshots({ flag: true }, { flag: false })).toEqual([
      { key: 'flag', kind: 'changed', before: true, after: false },
    ]);
    expect(diffSnapshots({ note: 'x' }, { note: '' })).toEqual([
      { key: 'note', kind: 'changed', before: 'x', after: '' },
    ]);
  });
});

describe('restrictSnapshots', () => {
  const snapshots = { before: null, after: { email: 'staff@educacion.com.py', role: 'admin' } };

  it('withholds an admin-only entity from an editor', () => {
    const result = restrictSnapshots('user', false, snapshots);
    expect(result.restricted).toBe(true);
    expect(result.after).toBeNull();
    expect(result.before).toBeNull();
  });

  it('shows the same entry to an admin', () => {
    const result = restrictSnapshots('user', true, snapshots);
    expect(result.restricted).toBe(false);
    expect(result.after).toEqual(snapshots.after);
  });

  it.each(ADMIN_ONLY_SNAPSHOT_ENTITIES)('withholds %s', (entityType) => {
    expect(restrictSnapshots(entityType, false, snapshots).restricted).toBe(true);
  });

  it('does not withhold an entity whose own screen an editor may open', () => {
    // `/admin/reclamos` is editor-gated and shows the claimant's address, so
    // hiding it here would protect nothing and only make the log less useful.
    // The rule is "does another screen already refuse this reader".
    for (const entityType of ['claim', 'price', 'institution', 'lead', 'beca', 'post']) {
      expect(restrictSnapshots(entityType, false, snapshots).restricted).toBe(false);
    }
  });

  /**
   * Every entity type this repository logs, read off the call sites rather than
   * listed here — the first version of this file asserted a constant against
   * itself, which the independent review pointed out proves nothing and would
   * not have caught `personal_data`, the entity **this same PR** introduced.
   */
  const LOGGED_ENTITIES = collectLoggedEntityTypes();

  /**
   * Logged entity types an `editor` may read the payload of, each because a
   * screen they can already open shows the same thing. Adding a `logActivity`
   * call with a new entity type fails the test below until it is classified
   * here or added to `ADMIN_ONLY_SNAPSHOT_ENTITIES` — which is the point.
   */
  const EDITOR_VISIBLE: Record<string, string> = {
    accreditation: '/admin/acreditaciones is editor-gated',
    admission: '/admin/admisiones is editor-gated',
    area: '/admin/areas is editor-gated',
    beca: '/admin/becas is editor-gated',
    campus: '/admin/sedes is editor-gated',
    career: '/admin/carreras is editor-gated',
    claim: '/admin/reclamos is editor-gated and renders the same address',
    cron_job: '/admin/importaciones is editor-gated and shows the same run',
    import_run: '/admin/importaciones is editor-gated and shows the same run',
    curation_conflict: '/admin/moderacion is editor-gated',
    institution: '/admin/instituciones is editor-gated',
    job_posting: '/admin/empleos is editor-gated',
    lead: 'the payload is {status} and nothing else (panel/leads.ts)',
    offering: '/admin/ofertas is editor-gated',
    post: '/admin/blog is editor-gated',
    price: '/admin/aranceles is editor-gated',
    program: '/admin/programas is editor-gated',
  };

  it('classifies every entity type this codebase actually logs', () => {
    expect(LOGGED_ENTITIES.length, 'the scan found no call sites at all').toBeGreaterThan(10);
    const unclassified = LOGGED_ENTITIES.filter(
      (entityType) => !isAdminOnlySnapshot(entityType) && !(entityType in EDITOR_VISIBLE),
    );
    expect(
      unclassified,
      'a new logged entity type must be judged: admin-only payload, or named here with the screen that already shows it',
    ).toEqual([]);
  });

  it('has no entity type in the withheld list that nothing writes', () => {
    // Guards the other direction: the list may not drift into decoration.
    for (const entityType of ADMIN_ONLY_SNAPSHOT_ENTITIES) {
      expect(LOGGED_ENTITIES, `${entityType} is withheld but never logged`).toContain(entityType);
    }
  });

  it('withholds the entity this PR introduced, which its own rule requires', () => {
    // `/admin/privacidad` is admin-only, so its `activity_log` payload is too.
    expect(isAdminOnlySnapshot('personal_data')).toBe(true);
  });

  it('exposes the same decision through isAdminOnlySnapshot', () => {
    expect(isAdminOnlySnapshot('user')).toBe(true);
    expect(isAdminOnlySnapshot('price')).toBe(false);
  });
});

describe('formatSnapshotValue', () => {
  it('renders an absent value as an em dash, not as the word null', () => {
    expect(formatSnapshotValue(null)).toBe('—');
    expect(formatSnapshotValue(undefined)).toBe('—');
  });

  it('renders booleans in Spanish', () => {
    expect(formatSnapshotValue(true)).toBe('sí');
    expect(formatSnapshotValue(false)).toBe('no');
  });

  it('marks a truncation so a long value cannot look complete', () => {
    const long = 'a'.repeat(400);
    const rendered = formatSnapshotValue(long, 20);
    expect(rendered).toHaveLength(21);
    expect(rendered.endsWith('…')).toBe(true);
  });

  it('leaves a string alone rather than quoting it', () => {
    expect(formatSnapshotValue('published')).toBe('published');
  });

  it('serializes a nested value rather than printing [object Object]', () => {
    expect(formatSnapshotValue({ a: 1 })).toBe('{"a":1}');
  });
});

/* -------------------------------------------------------------------------- */

/**
 * Every entity type passed to `logActivity` under `src/db/queries`.
 *
 * Both spellings are picked up: the literal most call sites use, and the
 * `entityType: SOME_CONST` form — `personal-data.ts` exports its entity type as
 * a constant, and the first version of this scanner missed it, which is exactly
 * the blind spot this test exists to close.
 */
function collectLoggedEntityTypes(): string[] {
  const found = new Set<string>();
  for (const file of walk('src/db/queries')) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
    const source = readFileSync(file, 'utf8');

    for (const match of source.matchAll(/entityType:\s*'([a-z_]+)'/g)) found.add(match[1]);

    // SCREAMING_CASE only, so a TypeScript annotation (`entityType:
    // ConflictEntity`) is not mistaken for a value.
    for (const match of source.matchAll(/entityType:\s*([A-Z][A-Z0-9_]*)(?![A-Za-z0-9_])/g)) {
      const constant = new RegExp(`\\b${match[1]}\\s*=\\s*'([a-z_]+)'`).exec(source);
      if (!constant) {
        throw new Error(`${file}: could not resolve entityType constant ${match[1]}`);
      }
      found.add(constant[1]);
    }
  }
  return [...found].sort();
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
