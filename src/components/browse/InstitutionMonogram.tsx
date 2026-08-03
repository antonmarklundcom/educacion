/**
 * The coloured 2–4 letter square from both prototypes.
 *
 * The colour comes from `institutions.brand_color` when the institution has
 * given us one and falls back to ink otherwise — it is never derived from a
 * hash of the name, because a made-up brand colour is a made-up fact about a
 * real organisation. The letters are `name_short`, which is a stored value,
 * not an abbreviation we compute.
 *
 * Logos land in PR-19 (the upload decision in risks.md §R-08 is not settled);
 * until then the monogram is what a card shows, and it never pretends to be a
 * logo we do not have.
 */

import { cn } from '@/lib/cn';

const SIZES = {
  sm: 'size-8 text-[0.625rem]',
  md: 'size-10 text-xs',
  lg: 'size-14 text-sm',
} as const;

export interface InstitutionMonogramProps {
  institutionShort: string;
  brandColor?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

/** Guards against a malformed stored value reaching `style` as arbitrary CSS. */
const HEX = /^#[0-9a-f]{6}$/i;

export function InstitutionMonogram({
  institutionShort,
  brandColor,
  size = 'md',
  className,
}: InstitutionMonogramProps) {
  const letters = institutionShort.slice(0, 4).toUpperCase();
  const color = brandColor && HEX.test(brandColor) ? brandColor : undefined;

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-semibold tracking-tight text-white',
        !color && 'bg-ink',
        SIZES[size],
        className,
      )}
      style={color ? { backgroundColor: color } : undefined}
    >
      {letters}
    </span>
  );
}
