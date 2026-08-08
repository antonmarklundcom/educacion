/**
 * Where uploaded bytes go — the `risks.md` §R-08 decision, made here.
 *
 * ### The problem
 *
 * Hostinger's git deploy **replaces the application directory**. Anything
 * written under it is destroyed on the next `git push` to `main`, silently, and
 * the only symptom is broken images somebody notices weeks later. `public/`
 * therefore cannot hold uploads, and neither can any path derived from
 * `process.cwd()`.
 *
 * ### The decision
 *
 * **Cloudflare R2, addressed through its S3-compatible API and signed here with
 * `node:crypto`.** Two things made it the choice over the "persistent path
 * outside the deploy dir" alternative:
 *
 * - The bytes leave the app server entirely, so a redeploy, a slot migration
 *   and a container recycle are all non-events. The alternative survives a
 *   deploy but not a move, and couples the app to one box's home directory.
 * - R2 has no egress fee and is CDN-fronted, which is the whole reason
 *   `architecture.md` §9 can budget 20 kB per logo without putting image
 *   traffic on a shared-hosting Node process.
 *
 * It is **not** the AWS SDK. `@aws-sdk/client-s3` is ~3 MB of dependency to
 * produce one signed `PUT`; SigV4 is a documented hash chain and `node:crypto`
 * already ships it. `architecture.md` §1's "deliberately excluded" list exists
 * to stop exactly this kind of unexamined addition, and the same reasoning
 * already kept the Resend SDK out (`src/lib/leads/notify.ts`).
 *
 * ### The fallback, and why it is not `public/`
 *
 * With no R2 credentials configured — local development, and any deploy where
 * the bucket has not been provisioned yet — bytes go to `UPLOADS_DIR`,
 * defaulting to `<homedir>/educacion-uploads`, and are served back through
 * `/api/uploads/[...path]`. That is the documented "persistent path outside the
 * deploy directory" alternative, kept as the dev path rather than the
 * production one. **Both** adapters resolve to a root outside `process.cwd()`,
 * which is the property `storage.test.ts` asserts and the reason a redeploy
 * cannot take a logo with it.
 *
 * Configuration lives in `docs/deployment.md` §4.
 */

import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

export interface StoredObject {
  /** The key the object was written under. Stable and content-addressed. */
  key: string;
  /** The URL to render. Absolute for R2, app-relative for the local adapter. */
  url: string;
}

export interface UploadStorage {
  readonly kind: 'r2' | 'local';
  /** Absolute path or bucket URL the objects live under. Never inside the deploy dir. */
  readonly root: string;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject>;
  /** Only the local adapter serves reads; R2 objects are fetched from the CDN. */
  get?(key: string): Promise<{ bytes: Buffer; contentType: string } | null>;
}

/* -------------------------------------------------------------------------- */
/* Local persistent directory (development, and any deploy without R2)        */
/* -------------------------------------------------------------------------- */

export function localUploadsRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.UPLOADS_DIR?.trim();
  const root = configured ? path.resolve(configured) : path.join(homedir(), 'educacion-uploads');
  assertOutsideDeployDir(root);
  return root;
}

/**
 * The one rule the fallback must never break.
 *
 * A path under the app directory looks like it works — the image renders, the
 * dev server serves it — and then disappears on the next deploy. Failing at
 * configuration time is the only moment anyone is watching.
 */
export function assertOutsideDeployDir(root: string, cwd: string = process.cwd()): void {
  const relative = path.relative(cwd, root);
  const inside = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  if (inside || root === cwd) {
    throw new Error(
      `UPLOADS_DIR (${root}) is inside the application directory. Hostinger's git deploy ` +
        'replaces that directory, so uploads written there are destroyed on the next deploy ' +
        '(risks.md §R-08). Point it at a path outside the app, or configure R2.',
    );
  }
}

/** Rejects `..`, absolute paths and backslashes before a key touches the disk. */
export function isSafeKey(key: string): boolean {
  if (!key || key.length > 512) return false;
  if (key.startsWith('/') || key.includes('\\') || key.includes('\0')) return false;
  return key.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export function createLocalStorage(env: NodeJS.ProcessEnv = process.env): UploadStorage {
  const root = localUploadsRoot(env);
  return {
    kind: 'local',
    root,
    async put(key, bytes) {
      if (!isSafeKey(key)) throw new Error(`Unsafe object key: ${key}`);
      const target = path.join(root, key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
      return { key, url: `/api/uploads/${key}` };
    },
    async get(key) {
      if (!isSafeKey(key)) return null;
      try {
        const bytes = await readFile(path.join(root, key));
        const extension = path.extname(key).slice(1).toLowerCase();
        return {
          bytes,
          contentType: CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream',
        };
      } catch {
        return null;
      }
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Cloudflare R2 (S3-compatible, SigV4 signed with node:crypto)               */
/* -------------------------------------------------------------------------- */

/**
 * Configuration is spelled `S3_*` rather than `R2_*`.
 *
 * R2 is the choice; the *protocol* is S3, and `.env.example` has carried these
 * five names since PR-01. Keeping them means Bunny Storage or any other
 * S3-compatible endpoint is a change of one value rather than a change of code,
 * which is the whole reason `risks.md` §R-08 lists two candidates.
 */
export interface R2Config {
  /** e.g. `https://<account>.r2.cloudflarestorage.com` — no bucket, no path. */
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Where the public reads the objects from — a custom domain or the r2.dev URL. */
  publicBaseUrl: string;
}

export function readR2Config(env: NodeJS.ProcessEnv = process.env): R2Config | null {
  const endpoint = env.S3_ENDPOINT?.trim();
  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim();
  const bucket = env.S3_BUCKET?.trim();
  const publicBaseUrl = env.S3_PUBLIC_BASE_URL?.trim();
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) return null;
  return {
    endpoint: endpoint.replace(/\/+$/, ''),
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ''),
  };
}

const SIGV4_REGION = 'auto';
const SIGV4_SERVICE = 's3';

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** URI-encode a path segment the way SigV4 canonicalization requires. */
function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * Sign a single-shot `PUT` for the S3-compatible endpoint.
 *
 * Exported so it can be unit-tested against AWS's published test vectors'
 * *shape* without a network call: given a fixed `now`, the signature is a pure
 * function of the inputs.
 */
export function signPutObject(
  config: R2Config,
  key: string,
  bytes: Uint8Array,
  contentType: string,
  now: Date = new Date(),
): SignedRequest {
  const host = new URL(config.endpoint).host;
  const canonicalUri = `/${config.bucket}/${key.split('/').map(encodeSegment).join('/')}`;
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(bytes);

  const headers: Record<string, string> = {
    host,
    'content-type': contentType,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const signedHeaders = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaders.map((name) => `${name}:${headers[name]}\n`).join('');
  const signedHeaderList = signedHeaders.join(';');

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaderList,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${SIGV4_REGION}/${SIGV4_SERVICE}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), SIGV4_REGION), SIGV4_SERVICE),
    'aws4_request',
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  return {
    url: `https://${host}${canonicalUri}`,
    headers: {
      ...headers,
      authorization:
        `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaderList}, Signature=${signature}`,
      'cache-control': 'public, max-age=31536000, immutable',
    },
  };
}

export function createR2Storage(config: R2Config): UploadStorage {
  return {
    kind: 'r2',
    root: config.publicBaseUrl,
    async put(key, bytes, contentType) {
      if (!isSafeKey(key)) throw new Error(`Unsafe object key: ${key}`);
      const signed = signPutObject(config, key, bytes, contentType);
      const response = await fetch(signed.url, {
        method: 'PUT',
        headers: signed.headers,
        body: Buffer.from(bytes),
      });
      if (!response.ok) {
        throw new Error(
          `Object storage rejected the upload (${response.status}). Check S3_* in docs/deployment.md §4.`,
        );
      }
      return { key, url: `${config.publicBaseUrl}/${key}` };
    },
  };
}

/* -------------------------------------------------------------------------- */

/**
 * The adapter this process uses. R2 when it is configured, the persistent
 * directory otherwise — never anything under the deploy directory.
 */
export function uploadStorage(env: NodeJS.ProcessEnv = process.env): UploadStorage {
  const r2 = readR2Config(env);
  return r2 ? createR2Storage(r2) : createLocalStorage(env);
}
