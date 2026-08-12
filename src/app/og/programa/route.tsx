/**
 * The per-program OG image for `/universidades/[inst]/[program]`.
 *
 * A route handler rather than `opengraph-image.tsx`, matching `/og/comparar`:
 * reachable at `/og/programa?inst=…&program=…` and deliberately not under
 * `/api`, which `robots.ts` disallows.
 *
 * Draws exactly what the program page's hero shows: programme name,
 * institution, duración and the arancel *as `priceDisplay()` returns it* —
 * the honest gap or the staleness note, never a raw number (CLAUDE.md rule 3,
 * seo.md §5).
 */

import { ImageResponse } from 'next/og';

import { priceDisplay } from '@/components/browse/price';
import { formatDurationMonths } from '@/lib/format';
import { findProgramOfferings } from '@/lib/programs/lookup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WIDTH = 1200;
const HEIGHT = 630;

const INK = '#0f172a';
const BODY = '#334155';
const MUTED = '#64748b';
const WARN = '#b45309';
const ACCENT = '#0d6e86';

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const instSlug = params.get('inst');
  const programSlug = params.get('program');

  const offerings =
    instSlug && programSlug ? await findProgramOfferings(instSlug, programSlug) : [];
  const primary = offerings[0];

  if (!primary) return new Response('Not found', { status: 404 });

  const price = priceDisplay(primary.price);

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#ffffff',
        padding: 56,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 10, height: 34, backgroundColor: ACCENT }} />
        <div style={{ fontSize: 28, color: INK, fontWeight: 700 }}>educacion.com.py</div>
      </div>

      <div style={{ display: 'flex', fontSize: 44, color: INK, fontWeight: 700, marginTop: 30, lineHeight: 1.15 }}>
        {truncate(primary.programName, 70)}
      </div>
      <div style={{ display: 'flex', fontSize: 26, color: BODY, marginTop: 14 }}>
        {truncate(primary.institutionName, 60)}
      </div>
      <div style={{ display: 'flex', fontSize: 23, color: MUTED, marginTop: 20 }}>
        {primary.durationMonths != null
          ? formatDurationMonths(primary.durationMonths)
          : 'Duración sin datos'}
      </div>

      <div style={{ display: 'flex', flex: 1 }} />

      <div style={{ display: 'flex', fontSize: 30, color: INK, fontWeight: 700 }}>
        {`${price.label}${price.unit ?? ''}`}
      </div>
      {price.isStale && (
        <div style={{ display: 'flex', fontSize: 18, color: WARN, marginTop: 6 }}>
          {price.verifiedLabel ? `Dato de ${price.verifiedLabel}` : 'Sin fecha de verificación'}
        </div>
      )}
    </div>,
    { width: WIDTH, height: HEIGHT },
  );
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
