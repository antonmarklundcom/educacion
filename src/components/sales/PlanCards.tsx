/**
 * The plan table on `/para-instituciones` (PR-26).
 *
 * **Prices come from the `plans` table, never from this file.** That is the
 * PR's acceptance criterion and it is also the only way the page can be right:
 * a price hardcoded in a component is a price that disagrees with what the
 * admin activates the day somebody edits one of them.
 *
 * **The feature ticks come from `FEATURES_BY_RANK`**, the same matrix the
 * server gates on (`lib/entitlements/contract.ts`). A sales page listing what a
 * plan includes is a promise, and the cheapest way to keep it is to render the
 * enforcement rather than a second list of it.
 *
 * Server component: three cards of static text, no state.
 */

import { Badge, Card } from '@/components/ui';
import {
  FEATURE_KEYS,
  FEATURE_LABELS,
  FEATURES_BY_RANK,
  PLAN_RANKS,
  bandLabel,
  bandsOfRank,
  priceIsFrom,
  type PlanBand,
  type PlanRank,
} from '@/lib/entitlements';

function priceLabel(plan: PlanBand): string {
  if (plan.priceUsdYear === 0) return 'Sin costo';
  const amount = `USD ${plan.priceUsdYear.toLocaleString('es-PY')}`;
  return priceIsFrom(plan) ? `desde ${amount}/año` : `${amount}/año`;
}

function FeatureList({ rank }: { rank: PlanRank }) {
  const features = FEATURES_BY_RANK[rank];
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {FEATURE_KEYS.map((key) => (
        <li
          key={key}
          className={features[key] ? 'text-body flex gap-2' : 'text-faint flex gap-2'}
          aria-label={`${FEATURE_LABELS[key]}: ${features[key] ? 'incluido' : 'no incluido'}`}
        >
          <span aria-hidden="true" className={features[key] ? 'text-ok' : 'text-faint'}>
            {features[key] ? '✓' : '—'}
          </span>
          <span>{FEATURE_LABELS[key]}</span>
        </li>
      ))}
    </ul>
  );
}

function PlanColumn({
  title,
  subtitle,
  rank,
  prices,
  children,
}: {
  title: string;
  subtitle: string;
  rank: PlanRank;
  prices: { label: string; price: string }[];
  children?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-ink text-lg font-semibold">{title}</h3>
        <p className="text-muted text-sm">{subtitle}</p>
      </div>

      <ul className="border-border flex flex-col gap-1 border-y py-3">
        {prices.map((row) => (
          <li key={row.label} className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-body text-sm">{row.label}</span>
            <span className="text-ink font-mono text-sm font-semibold">{row.price}</span>
          </li>
        ))}
      </ul>

      <FeatureList rank={rank} />
      {children}
    </Card>
  );
}

export function PlanCards({ plans }: { plans: PlanBand[] }) {
  const verificado = bandsOfRank(plans, PLAN_RANKS.verificado);
  const destacado = bandsOfRank(plans, PLAN_RANKS.destacado);

  if (verificado.length === 0 && destacado.length === 0) {
    // The table is empty only if nobody has seeded `plans`. Inventing the
    // prices here to fill the gap is exactly what this component exists not to
    // do (CLAUDE.md rule 1), so the page says so and points at the inbox.
    return (
      <p className="border-border bg-card-alt text-body rounded-md border px-4 py-6 text-sm">
        Todavía no publicamos la lista de precios acá. Escribinos y te la pasamos en el día.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <PlanColumn
        title="Gratis"
        subtitle="Lo que ya tenés, sin hacer nada y sin vencimiento."
        rank={PLAN_RANKS.gratis}
        prices={[{ label: 'Siempre', price: 'Gs. 0' }]}
      >
        <p className="text-muted text-sm">
          Tu institución, tus carreras y tus sedes ya están publicadas, salidas del registro
          público. Cargar y corregir tus datos también es gratis.
        </p>
      </PlanColumn>

      <PlanColumn
        title="Verificado"
        subtitle="El precio depende de cuántos programas publicás."
        rank={PLAN_RANKS.verificado}
        prices={verificado.map((plan) => ({
          label: bandLabel(plan),
          price: priceLabel(plan),
        }))}
      >
        <p className="text-muted text-sm">
          Un solo contrato por institución, no uno por carrera: las carreras chicas no se quedan
          afuera de la comparación por una decisión de presupuesto.
        </p>
      </PlanColumn>

      <PlanColumn
        title="Destacado"
        subtitle="Complemento del plan Verificado, no un reemplazo."
        rank={PLAN_RANKS.destacado}
        prices={destacado.map((plan) => ({
          label: plan.name,
          price: priceLabel(plan),
        }))}
      >
        <div className="flex flex-col gap-2">
          <Badge tone="neutral">Destacado</Badge>
          <p className="text-muted text-sm">
            Toda ubicación paga se muestra con esa etiqueta, siempre. Nunca cambia el orden que
            pidió el estudiante ni entra en resultados que su filtro excluyó.
          </p>
        </div>
      </PlanColumn>
    </div>
  );
}
