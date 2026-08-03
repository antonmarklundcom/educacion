/**
 * The public URL vocabulary, built from slugs the index already carries.
 *
 * One place, so a card, a table row, a comparador column and a breadcrumb can
 * never disagree about where an offering lives (seo.md §2).
 */

import type { OfferingSummary } from '@/lib/search';

export const CARRERAS_PATH = '/carreras';

export function offeringHref(offering: OfferingSummary): string {
  return `/universidades/${offering.institutionSlug}/${offering.programSlug}`;
}

export function institutionHref(institutionSlug: string): string {
  return `/universidades/${institutionSlug}`;
}

export function careerHref(careerSlug: string): string {
  return `/carreras/${careerSlug}`;
}

export function areaHref(areaSlug: string): string {
  return `/areas/${areaSlug}`;
}
