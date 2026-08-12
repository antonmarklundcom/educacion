/**
 * The two plan-derived marks a student sees, and the sentence that discloses
 * the second one (PR-27).
 *
 * ### Both are read live, never from `program_search`
 *
 * The index carries `plan_rank`, and it is refreshed on every subscription
 * write and again nightly — good enough to *order* rows, and not good enough
 * to *label* them. A label is a claim about a commercial relationship at the
 * moment the page renders, so it comes from `getPlacementFlags()`, one query
 * per page keyed by the institution ids the rows already carry
 * (`architecture.md` §17). The worst case for ordering is a few hours of
 * staleness; the worst case for a label read from a stale index would be
 * telling a student a placement is paid when it is not, or hiding that it is.
 *
 * ### Why "Destacado" is deliberately quiet
 *
 * `design-system.md` §4 fixes it as neutral background, muted text — the
 * opposite of an ad. Its job is disclosure, not persuasion: the student has to
 * be able to see that a placement was paid for, and the institution has not
 * bought the right to shout.
 */

import { Badge } from '@/components/ui';
import { NO_PLACEMENT, type PlacementFlags } from '@/lib/entitlements/contract';

export { NO_PLACEMENT, type PlacementFlags };

/**
 * "Perfil verificado" says something narrow and true: somebody at the
 * institution has an account here and maintains this profile. It says nothing
 * about accreditation, quality or price — that is what the accreditation badge
 * is for, and conflating the two would be selling the wedge.
 */
export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <Badge
      tone="accent"
      className={className}
      title="La institución mantiene este perfil desde su propia cuenta."
    >
      Perfil verificado
    </Badge>
  );
}

export function DestacadoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="neutral" className={className} title="Ubicación paga, siempre etiquetada.">
      Destacado
    </Badge>
  );
}

/**
 * The disclosure line, rendered on a results page **only when a paid placement
 * is actually on it**. A permanent notice about advertising on a page with no
 * advertising is noise that teaches people to skip the notice.
 */
export function PlacementDisclosure({ className }: { className?: string }) {
  return (
    <p className={className ?? 'text-faint max-w-prose text-xs'}>
      Las carreras marcadas <span className="text-muted font-medium">Destacado</span> son de
      instituciones con una ubicación paga. Solo desempatan entre resultados que ya estaban
      empatados: no cambian el orden que elegiste ni agregan carreras que tus filtros dejaron
      afuera.
    </p>
  );
}
