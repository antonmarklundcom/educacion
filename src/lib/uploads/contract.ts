/**
 * What may be uploaded, and under what name. Pure — no filesystem, no network.
 *
 * Everything in this file is a rule rather than a mechanism, which is why it is
 * separate from `storage.ts`: the adapters differ per environment, the rules
 * must not.
 */

import { createHash } from 'node:crypto';

/**
 * Raster formats only.
 *
 * SVG is deliberately absent. An SVG is a document that can carry script, and
 * these bytes are served back from a host we control; accepting one would mean
 * an institution's own upload could run JavaScript on our origin. Nothing about
 * a logo needs it.
 */
export const ALLOWED_IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const;

export type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;

/**
 * 256 kB.
 *
 * `architecture.md` §9 budgets **20 kB** for a rendered logo. This is the bound
 * on what we accept from a human with a PNG export, not the bound on what we
 * serve; it is deliberately roomy enough that a normal logo never bounces and
 * tight enough that nobody uploads a photograph by accident.
 */
export const MAX_UPLOAD_BYTES = 256 * 1024;

export interface UploadCandidate {
  type: string;
  size: number;
  name?: string;
}

export type UploadRejection =
  | { ok: false; reason: 'empty' | 'type' | 'size'; message: string }
  | { ok: true; extension: string };

export function validateImageUpload(file: UploadCandidate): UploadRejection {
  if (!file.size) {
    return { ok: false, reason: 'empty', message: 'No seleccionaste ningún archivo.' };
  }
  const extension = ALLOWED_IMAGE_TYPES[file.type as AllowedImageType];
  if (!extension) {
    return {
      ok: false,
      reason: 'type',
      message: 'Solo aceptamos PNG, JPG o WebP. Un SVG puede contener código, así que no.',
    };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: 'size',
      message: `El archivo pesa ${Math.round(file.size / 1024)} kB. El máximo es ${MAX_UPLOAD_BYTES / 1024} kB.`,
    };
  }
  return { ok: true, extension };
}

/**
 * Content-addressed object key: `logos/<slug>-<16 hex of sha256>.<ext>`.
 *
 * Addressing by content means re-uploading the same file is a no-op and a
 * *different* file always lands on a different URL — so the CDN and every
 * browser that already cached the old logo can be told to keep it forever
 * without anyone having to think about invalidation. The slug is in there for
 * humans reading a bucket listing; nothing reads it back.
 */
export function objectKey(prefix: string, slug: string, bytes: Uint8Array, extension: string) {
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const safeSlug = slug.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'institucion';
  return `${prefix}/${safeSlug}-${digest}.${extension}`;
}
