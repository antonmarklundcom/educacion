/**
 * The per-comparison OG image.
 *
 * A route handler rather than an `opengraph-image.tsx`: the file convention
 * only receives route `params`, and a comparison is identified by a query
 * string. This is reachable at `/og/comparar?ids=…` and deliberately not under
 * `/api`, which `robots.ts` disallows.
 *
 * What it may draw is exactly what the page shows: program name, institution,
 * duración and the arancel *as the 12-month rule left it* — when the price is
 * not displayable the card says "Consultá el arancel" rather than a number
 * (CLAUDE.md rule 3, seo.md §5). Nothing is computed here that the page does
 * not also render.
 */

import { ImageResponse } from 'next/og';

import { priceDisplay } from '@/components/browse/price';
import { accreditationLabel } from '@/components/browse/accreditation-display';
import { COMPARE_IDS_PARAM, parseCompareIds } from '@/lib/compare/state';
import { formatDurationMonths } from '@/lib/format';
import { COMPARE_PARAM, getOfferingsByIds } from '@/lib/search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WIDTH = 1200;
const HEIGHT = 630;

const INK = '#0f172a';
const BODY = '#334155';
const MUTED = '#64748b';
const BORDER = '#e4e8ec';
/** design-system.md §2 `--color-warn`, for the staleness note (PR-33). */
const WARN = '#b45309';
const ACCENT = '#0d6e86';

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const ids = (() => {
    const primary = parseCompareIds(params.getAll(COMPARE_IDS_PARAM));
    return primary.length ? primary : parseCompareIds(params.getAll(COMPARE_PARAM));
  })();

  const offerings = ids.length ? await getOfferingsByIds(ids) : [];

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

      <div style={{ display: 'flex', fontSize: 46, color: INK, fontWeight: 700, marginTop: 26 }}>
        {offerings.length > 0
          ? `Comparación de ${offerings.length} carreras`
          : 'Compará carreras en Paraguay'}
      </div>

      {offerings.length === 0 ? (
        <div style={{ display: 'flex', fontSize: 26, color: MUTED, marginTop: 20 }}>
          Aranceles, duración, modalidad y acreditación.
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16, marginTop: 34 }}>
          {offerings.map((offering) => {
            const price = priceDisplay(offering.price);
            return (
              <div
                key={offering.offeringId}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  border: `2px solid ${BORDER}`,
                  borderRadius: 14,
                  padding: 22,
                }}
              >
                <div style={{ display: 'flex', fontSize: 26, color: INK, fontWeight: 700 }}>
                  {truncate(offering.programName, 42)}
                </div>
                <div style={{ display: 'flex', fontSize: 20, color: MUTED, marginTop: 8 }}>
                  {truncate(offering.institutionShort, 30)}
                </div>
                <div style={{ display: 'flex', fontSize: 21, color: BODY, marginTop: 20 }}>
                  {offering.durationMonths != null
                    ? formatDurationMonths(offering.durationMonths)
                    : 'Duración sin datos'}
                </div>
                <div style={{ display: 'flex', fontSize: 23, color: INK, marginTop: 8 }}>
                  {`${price.label}${price.unit ?? ''}`}
                </div>
                {/* A shared image is read without any of the page around it, so
                    the staleness note travels with the number (PR-33). */}
                {price.isStale && (
                  <div style={{ display: 'flex', fontSize: 17, color: WARN, marginTop: 4 }}>
                    {price.verifiedLabel
                      ? `Dato de ${price.verifiedLabel}`
                      : 'Sin fecha de verificación'}
                  </div>
                )}
                <div style={{ display: 'flex', fontSize: 19, color: MUTED, marginTop: 14 }}>
                  {truncate(accreditationLabel(offering.accreditation), 30)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1 }} />
      <div style={{ display: 'flex', fontSize: 19, color: MUTED }}>
        Sitio privado e independiente. No es un portal oficial del MEC, CONES ni ANEAES.
      </div>
    </div>,
    { width: WIDTH, height: HEIGHT },
  );
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
