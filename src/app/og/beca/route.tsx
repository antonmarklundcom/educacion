/**
 * The per-beca OG image for `/becas/[slug]`.
 *
 * Reachable at `/og/beca?slug=…`, outside `/api` (robots.ts). Draws exactly
 * what the beca page's header shows: title, provider, coverage and deadline —
 * the same `coverageLabel`/`deadlineLabel` wording the page uses, so a shared
 * card never asserts a fact the page itself doesn't (CLAUDE.md rule 1).
 */

import { ImageResponse } from 'next/og';

import { getBecaBySlug } from '@/db/queries/becas';
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

  if (!beca) {
    return new Response('Not found', { status: 404 });
  }

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

      <div style={{ display: 'flex', flex: 1 }} />

      <div style={{ display: 'flex', fontSize: 46, color: INK, fontWeight: 700, lineHeight: 1.2 }}>
        {truncate(beca.title, 80)}
      </div>
      {beca.providerLabel && (
        <div style={{ display: 'flex', fontSize: 24, color: BODY, marginTop: 16 }}>
          {truncate(beca.providerLabel, 60)}
        </div>
      )}
      <div style={{ display: 'flex', fontSize: 22, color: MUTED, marginTop: 20 }}>
        {`${coverageLabel(beca)} · ${beca.isClosed ? 'Cerrada' : deadlineLabel(beca.deadline)}`}
      </div>
    </div>,
    { width: WIDTH, height: HEIGHT },
  );
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
