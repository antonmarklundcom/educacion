import { describe, expect, it } from 'vitest';
import path from 'node:path';

import { objectKey, validateImageUpload, MAX_UPLOAD_BYTES } from './contract';
import {
  assertOutsideDeployDir,
  isSafeKey,
  localUploadsRoot,
  readR2Config,
  signPutObject,
  uploadStorage,
} from './storage';

const R2_ENV = {
  S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
  S3_ACCESS_KEY_ID: 'AKIAEXAMPLE',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_BUCKET: 'educacion',
  S3_PUBLIC_BASE_URL: 'https://cdn.educacion.com.py/',
} as unknown as NodeJS.ProcessEnv;

describe('validateImageUpload', () => {
  it('accepts the three raster types and reports their extension', () => {
    expect(validateImageUpload({ type: 'image/png', size: 100 })).toEqual({
      ok: true,
      extension: 'png',
    });
    expect(validateImageUpload({ type: 'image/webp', size: 100 })).toEqual({
      ok: true,
      extension: 'webp',
    });
  });

  it('refuses SVG — it is a document that can carry script', () => {
    const result = validateImageUpload({ type: 'image/svg+xml', size: 100 });
    expect(result.ok).toBe(false);
  });

  it('refuses an empty file and one over the cap', () => {
    expect(validateImageUpload({ type: 'image/png', size: 0 })).toMatchObject({ reason: 'empty' });
    expect(validateImageUpload({ type: 'image/png', size: MAX_UPLOAD_BYTES + 1 })).toMatchObject({
      reason: 'size',
    });
  });
});

describe('objectKey', () => {
  it('is content-addressed: the same bytes give the same key', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(objectKey('logos', 'una', bytes, 'png')).toBe(objectKey('logos', 'una', bytes, 'png'));
  });

  it('changes when the bytes change, so a new logo never reuses a cached URL', () => {
    expect(objectKey('logos', 'una', new Uint8Array([1]), 'png')).not.toBe(
      objectKey('logos', 'una', new Uint8Array([2]), 'png'),
    );
  });

  it('strips anything that is not slug-shaped out of the path', () => {
    expect(objectKey('logos', '../../etc', new Uint8Array([1]), 'png')).not.toContain('..');
  });
});

/**
 * The acceptance criterion "uploaded logo survives a simulated redeploy",
 * stated as the property that makes it true.
 *
 * A Hostinger git deploy replaces the application directory — i.e. everything
 * under `process.cwd()`. A file survives the deploy exactly when it was never
 * written there. There is no way to assert that by writing a file and deleting
 * a directory; the honest test is that neither adapter can resolve a root
 * inside the deploy directory, and that `public/` in particular is refused.
 */
describe('R-08: uploads survive a redeploy', () => {
  it('the local adapter roots outside the application directory', () => {
    const root = localUploadsRoot({} as NodeJS.ProcessEnv);
    const relative = path.relative(process.cwd(), root);
    expect(relative.startsWith('..') || path.isAbsolute(relative)).toBe(true);
  });

  it('refuses a configured path inside the deploy directory', () => {
    expect(() => assertOutsideDeployDir(path.join(process.cwd(), 'public', 'uploads'))).toThrow(
      /replaces that directory/,
    );
    expect(() => assertOutsideDeployDir(process.cwd())).toThrow();
    expect(() =>
      localUploadsRoot({ UPLOADS_DIR: './public/uploads' } as unknown as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it('accepts a path outside it', () => {
    expect(() => assertOutsideDeployDir(path.join(process.cwd(), '..', 'uploads'))).not.toThrow();
  });

  it('prefers R2 when it is fully configured, and its root is a remote origin', () => {
    const storage = uploadStorage(R2_ENV);
    expect(storage.kind).toBe('r2');
    expect(storage.root).toBe('https://cdn.educacion.com.py');
  });

  it('falls back to the local adapter when any R2 variable is missing', () => {
    const partial = { ...R2_ENV, S3_SECRET_ACCESS_KEY: '' } as NodeJS.ProcessEnv;
    expect(readR2Config(partial)).toBeNull();
    expect(uploadStorage(partial).kind).toBe('local');
  });
});

describe('isSafeKey', () => {
  it('rejects traversal, absolute paths and empty segments', () => {
    expect(isSafeKey('logos/una-abc.png')).toBe(true);
    expect(isSafeKey('../secrets')).toBe(false);
    expect(isSafeKey('/etc/passwd')).toBe(false);
    expect(isSafeKey('logos//x.png')).toBe(false);
    expect(isSafeKey('logos\\x.png')).toBe(false);
  });
});

describe('signPutObject', () => {
  const config = readR2Config(R2_ENV)!;

  it('is deterministic for a fixed clock', () => {
    const at = new Date('2026-08-08T12:00:00.000Z');
    const bytes = new Uint8Array([1, 2, 3]);
    const a = signPutObject(config, 'logos/x.png', bytes, 'image/png', at);
    const b = signPutObject(config, 'logos/x.png', bytes, 'image/png', at);
    expect(a.headers.authorization).toBe(b.headers.authorization);
  });

  it('signs the payload, so a different body is a different signature', () => {
    const at = new Date('2026-08-08T12:00:00.000Z');
    const a = signPutObject(config, 'logos/x.png', new Uint8Array([1]), 'image/png', at);
    const b = signPutObject(config, 'logos/x.png', new Uint8Array([2]), 'image/png', at);
    expect(a.headers.authorization).not.toBe(b.headers.authorization);
    expect(a.headers['x-amz-content-sha256']).not.toBe(b.headers['x-amz-content-sha256']);
  });

  it('addresses the bucket path-style on the account endpoint', () => {
    const signed = signPutObject(config, 'logos/x.png', new Uint8Array([1]), 'image/png');
    expect(signed.url).toBe('https://acct.r2.cloudflarestorage.com/educacion/logos/x.png');
    expect(signed.headers.authorization).toContain(
      'SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date',
    );
  });
});
