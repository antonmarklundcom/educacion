/**
 * How a beca's money and deadline are worded (PR-31). Pure, so the honesty
 * rules below are unit-testable.
 *
 * **`sin_datos` says so.** "Beca" with no coverage stated is exactly the field
 * a reader fills in optimistically, so the unknown case renders as "no sabemos
 * cuánto cubre" rather than as an empty space (CLAUDE.md rule 1, same argument
 * as "Sin datos de acreditación").
 */

import { formatGs } from '@/lib/format';

export interface CoverageFacts {
  coverage: 'total' | 'parcial' | 'monto_fijo' | 'sin_datos';
  amountPyg: number | null;
  percentage: number | null;
}

export function coverageLabel(beca: CoverageFacts): string {
  switch (beca.coverage) {
    case 'total':
      return 'Cubre el 100% del arancel';
    case 'parcial':
      return beca.percentage != null
        ? `Cubre el ${beca.percentage}% del arancel`
        : 'Cubre una parte del arancel (no sabemos cuánto)';
    case 'monto_fijo':
      return beca.amountPyg != null
        ? `${formatGs(beca.amountPyg)} en total`
        : 'Un monto fijo (no sabemos cuánto)';
    default:
      return 'No sabemos cuánto cubre';
  }
}

/** Days until a deadline, or null when there is none. Whole days, UTC. */
export function daysToDeadline(deadline: string | null, today: string): number | null {
  if (!deadline) return null;
  return Math.round(
    (Date.parse(`${deadline}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000,
  );
}

export function deadlineLabel(deadline: string | null, now: Date = new Date()): string {
  const days = daysToDeadline(deadline, now.toISOString().slice(0, 10));
  if (days == null) return 'Convocatoria permanente';
  if (days < 0) return 'Cerrada';
  if (days === 0) return 'Cierra hoy';
  if (days === 1) return 'Cierra mañana';
  if (days <= 30) return `Cierra en ${days} días`;
  return `Cierra el ${deadline}`;
}
