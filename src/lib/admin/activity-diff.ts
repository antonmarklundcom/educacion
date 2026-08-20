/**
 * Turning an `activity_log` row into something a person can read (PR-44).
 *
 * Pure, so the two decisions in it are testable without a database.
 *
 * ### 1. What changed, not what the row looked like
 *
 * `before_json` and `after_json` are whole snapshots. Rendering both side by
 * side makes the reader diff twenty fields to find the one that moved, which is
 * how an audit log becomes something nobody opens. `diffSnapshots` returns only
 * the keys that differ, with the direction of the change.
 *
 * ### 2. An `editor` may not read every snapshot
 *
 * The viewer is `editor`-gated, per PR-44's brief. But three of the entity
 * types written to this table have their *own* screens gated to `admin` —
 * `/admin/usuarios`, `/admin/suscripciones` — and their snapshots carry what
 * those screens carry: a staff member's email address, the role they were given,
 * what an institution is paying. Rendering those to an editor would make the
 * activity log a way around a role boundary the rest of the admin enforces, and
 * "hidden buttons are UX" (CLAUDE.md rule 4) cuts both ways: a read that is
 * refused on one screen cannot be granted on another.
 *
 * So the *rows* stay visible to an editor — that an account was created, by
 * whom, when, is exactly the kind of thing an audit log exists to show — and
 * only the payload is withheld. `restrictSnapshots` is the single place that
 * decides — it is called from `db/queries/admin/activity.ts`, not from the
 * page, so the rule survives somebody editing the JSX (CLAUDE.md rule 4).
 * `activity-diff.test.ts` checks the list against every `logActivity` call site
 * in the repository.
 */

/** What one `before_json` / `after_json` column holds. */
export type ActivitySnapshot = Record<string, unknown> | null;

export type FieldChangeKind = 'added' | 'removed' | 'changed';

export interface FieldChange {
  key: string;
  kind: FieldChangeKind;
  before: unknown;
  after: unknown;
}

/**
 * Entity types whose snapshots an `editor` may not read, because the screen
 * that owns them is `admin`-only.
 *
 * | Entity | Its screen | What the snapshot carries |
 * | --- | --- | --- |
 * | `user` | `/admin/usuarios` | address, role, institution |
 * | `institution_member` | `/admin/usuarios` | address, role, institution |
 * | `subscription` | `/admin/suscripciones` | what an institution pays |
 * | `personal_data` | `/admin/privacidad` | R-06 deletion counts and digests |
 *
 * `claim` is deliberately **not** here even though its snapshot carries an
 * email: `/admin/reclamos` is already `editor`-gated and shows the same
 * address, so withholding it here would protect nothing and only make the log
 * less useful. `lead` is not here either — `panel/leads.ts` logs `{status}` and
 * nothing else. The rule is "does another screen already refuse this reader",
 * not "does it look sensitive", and `activity-diff.test.ts` checks the list
 * against every `logActivity` call site in the repo rather than against itself.
 */
export const ADMIN_ONLY_SNAPSHOT_ENTITIES = [
  'user',
  'institution_member',
  'subscription',
  'personal_data',
] as const;

export type AdminOnlySnapshotEntity = (typeof ADMIN_ONLY_SNAPSHOT_ENTITIES)[number];

export function isAdminOnlySnapshot(entityType: string): boolean {
  return (ADMIN_ONLY_SNAPSHOT_ENTITIES as readonly string[]).includes(entityType);
}

export interface RestrictedSnapshots {
  before: ActivitySnapshot;
  after: ActivitySnapshot;
  /** True when the payload was withheld from this reader, not simply absent. */
  restricted: boolean;
}

export function restrictSnapshots(
  entityType: string,
  viewerIsAdmin: boolean,
  snapshots: { before: ActivitySnapshot; after: ActivitySnapshot },
): RestrictedSnapshots {
  if (viewerIsAdmin || !isAdminOnlySnapshot(entityType)) {
    return { ...snapshots, restricted: false };
  }
  return { before: null, after: null, restricted: true };
}

/**
 * The keys that differ between two snapshots, sorted so the same change always
 * renders in the same order.
 *
 * A create has `before === null` and every key reads as `added`; a delete is the
 * mirror. Values are compared by their JSON form, which is what the column
 * holds — two objects that stringify identically did not change.
 */
export function diffSnapshots(
  rawBefore: ActivitySnapshot | unknown,
  rawAfter: ActivitySnapshot | unknown,
): FieldChange[] {
  // `before_json` is an untyped `json` column: nothing stops a future writer
  // from putting an array or a bare string in it, and `'x' in "hola"` throws.
  // A payload this function cannot read is "no detail", never a 500 on the one
  // screen you open when something has gone wrong.
  const before = asSnapshot(rawBefore);
  const after = asSnapshot(rawAfter);

  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes: FieldChange[] = [];

  for (const key of [...keys].sort()) {
    // `Object.hasOwn`, not `in`: `in` walks the prototype, so a snapshot with a
    // key called `constructor` or `toString` would report a change against
    // `Object.prototype` and hand the formatter a function.
    const hadBefore = before != null && Object.hasOwn(before, key);
    const hasAfter = after != null && Object.hasOwn(after, key);
    const beforeValue = hadBefore ? before[key] : undefined;
    const afterValue = hasAfter ? after[key] : undefined;

    if (hadBefore && hasAfter) {
      if (sameValue(beforeValue, afterValue)) continue;
      changes.push({ key, kind: 'changed', before: beforeValue, after: afterValue });
    } else if (hasAfter) {
      changes.push({ key, kind: 'added', before: undefined, after: afterValue });
    } else {
      changes.push({ key, kind: 'removed', before: beforeValue, after: undefined });
    }
  }

  return changes;
}

/** A plain JSON object, or `null`. Arrays and scalars are not snapshots. */
function asSnapshot(value: unknown): ActivitySnapshot {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * One snapshot value as a string.
 *
 * `null` renders as an em dash rather than the word "null" — the log is read by
 * an operator, not by a programmer, and "—" is what the rest of the admin uses
 * for an absent value. A truncation is marked with an ellipsis so a long
 * description cannot silently look complete.
 */
export function formatSnapshotValue(value: unknown, maxLength = 160): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  // `JSON.stringify` answers `undefined` for a function or a symbol, and
  // `.length` on that throws. Nothing writes one today; the column's type does
  // not promise it never will.
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '—');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}
