/**
 * Hub intro copy — three pure functions, no I/O, easy to unit-test.
 *
 * ### The rule this module exists to keep
 *
 * CLAUDE.md rule 1: never fabricate data, "in the UI, in seed data, in test
 * fixtures, or in placeholder copy". `careers.description_md` and
 * `areas.description_md` are editorial fields nobody has written yet — there
 * is no admin UI to write them until PR-19/20, and seo.md §8 lists "career hub
 * intro copy, 150+ genuinely unique words each" as a first-90-days content
 * priority, not a PR-12 deliverable. So a career or area hub with no editorial
 * copy does not get 150 words of invented enthusiasm about "excellent career
 * prospects" — it gets an honest paragraph built only from what
 * `program_search` can prove: how many published offerings, at how many
 * institutions, in how many cities. That is real, it is sourced, and it is
 * the whole reason `buildCareerIntro`/`buildAreaIntro` take stats instead of
 * a description string.
 *
 * The city page (`buildCareerCityIntro`) has the stronger requirement — ≥120
 * words about *that city's* supply, not the career description with the city
 * swapped in (seo.md §4) — and it is met the same way: composed entirely from
 * the real offerings already fetched for that page (institution names,
 * modalities, price range, accreditation), never from prose written once and
 * reused. Two cities never read the same, because their supply never is.
 */

import { formatGs } from '@/lib/format';
import { MODALITY_LABELS, type OfferingSummary } from '@/lib/search';

import type { CareerStats } from '@/db/queries/careers';

export interface Paragraph {
  text: string;
  /** `false` means this is the honest-gap fallback, not hand-written copy. */
  isEditorial: boolean;
}

/** Below this, `descriptionMd` is treated as absent — a stub is not intro copy. */
export const MIN_EDITORIAL_WORDS = 150;

export function wordCount(text: string | null | undefined): number {
  return text?.trim() ? text.trim().split(/\s+/).length : 0;
}

function markdownParagraphs(md: string): string[] {
  return md
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/** `true` once real editorial copy exists — the signal both hub pages index on. */
export function hasEditorialCopy(descriptionMd: string | null): boolean {
  return wordCount(descriptionMd ?? '') >= MIN_EDITORIAL_WORDS;
}

/* -------------------------------------------------------------------------- */
/* Career hub                                                                 */
/* -------------------------------------------------------------------------- */

export function buildCareerIntro(
  career: { nameEs: string; areaName: string | null; descriptionMd: string | null },
  stats: CareerStats,
): Paragraph[] {
  if (hasEditorialCopy(career.descriptionMd)) {
    return markdownParagraphs(career.descriptionMd as string).map((text) => ({
      text,
      isEditorial: true,
    }));
  }

  if (stats.offeringCount === 0) {
    return [
      {
        isEditorial: false,
        text:
          `Todavía no publicamos ninguna oferta de ${career.nameEs} en Paraguay. ` +
          `Preferimos mostrar este aviso antes que un listado vacío disfrazado de completo.`,
      },
    ];
  }

  const institutionWord = stats.institutionCount === 1 ? 'institución' : 'instituciones';
  const cityWord = stats.cityCount === 1 ? 'ciudad' : 'ciudades';
  const offeringWord = stats.offeringCount === 1 ? 'oferta publicada' : 'ofertas publicadas';
  const areaClause = career.areaName ? ` dentro del área de ${career.areaName}` : '';

  return [
    {
      isEditorial: false,
      text:
        `Encontramos ${stats.offeringCount} ${offeringWord} de ${career.nameEs}${areaClause} en Paraguay, ` +
        `dictadas por ${stats.institutionCount} ${institutionWord} en ${stats.cityCount} ${cityWord}. ` +
        `Todavía no tenemos una descripción editorial de esta carrera — este resumen se arma solo con lo ` +
        `que publicamos, para no mostrar un texto genérico donde no tenemos uno propio.`,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Area hub                                                                   */
/* -------------------------------------------------------------------------- */

export function buildAreaIntro(
  area: { nameEs: string; descriptionMd: string | null },
  careerCount: number,
): Paragraph[] {
  if (hasEditorialCopy(area.descriptionMd)) {
    return markdownParagraphs(area.descriptionMd as string).map((text) => ({
      text,
      isEditorial: true,
    }));
  }

  if (careerCount === 0) {
    return [
      {
        isEditorial: false,
        text: `Todavía no publicamos carreras del área de ${area.nameEs}.`,
      },
    ];
  }

  const careerWord = careerCount === 1 ? 'carrera publicada' : 'carreras publicadas';

  return [
    {
      isEditorial: false,
      text:
        `El área de ${area.nameEs} agrupa ${careerCount} ${careerWord} en nuestro índice, cada una con ` +
        `su propia ficha de universidades, aranceles y estado de acreditación.`,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Career × city                                                             */
/* -------------------------------------------------------------------------- */

function joinNatural(values: string[]): string {
  if (values.length <= 1) return values.join('');
  return `${values.slice(0, -1).join(', ')} y ${values[values.length - 1]}`;
}

/**
 * Built only from the offerings the page already fetched for this
 * career+city — no separate query, and nothing here is invented: every
 * institution name, every modality and every price in the paragraph is a
 * value that appears on the page below it.
 */
export function buildCareerCityIntro(
  career: { nameEs: string },
  cityName: string,
  offerings: readonly OfferingSummary[],
): Paragraph[] {
  if (offerings.length === 0) {
    return [
      {
        isEditorial: false,
        text: `Todavía no publicamos ofertas de ${career.nameEs} en ${cityName}.`,
      },
    ];
  }

  const institutionNames = [...new Set(offerings.map((o) => o.institutionShort))].sort();
  const modalities = [
    ...new Set(offerings.map((o) => MODALITY_LABELS[o.modality].toLowerCase())),
  ].sort();

  const sentences: string[] = [];

  sentences.push(
    `En ${cityName} identificamos ${offerings.length} ${offerings.length === 1 ? 'oferta publicada' : 'ofertas publicadas'} ` +
      `de ${career.nameEs}, dictadas por ${institutionNames.length === 1 ? 'una institución' : `${institutionNames.length} instituciones`}: ` +
      `${joinNatural(institutionNames)}.`,
  );

  sentences.push(
    modalities.length > 1
      ? `La oferta combina modalidad ${joinNatural(modalities)}, según la sede y el turno.`
      : `Toda la oferta que publicamos en ${cityName} es de modalidad ${modalities[0]}.`,
  );

  const durations = offerings
    .map((o) => o.durationMonths)
    .filter((months): months is number => months != null);
  if (durations.length > 0) {
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    sentences.push(
      min === max
        ? `La duración publicada es de ${min} meses.`
        : `La duración publicada va de ${min} a ${max} meses, según la institución.`,
    );
  }

  const prices = offerings
    .map((o) => o.price)
    .filter((price) => price.hasAmount && price.annualCost != null && price.currency === 'PYG')
    .map((price) => price.annualCost as number);
  if (prices.length > 0) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    sentences.push(
      min === max
        ? `El arancel anual publicado es de ${formatGs(min)}.`
        : `El arancel anual publicado va de ${formatGs(min)} a ${formatGs(max)}.`,
    );
  } else {
    sentences.push(
      `Ninguna de estas ofertas tiene, por ahora, un arancel en guaraníes que podamos mostrar.`,
    );
  }

  const accredited = offerings.filter(
    (o) => o.accreditation.status === 'vigente' && o.accreditation.agency === 'ANEAES',
  ).length;
  sentences.push(
    accredited > 0
      ? `${accredited} de ${offerings.length} ${accredited === 1 ? 'cuenta' : 'cuentan'} con acreditación vigente de la ANEAES.`
      : `Por ahora no registramos acreditación vigente de la ANEAES en ninguna de estas ofertas.`,
  );

  sentences.push(
    `Compará duración, modalidad y arancel de cada una antes de inscribirte, o sumalas al comparador para verlas lado a lado.`,
  );

  return [{ isEditorial: false, text: sentences.join(' ') }];
}
