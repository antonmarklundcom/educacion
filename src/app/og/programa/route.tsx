/**
 * The per-programme OG image for `/universidades/[instSlug]/[programSlug]`.
 *
 * Reachable at `/og/programa?instSlug=…&programSlug=…`, outside `/api`
 * (robots.ts). Draws exactly what the task scopes: programme name,
 * institution, duración and the arancel exactly as `priceImageLines()` returns
 * it — including the "dato desactualizado" note, matching `/og/comparar`
 * rather than reimplementing the 12-month rule (CLAUDE.md rule 3).
 *
 * The price is whatever `priceImageLines()` returns, drawn in order. This file
 * used to compose its own note — "Dato de mayo de 2026", provenance rather than
 * the warning rule 3 asks for — and because nothing here is reachable by a
 * render test (an `ImageResponse` is not HTML), it kept saying it for months
 * after every other surface was fixed. An OG image is the surface with the
 * *least* context around it: it is read in a WhatsApp preview with no page
 * attached, so it is the last place that can afford a bare number (PR-48b).
 */

import { ImageResponse } from 'next/og';

import { priceImageLines } from '@/components/browse/price';
import { formatDurationMonths } from '@/lib/format';
import { findProgramOfferings } from '@/lib/programs/lookup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WIDTH = 1200;
const HEIGHT = 630;

const INK = '#0f172a';
const BODY = '#334155';
const MUTED = '#64748b';
/** design-system.md §2 `--color-warn`, for the staleness note (PR-33). */
const WARN = '#b45309';
const ACCENT = '#0d6e86';

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const instSlug = params.get('instSlug');
  const programSlug = params.get('programSlug');

  const offerings =
    instSlug && programSlug ? await findProgramOfferings(instSlug, programSlug) : [];
  const primary = offerings[0];

  if (!primary) {
    return new Response('Not found', { status: 404 });
  }

  const priceLines = priceImageLines(primary.price);

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
        {truncate(primary.programName, 70)}
      </div>
      <div style={{ display: 'flex', fontSize: 26, color: BODY, marginTop: 12 }}>
        {truncate(primary.institutionName, 60)}
      </div>
      <div style={{ display: 'flex', fontSize: 24, color: MUTED, marginTop: 24 }}>
        {primary.durationMonths != null
          ? formatDurationMonths(primary.durationMonths)
          : 'Duración sin datos'}
      </div>
      {priceLines.map((line) =>
        line.kind === 'amount' ? (
          <div
            key={line.kind}
            style={{ display: 'flex', fontSize: 30, color: INK, fontWeight: 600, marginTop: 8 }}
          >
            {line.text}
          </div>
        ) : (
          <div key={line.kind} style={{ display: 'flex', fontSize: 19, color: WARN, marginTop: 6 }}>
            {line.text}
          </div>
        ),
      )}
    </div>,
    { width: WIDTH, height: HEIGHT },
  );
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
