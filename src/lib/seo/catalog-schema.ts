/**
 * JSON-LD for the three page types `seo.md` §5 calls the money pages, plus the
 * sitewide entity blocks (PR-41).
 *
 * `jsonld.tsx` holds the `<JsonLd>` primitive and the editorial types PR-30
 * shipped; this module holds the catalog types, in the shape that file's own
 * comment anticipated ("extend rather than replace"). Two rules from §5 are
 * load-bearing and enforced here by construction:
 *
 * 1. **Never `aggregateRating`, never `review`.** We have neither, and
 *    inventing them violates the rule the whole product rests on (CLAUDE.md
 *    rule 1). No function below can emit either — there is no code path.
 * 2. **Schema mirrors what is visible.** Every field is read from the same
 *    `OfferingSummary` / `InstitutionProfile` the page renders. Nothing here
 *    queries, derives or formats a fact the reader cannot also see.
 *
 * ### The arancel, and why `Offer` is stricter than the page
 *
 * CLAUDE.md rule 3 says a stale arancel **is displayed**, always with a visible
 * "dato desactualizado" warning and its verification date. That works in HTML
 * because the warning sits next to the number. `Offer` has nowhere to put it:
 * schema.org has no "this price is a year old" field, and a rich result would
 * reprint the number stripped of the one piece of context that makes showing it
 * honest. So an `Offer` is emitted **only** for a price `priceFreshness()` calls
 * `fresh` — the JSON-LD half of the PR-33 rule. A stale price still renders on
 * the page, warned; it simply does not become a machine-readable claim.
 *
 * `priceFreshness()` is imported, never re-implemented: `src/db/invariants.ts`
 * stays the single decision point for the comparador, the OG images and this.
 */

import { priceFreshness } from '@/db/invariants';
import type { InstitutionProfile } from '@/db/queries/institutions';
import type { OfferingSummary } from '@/lib/search';

import { siteUrl } from './site-url';

/** Guaraníes, as ISO 4217. The only currency the catalog stores. */
const PYG = 'PYG';

/** schema.org's controlled vocabulary for `courseMode`. */
const COURSE_MODE: Record<OfferingSummary['modality'], string> = {
  presencial: 'onsite',
  semipresencial: 'blended',
  distancia: 'online',
};

/**
 * ISO 8601 duration. `durationMonths` is an integer by schema contract — the
 * repo never stores "5 años" — so this is a formatting concern only.
 */
function isoDuration(months: number | null): string | undefined {
  return months == null ? undefined : `P${months}M`;
}

/**
 * The one place an amount becomes a machine-readable claim.
 *
 * Returns `undefined` for anything that is not a current, computable figure:
 * no amount at all, or an amount `priceFreshness()` calls `stale`/`unknown`.
 * `isFree` is a claim like any other and passes the same freshness gate — a
 * two-year-old "gratuita" is exactly as wrong as a two-year-old number.
 */
function offerFor(offering: OfferingSummary, now: Date): Record<string, unknown> | undefined {
  const { price } = offering;
  if (!price.hasAmount) return undefined;
  if (priceFreshness(price.verifiedAt, now) !== 'fresh') return undefined;

  const amount = price.isFree ? 0 : price.annualCost;
  // A price with a matrícula but no cuota has no honest annual figure;
  // `computeAnnualCost` returns null rather than a partial sum, and a partial
  // sum is precisely what must not reach a rich result.
  if (amount == null) return undefined;

  return {
    '@type': 'Offer',
    price: amount,
    priceCurrency: price.currency ?? PYG,
    category: 'Arancel anual',
    availability: 'https://schema.org/InStock',
    url: siteUrl(`/universidades/${offering.institutionSlug}/${offering.programSlug}`),
  };
}

/**
 * `Course` + one `CourseInstance` per offering (PR-41).
 *
 * A programme page renders every offering of the same programme — different
 * campus, modality or shift — so each becomes an instance, and the `Course`
 * itself carries only what all of them share.
 */
export function courseSchema(
  offerings: readonly OfferingSummary[],
  now: Date = new Date(),
): Record<string, unknown> | null {
  const primary = offerings[0];
  if (!primary) return null;

  const url = siteUrl(`/universidades/${primary.institutionSlug}/${primary.programSlug}`);

  const instances = offerings.map((offering) => {
    const offer = offerFor(offering, now);
    return {
      '@type': 'CourseInstance',
      courseMode: COURSE_MODE[offering.modality],
      location: {
        '@type': 'Place',
        name: offering.campusName,
        address: {
          '@type': 'PostalAddress',
          addressLocality: offering.cityName,
          addressRegion: offering.departmentName,
          addressCountry: 'PY',
        },
      },
      ...(isoDuration(offering.durationMonths)
        ? { courseSchedule: { '@type': 'Schedule', repeatCount: offering.durationMonths } }
        : {}),
      ...(offer ? { offers: offer } : {}),
    };
  });

  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: primary.programName,
    url,
    inLanguage: 'es-PY',
    // `name_official` on detail pages, matching what the page prints.
    provider: {
      '@type': 'CollegeOrUniversity',
      name: primary.institutionName,
      url: siteUrl(`/universidades/${primary.institutionSlug}`),
    },
    ...(primary.titleAwarded ? { educationalCredentialAwarded: primary.titleAwarded } : {}),
    ...(isoDuration(primary.durationMonths)
      ? { timeRequired: isoDuration(primary.durationMonths) }
      : {}),
    hasCourseInstance: instances,
  };
}

/**
 * `CollegeOrUniversity` for an institution profile.
 *
 * Contact fields are emitted only where the profile actually shows them; an
 * institution with no captured website or phone gets a smaller block, not a
 * placeholder. No `aggregateRating` — see this file's header.
 */
export function institutionSchema(profile: InstitutionProfile): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollegeOrUniversity',
    name: profile.nameOfficial,
    alternateName: profile.nameShort,
    url: siteUrl(`/universidades/${profile.slug}`),
    ...(profile.website ? { sameAs: [profile.website] } : {}),
    ...(profile.logoUrl ? { logo: siteUrl(profile.logoUrl) } : {}),
    ...(profile.foundedYear ? { foundingDate: String(profile.foundedYear) } : {}),
    ...(profile.email ? { email: profile.email } : {}),
    ...(profile.phoneE164 ? { telephone: profile.phoneE164 } : {}),
    address: { '@type': 'PostalAddress', addressCountry: 'PY' },
  };
}

export interface ListEntry {
  name: string;
  path: string;
}

/**
 * `ItemList` for a career hub — the programmes the page actually lists, in the
 * order it lists them. Positions are 1-based and follow the rendered page, so
 * a paginated hub describes its own page rather than a list nobody can see.
 */
export function itemListSchema(
  name: string,
  entries: readonly ListEntry[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: entries.length,
    itemListElement: entries.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      url: siteUrl(entry.path),
    })),
  };
}

/**
 * `WebSite` + `SearchAction`, sitewide. The target is `/carreras?q=`, which is
 * the real search surface — `FILTER_PARAMS.q` in the search contract.
 */
export function websiteSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'educacion.com.py',
    url: siteUrl(),
    inLanguage: 'es-PY',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: siteUrl('/carreras?q={search_term_string}'),
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * `Organization`, sitewide.
 *
 * The `description` restates the R-07 independence disclaimer that the footer
 * carries on every page (CLAUDE.md rule 9) — the one piece of context a search
 * engine most needs about a domain that looks official.
 */
export function organizationSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'educacion.com.py',
    url: siteUrl(),
    description:
      'Sitio privado e independiente de información sobre educación superior en Paraguay. No es un portal oficial del MEC, CONES ni ANEAES.',
  };
}
