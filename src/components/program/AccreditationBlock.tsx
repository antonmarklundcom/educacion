/**
 * Accreditation, with its source. The wedge of the whole product (plan.md §2),
 * so it gets a block rather than a badge on the detail page.
 *
 * Three rules, all of them load-bearing:
 *
 *  1. `sin_datos` says **"Sin datos de acreditación"** and explains what that
 *     means. It never says "no acreditada" — an unverified negative about a
 *     real institution is the legally dangerous claim (risks.md §R-09).
 *  2. Any status we do assert links to the source that justifies it. The index
 *     refuses to carry an uncited claim, so `sourceUrl == null` on a positive
 *     status means the citation is a `resolution_number` we do not surface
 *     here — the block then says so instead of linking nowhere.
 *  3. A CONES record is a *habilitación*. It is not an accreditation and the
 *     copy says which is which, because conflating them is the confusion this
 *     site exists to clear up.
 */

import { AccreditationBadge } from '@/components/browse';
import { Card } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { AccreditationSummary } from '@/lib/search';

const EXPLANATIONS: Record<AccreditationSummary['status'], string> = {
  vigente:
    'La acreditación evalúa la calidad del programa. Verificá siempre la vigencia en la fuente oficial.',
  en_proceso:
    'El programa inició el proceso de acreditación. Todavía no hay una resolución de acreditación vigente.',
  vencida:
    'Hubo una acreditación, pero su vigencia terminó. Consultá con la institución si está en proceso de renovación.',
  no_acreditada:
    'Según la fuente citada, el programa no cuenta con acreditación. La habilitación para funcionar es un trámite distinto.',
  sin_datos:
    'No encontramos un registro de acreditación para este programa en las fuentes públicas que relevamos. Eso no significa que no esté acreditado: significa que no lo pudimos verificar.',
};

export function AccreditationBlock({ accreditation }: { accreditation: AccreditationSummary }) {
  const isCones = accreditation.agency === 'CONES';

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-ink text-base font-semibold">Acreditación</h2>

      <div className="flex flex-wrap items-center gap-2">
        <AccreditationBadge accreditation={accreditation} />
        {accreditation.validTo && (
          <span className="text-muted text-sm">
            Vigente hasta {formatDate(accreditation.validTo)}
          </span>
        )}
      </div>

      <p className="text-body text-sm">{EXPLANATIONS[accreditation.status]}</p>

      {isCones && (
        <p className="text-muted text-sm">
          La habilitación del CONES autoriza a la institución a ofrecer la carrera. La acreditación
          de la ANEAES evalúa su calidad y es un trámite distinto.
        </p>
      )}

      {accreditation.sourceUrl ? (
        <a
          href={accreditation.sourceUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-body hover:text-ink focus-visible:ring-ink rounded-sm text-sm font-medium underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
        >
          Ver la fuente {accreditation.agency ? `(${accreditation.agency})` : ''} ↗
        </a>
      ) : accreditation.status !== 'sin_datos' ? (
        <p className="text-muted text-sm">
          El registro se apoya en un número de resolución. Escribinos si necesitás la referencia
          completa.
        </p>
      ) : null}
    </Card>
  );
}
