import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MAX_LOGO_BYTES, UploadConfigError, uploadInstitutionLogo } from './storage';

const ENV_KEYS = [
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_PUBLIC_BASE_URL',
] as const;

function fakeFile(overrides: Partial<{ name: string; type: string; size: number }> = {}) {
  const size = overrides.size ?? 10;
  return {
    name: overrides.name ?? 'logo.png',
    type: overrides.type ?? 'image/png',
    size,
    arrayBuffer: async () => new ArrayBuffer(size),
  };
}

describe('uploadInstitutionLogo', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('rejects an unsupported file type before touching configuration', async () => {
    await expect(uploadInstitutionLogo(fakeFile({ type: 'image/gif' }), 'uc')).rejects.toThrow(
      /formato/i,
    );
  });

  it('rejects an empty file', async () => {
    await expect(uploadInstitutionLogo(fakeFile({ size: 0 }), 'uc')).rejects.toThrow(/vacío/);
  });

  it('rejects a file over the size ceiling', async () => {
    await expect(
      uploadInstitutionLogo(fakeFile({ size: MAX_LOGO_BYTES + 1 }), 'uc'),
    ).rejects.toThrow(/2 MB/);
  });

  // The R-08 requirement: no S3 config means the upload refuses rather than
  // silently discarding the file.
  it('fails closed when object storage is not configured', async () => {
    await expect(uploadInstitutionLogo(fakeFile(), 'uc')).rejects.toThrow(UploadConfigError);
  });

  it('fails closed when only some S3 variables are set', async () => {
    process.env.S3_ENDPOINT = 'https://example.r2.cloudflarestorage.com';
    process.env.S3_BUCKET = 'logos';
    await expect(uploadInstitutionLogo(fakeFile(), 'uc')).rejects.toThrow(UploadConfigError);
  });
});
