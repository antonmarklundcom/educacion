/**
 * The per-beca OG image for `/becas/[slug]`.
 *
 * A route handler rather than `opengraph-image.tsx`, matching `/og/comparar`:
 * reachable at `/og/beca?slug=…` and deliberately not under `/api`, which
 * `robots.ts` disallows.
 *
 * Draws exactly what the beca page shows above the fold — title, provider,
 * type, coverage and deadline. No invented amounts: `coverageLabel` already
 * says "no sabemos cuánto cubre" when the field is empty.
 */

import { ImageResponse } from 'next/og';

import { getBecaBySlug } from '@/db/queries/becas';
import { BECA_TYPE_LABELS } from '@/lib/becas/labels';
import { coverageLabel, deadlineLabel } from '@/lib/becas/display';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WIDTH = 1200;
const HEIGHT = 630;

const INK = '#0f172a';
const BODY = '#334155';
const MUTED = '#64748b';
const ACCENT = '#0d6e86';

export async function GET(request: Request): Promise<Response> {
  const slug = new URL(request.url).searchParams.get('slug');
  const beca = slug ? await getBecaBySlug(slug) : null;

  if (!beca) return new Response('Not found', { status: 404 });

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

      <div style={{ display: 'flex', fontSize: 20, color: MUTED, marginTop: 30 }}>
        {BECA_TYPE_LABELS[beca.type]}
      </div>
      <div style={{ display: 'flex', fontSize: 44, color: INK, fontWeight: 700, marginTop: 10, lineHeight: 1.15 }}>
        {truncate(beca.title, 80)}
      </div>
      {beca.providerLabel && (
        <div style={{ display: 'flex', fontSize: 24, color: BODY, marginTop: 18 }}>
          {truncate(beca.providerLabel, 60)}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1 }} />

      <div style={{ display: 'flex', fontSize: 23, color: INK }}>{coverageLabel(beca)}</div>
      <div style={{ display: 'flex', fontSize: 21, color: MUTED, marginTop: 8 }}>
        {deadlineLabel(beca.deadline)}
      </div>
    </div>,
    { width: WIDTH, height: HEIGHT },
  );
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
