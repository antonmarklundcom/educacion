/**
 * File uploads — the R-08 decision (`docs/risks.md` §R-08).
 *
 * Hostinger's git deploy replaces the app directory on every deploy, so
 * anything written to disk inside it — `public/` included — disappears
 * silently. This app never writes an upload to disk. Institution logos go to
 * an S3-compatible object store (Cloudflare R2, or any S3-compatible bucket)
 * over a hand-written SigV4 `PUT` (`./s3.ts`), which survives every redeploy
 * because the bytes never live in the deploy directory in the first place.
 *
 * **Fails closed.** `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
 * `S3_SECRET_ACCESS_KEY` and `S3_PUBLIC_BASE_URL` are read fresh on every
 * call and their absence throws `UploadConfigError` before anything is sent
 * over the network. An upload that silently no-ops — leaving `logo_url` null
 * with no explanation — is worse than one that refuses outright.
 */

import { putObject, type S3Config } from './s3';

export class UploadConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadConfigError';
  }
}

function loadConfig(): S3Config {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    throw new UploadConfigError(
      'File storage is not configured. S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, ' +
        'S3_SECRET_ACCESS_KEY and S3_PUBLIC_BASE_URL must all be set — see .env.example. ' +
        'Refusing to upload rather than silently discarding the file.',
    );
  }
  return { endpoint, bucket, accessKeyId, secretAccessKey };
}

/** Minimal shape a Next.js server action's `File` (a Web `File`) satisfies. */
export interface UploadableFile {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

const ALLOWED_LOGO_TYPES: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** design-system.md §9: institution logos are small — this is generous, not a target. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Uploads an institution logo and returns its public URL.
 *
 * Validated before any network call: an unsupported type or an oversized file
 * throws without needing `S3_*` configured, so a form filled out on a
 * dev machine with no bucket still reports the real problem.
 */
export async function uploadInstitutionLogo(
  file: UploadableFile,
  institutionSlug: string,
): Promise<string> {
  const extension = ALLOWED_LOGO_TYPES[file.type];
  if (!extension) {
    throw new Error(
      `Formato de imagen no admitido (${file.type || 'desconocido'}). Usá PNG, JPG o WEBP.`,
    );
  }
  if (file.size === 0) {
    throw new Error('El archivo está vacío.');
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error('El logo no puede superar 2 MB.');
  }

  const config = loadConfig();
  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `institutions/${institutionSlug}-${Date.now()}.${extension}`;
  await putObject(config, key, buffer, file.type);

  const base = process.env.S3_PUBLIC_BASE_URL!.replace(/\/+$/, '');
  return `${base}/${key}`;
}
