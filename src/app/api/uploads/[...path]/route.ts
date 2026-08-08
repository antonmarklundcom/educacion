/**
 * Serves the local upload adapter's bytes (`src/lib/uploads/storage.ts`).
 *
 * This route exists only for the fallback path — development, and any deploy
 * where R2 is not configured yet. When R2 *is* configured, `logo_url` is an
 * absolute CDN URL and nothing here is ever hit.
 *
 * It is a read of a public asset, so there is no auth gate; the protection is
 * that `isSafeKey` refuses traversal and the adapter can only resolve paths
 * under its own root.
 */

import { NextResponse } from 'next/server';

import { createLocalStorage, readR2Config } from '@/lib/uploads/storage';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (readR2Config()) {
    // Objects live on the CDN; serving a second copy from the app server would
    // be a second URL for the same bytes.
    return new NextResponse(null, { status: 404 });
  }

  const { path: segments } = await params;
  const object = await createLocalStorage().get?.(segments.join('/'));
  if (!object) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(object.bytes), {
    headers: {
      'content-type': object.contentType,
      // Content-addressed keys (contract.ts) make this safe: different bytes
      // always mean a different URL.
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}
