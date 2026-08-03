/**
 * Payload canonicalization and checksums.
 *
 * `source_records` has UNIQUE (source, checksum), and that constraint is the
 * whole idempotency story for PR-05: re-running an importer over an unchanged
 * source must insert zero rows. That only holds if the same logical payload
 * always hashes to the same string, which means the hash cannot be taken over
 * `JSON.stringify(payload)` — key order there follows insertion order, so two
 * parses of the same row can differ byte-for-byte while being identical data.
 *
 * So we canonicalize first: object keys sorted, `undefined` dropped, strings
 * whitespace-collapsed and trimmed. Array order is preserved — in a source
 * document order is information (it is how a resolution lists its careers),
 * not incidental.
 */

import { createHash } from 'node:crypto';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

/**
 * Collapse runs of whitespace (including the non-breaking spaces that come out
 * of government HTML) to single spaces and trim. Two scrapes of the same cell
 * must not differ because one wrapped a line differently.
 */
export function collapseWhitespace(value: string): string {
  return value.replace(/[\s\u00a0\u200b]+/g, ' ').trim();
}

/**
 * A deterministic, order-independent view of a payload. Pure — it never
 * mutates its input, because the caller stores the *original* payload
 * verbatim and only hashes this.
 */
export function canonicalize(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') return collapseWhitespace(value);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) return value.map(canonicalize);

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      out[key] = canonicalize(source[key]);
    }
    return out;
  }

  // Functions and symbols have no place in a source payload.
  return null;
}

/** Stable serialization of a canonicalized payload. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/**
 * The checksum stored on `source_records`. SHA-256 hex, 64 chars — exactly the
 * width of `source_records.checksum`.
 */
export function checksumOf(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
