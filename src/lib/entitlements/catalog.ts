/**
 * The price list we sell, as data (`docs/monetization.md` §3).
 *
 * It lives in `src/lib` rather than in the seed script so that the properties
 * the pricing model depends on — the bands tile 0..∞ without a gap, every
 * Verificado band carries the same rank — are unit-testable without a
 * database (`catalog.test.ts`). `scripts/seed-plans.ts` writes exactly these
 * rows into `plans`; nothing at request time reads this file, because prices
 * shown to a customer must come from the row an operator can correct.
 */

export interface PlanSeed {
  code: string;
  name: string;
  priceUsdYear: number;
  programBandMin: number;
  programBandMax: number | null;
  rank: 0 | 1 | 2;
  featuresJson: Record<string, boolean | number | string> | null;
}

export const PLAN_SEED: PlanSeed[] = [
  {
    code: 'gratis',
    name: 'Gratis',
    priceUsdYear: 0,
    programBandMin: 0,
    programBandMax: null,
    rank: 0,
    featuresJson: null,
  },
  {
    code: 'verificado_25',
    name: 'Verificado — hasta 25 programas',
    priceUsdYear: 490,
    programBandMin: 0,
    programBandMax: 25,
    rank: 1,
    featuresJson: null,
  },
  {
    code: 'verificado_75',
    name: 'Verificado — 26 a 75 programas',
    priceUsdYear: 890,
    programBandMin: 26,
    programBandMax: 75,
    rank: 1,
    featuresJson: null,
  },
  {
    code: 'verificado_76_mas',
    name: 'Verificado — 76 programas o más',
    priceUsdYear: 1490,
    programBandMin: 76,
    programBandMax: null,
    rank: 1,
    featuresJson: null,
  },
  {
    /**
     * An add-on, held alongside a Verificado subscription. Its price is
     * negotiated per placement (USD 1.200–3.000 in §3), so the stored number
     * is the floor and `price_from` tells the sales page to render "desde"
     * rather than a price we would otherwise be stating as fixed.
     */
    code: 'destacado',
    name: 'Destacado (complemento)',
    priceUsdYear: 1200,
    programBandMin: 0,
    programBandMax: null,
    rank: 2,
    featuresJson: { price_from: true },
  },
];
