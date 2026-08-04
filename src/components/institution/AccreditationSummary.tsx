/**
 * "¿Cuántas de sus carreras están acreditadas?" — the question the whole
 * product exists to answer (plan.md §2), at institution level.
 *
 * The wording is the careful part. `aneaesAccreditedCount` is a count of what
 * *we could verify*, over what *we have published* — not over what the
 * institution offers, which we do not know. So the copy says both, and a zero
 * says "we found none", never "it has none": ANEAES accredits far less than the
 * system habilitates, and an unverified negative about a real institution is
 * the legally dangerous claim (risks.md §R-09).
 */

import { Card } from '@/components/ui';
import type { InstitutionCounts } from '@/lib/institutions';

export function AccreditationSummary({ counts }: { counts: InstitutionCounts }) {
  const { aneaesAccreditedCount, programCount } = counts;

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-ink text-base font-semibold">Acreditación</h2>

      {programCount === 0 ? (
        <p className="text-body text-sm">
          Todavía no publicamos carreras de esta institución, así que no podemos resumir su estado
          de acreditación.
        </p>
      ) : aneaesAccreditedCount > 0 ? (
        <>
          <p className="text-ink text-lg font-semibold">
            <span className="font-mono">{aneaesAccreditedCount}</span>
            <span className="text-muted font-mono"> / {programCount}</span>
          </p>
          <p className="text-body text-sm">
            De las {programCount} carreras que publicamos, {aneaesAccreditedCount} tienen una
            acreditación de la ANEAES vigente según las fuentes que pudimos verificar. Cada carrera
            enlaza a su fuente.
          </p>
        </>
      ) : (
        <p className="text-body text-sm">
          No encontramos acreditaciones vigentes de la ANEAES para las carreras que publicamos de
          esta institución. Eso no significa que no las tenga: significa que no las pudimos
          verificar en las fuentes públicas que relevamos.
        </p>
      )}

      <p className="text-muted text-sm">
        La habilitación del CONES autoriza a funcionar; la acreditación de la ANEAES evalúa la
        calidad. Son trámites distintos.
      </p>
    </Card>
  );
}
