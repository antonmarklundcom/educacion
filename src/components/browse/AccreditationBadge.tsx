/**
 * The one accreditation badge a card, a row or a detail page may show.
 *
 * The index has already picked which accreditation row wins
 * (`src/lib/search/accreditation.ts`); this component only decides how it
 * looks, and the wording rules live in `./accreditation-display` so they can
 * be tested without a renderer.
 *
 * Any positive status is a link to its source. The index refuses to carry an
 * uncited claim, so a missing `sourceUrl` means the badge stays a plain label
 * rather than inventing a citation to link to.
 */

import { Badge } from '@/components/ui';
import type { AccreditationSummary } from '@/lib/search';

import { accreditationLabel, accreditationTone } from './accreditation-display';

export interface AccreditationBadgeProps {
  accreditation: AccreditationSummary;
  className?: string;
}

export function AccreditationBadge({ accreditation, className }: AccreditationBadgeProps) {
  const label = accreditationLabel(accreditation);
  const tone = accreditationTone(accreditation);
  const badge = (
    <Badge tone={tone} className={className}>
      {accreditation.status === 'vigente' && <CheckIcon />}
      {label}
    </Badge>
  );

  if (!accreditation.sourceUrl) return badge;

  return (
    <a
      href={accreditation.sourceUrl}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="focus-visible:ring-ink rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      title={`Ver la fuente de la acreditación: ${label}`}
    >
      {badge}
    </a>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-3 fill-none stroke-current stroke-[2.6]">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
