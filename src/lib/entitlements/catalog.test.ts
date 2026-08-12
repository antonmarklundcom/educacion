import { describe, expect, it } from 'vitest';

import { bandForProgramCount, bandLabel, bandsOfRank, priceIsFrom, type PlanBand } from './bands';
import { PLAN_SEED } from './catalog';

/** The seed as the shape the query layer hands to the pricing helpers. */
const BANDS: PlanBand[] = PLAN_SEED.map((plan, index) => ({
  id: index + 1,
  code: plan.code,
  name: plan.name,
  priceUsdYear: plan.priceUsdYear,
  programBandMin: plan.programBandMin,
  programBandMax: plan.programBandMax,
  rank: plan.rank,
  includedLeadsMonth: null,
  featuresJson: plan.featuresJson,
}));

describe('the seeded price list', () => {
  it('matches monetization.md §3 — 490 / 890 / 1.490, Destacado desde 1.200', () => {
    const byCode = new Map(PLAN_SEED.map((plan) => [plan.code, plan]));
    expect(byCode.get('gratis')?.priceUsdYear).toBe(0);
    expect(byCode.get('verificado_25')?.priceUsdYear).toBe(490);
    expect(byCode.get('verificado_75')?.priceUsdYear).toBe(890);
    expect(byCode.get('verificado_76_mas')?.priceUsdYear).toBe(1490);
    expect(byCode.get('destacado')?.priceUsdYear).toBe(1200);
  });

  it('has unique codes — the natural key the seed is idempotent on', () => {
    expect(new Set(PLAN_SEED.map((plan) => plan.code)).size).toBe(PLAN_SEED.length);
  });

  it('quotes no lead quota anywhere: nobody has agreed to one yet', () => {
    expect(PLAN_SEED.every((plan) => !('included_leads_month' in (plan.featuresJson ?? {})))).toBe(
      true,
    );
  });

  it('marks only Destacado as a "desde" price', () => {
    const fromPrices = BANDS.filter(priceIsFrom).map((plan) => plan.code);
    expect(fromPrices).toEqual(['destacado']);
  });
});

describe('bandForProgramCount', () => {
  it('tiles every programme count from 0 to 500 with exactly one Verificado band', () => {
    for (let count = 0; count <= 500; count += 1) {
      const band = bandForProgramCount(BANDS, count, 1);
      expect(band, `no Verificado band covers ${count} programmes`).not.toBeNull();
    }
  });

  it('puts the documented counts in the documented bands', () => {
    expect(bandForProgramCount(BANDS, 1, 1)?.priceUsdYear).toBe(490);
    expect(bandForProgramCount(BANDS, 25, 1)?.priceUsdYear).toBe(490);
    expect(bandForProgramCount(BANDS, 26, 1)?.priceUsdYear).toBe(890);
    expect(bandForProgramCount(BANDS, 75, 1)?.priceUsdYear).toBe(890);
    expect(bandForProgramCount(BANDS, 76, 1)?.priceUsdYear).toBe(1490);
    expect(bandForProgramCount(BANDS, 400, 1)?.priceUsdYear).toBe(1490);
  });

  it('never returns a plan of another rank', () => {
    expect(bandForProgramCount(BANDS, 10, 1)?.rank).toBe(1);
    expect(bandForProgramCount(BANDS, 10, 2)?.code).toBe('destacado');
  });

  it('returns null rather than guessing when a gap is seeded', () => {
    const gapped = BANDS.filter((plan) => plan.code !== 'verificado_75');
    expect(bandForProgramCount(gapped, 40, 1)).toBeNull();
  });

  it('charges the cheaper band when two overlap', () => {
    const overlapping: PlanBand[] = [
      ...BANDS,
      { ...BANDS[1]!, id: 99, code: 'oops', priceUsdYear: 2000, programBandMax: 40 },
    ];
    expect(bandForProgramCount(overlapping, 20, 1)?.priceUsdYear).toBe(490);
  });
});

describe('presentation helpers', () => {
  it('labels the bands the way the sales page reads them', () => {
    const verificado = bandsOfRank(BANDS, 1);
    expect(verificado.map(bandLabel)).toEqual([
      'Hasta 25 programas',
      '26–75 programas',
      '76 programas o más',
    ]);
  });
});
