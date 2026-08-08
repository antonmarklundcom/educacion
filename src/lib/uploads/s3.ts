/**
 * A minimal AWS SigV4 client for one operation: `PUT` an object to an
 * S3-compatible bucket. Written by hand rather than pulling in the AWS SDK —
 * the SDK is a large dependency for one call this app makes from one place,
 * and SigV4 for a single PUT is small enough to keep correct in the open.
 *
 * Works against Cloudflare R2 and any other S3-compatible endpoint (Bunny's
 * S3-compatible storage zones, MinIO, actual S3) because the signing scheme
 * is the same; only the endpoint and region differ.
 */

import { createHash, createHmac } from 'node:crypto';

export interface S3Config {
  /** e.g. https://<accountid>.r2.cloudflarestorage.com */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** R2 has no regions; 'auto' is what it expects. */
  region?: string;
}

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmacRaw(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function signingKey(secret: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmacRaw(`AWS4${secret}`, dateStamp);
  const kRegion = hmacRaw(kDate, region);
  const kService = hmacRaw(kRegion, service);
  return hmacRaw(kService, 'aws4_request');
}

function amzTimestamp(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function encodeKey(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/**
 * Signs and sends a `PUT` for `key`. Throws on any non-2xx response — an
 * upload that appears to succeed but silently lands nowhere is worse than one
 * that fails loudly (risks.md §R-08).
 */
export async function putObject(
  config: S3Config,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const region = config.region ?? 'auto';
  const service = 's3';
  const { amzDate, dateStamp } = amzTimestamp(new Date());
  const host = new URL(config.endpoint).host;
  const payloadHash = sha256Hex(body);
  const canonicalUri = `/${config.bucket}/${encodeKey(key)}`;

  // Header names sorted alphabetically, exactly as SigV4 requires.
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const key_ = signingKey(config.secretAccessKey, dateStamp, region, service);
  const signature = createHmac('sha256', key_).update(stringToSign, 'utf8').digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`${config.endpoint}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      'content-type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      authorization,
    },
    body: new Uint8Array(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Object storage upload failed: ${response.status} ${detail}`.trim());
  }
}
