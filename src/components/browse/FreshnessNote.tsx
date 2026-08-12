/**
 * "Última actualización" — the public freshness surface (PR-33).
 *
 * Every page that shows numbers we maintain says when we last checked them.
 * That is the other half of the policy change: a stale arancel is now
 * *displayed*, so the date it was verified stops being an internal detail and
 * becomes the thing that lets a visitor judge it. A date is also the cheapest
 * possible honesty — it costs a line and it is impossible to argue with.
 *
 * With nothing verified at all it says so rather than rendering nothing: "no
 * pudimos verificar" is information, an empty space is not.
 */

import { formatMonthYear } from '@/lib/format';

export function FreshnessNote({
  verifiedAt,
  subject,
  className,
}: {
  /** The most recent verification among whatever this page displays. */
  verifiedAt: Date | null;
  /** What was verified: "los aranceles de esta carrera". */
  subject: string;
  className?: string;
}) {
  return (
    <p className={className ?? 'text-faint max-w-prose text-xs'}>
      {verifiedAt
        ? `Última actualización de ${subject}: ${formatMonthYear(verifiedAt)}. Los datos con más de 12 meses se muestran igual, con un aviso al lado del número.`
        : `Todavía no verificamos ${subject}. Cuando lo hagamos, la fecha aparece acá.`}
    </p>
  );
}
