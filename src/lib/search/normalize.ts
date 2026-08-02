/**
 * Text normalization for the search index.
 *
 * `program_search.search_text` is written accent-stripped and lowercased at
 * index time and every query is normalized the same way before it reaches
 * MySQL. We never rely on collation for accent-insensitivity (architecture.md
 * §4.2): the collation of a Hostinger-provisioned database is not something we
 * control, `utf8mb4_general_ci` and `utf8mb4_0900_ai_ci` disagree about
 * `ñ`, and a search that silently stops matching "Diseño" after a server
 * upgrade is not a failure mode we can detect from here.
 *
 * `ñ` is folded to `n` on purpose. A student typing "diseno" on a phone
 * keyboard without a Spanish layout must find "Diseño"; the cost is that
 * "año"/"ano" collide, which no program name in this dataset distinguishes.
 */

/** InnoDB's default `innodb_ft_min_token_size`. Shorter tokens are not indexed. */
export const FT_MIN_TOKEN_SIZE = 3;

/** `program_search.search_text` is `varchar(1024)`. */
export const SEARCH_TEXT_MAX_LENGTH = 1024;

/**
 * Lowercase, strip diacritics, collapse everything that is not a letter or a
 * digit into a single space.
 *
 * The result contains only `[a-z0-9 ]`, which is also what makes it safe to
 * interpolate into a `MATCH ... AGAINST (... IN BOOLEAN MODE)` string: none of
 * the boolean operators (`+ - > < ( ) ~ * " @`) can survive this.
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Normalized tokens, de-duplicated, order preserved. */
export function tokenize(input: string): string[] {
  const normalized = normalizeText(input);
  if (!normalized) return [];
  return [...new Set(normalized.split(' '))].filter(Boolean);
}

/**
 * Everything a row should be findable by, in one normalized string.
 *
 * Order matters only for truncation: the fields most likely to be typed come
 * first, so a row with an unusually long tail loses the least useful tokens.
 */
export interface SearchTextParts {
  institutionName: string;
  institutionShort: string;
  acronym?: string | null;
  programName: string;
  careerName?: string | null;
  careerSynonyms?: string[] | null;
  titleAwarded?: string | null;
  campusName?: string | null;
  cityName: string;
  departmentName: string;
  areaName?: string | null;
}

export function buildSearchText(parts: SearchTextParts): string {
  const ordered = [
    parts.programName,
    parts.careerName,
    ...(parts.careerSynonyms ?? []),
    parts.institutionShort,
    parts.acronym,
    parts.institutionName,
    parts.titleAwarded,
    parts.cityName,
    parts.departmentName,
    parts.campusName,
    parts.areaName,
  ];

  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const value of ordered) {
    if (!value) continue;
    for (const token of normalizeText(value).split(' ')) {
      if (!token || seen.has(token)) continue;
      seen.add(token);
      tokens.push(token);
    }
  }

  let text = '';
  for (const token of tokens) {
    const next = text ? `${text} ${token}` : token;
    if (next.length > SEARCH_TEXT_MAX_LENGTH) break;
    text = next;
  }
  return text;
}

/* -------------------------------------------------------------------------- */
/* Query parsing                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A user query split into the two halves MySQL treats differently.
 *
 * InnoDB does not index tokens shorter than `innodb_ft_min_token_size`, so
 * "UC" is invisible to FULLTEXT no matter how the index is built. Those tokens
 * fall back to a prefix `LIKE` on `institution_short`: a two-letter query in
 * this dataset is an institution acronym, and returning nothing for the second
 * most common query shape after a career name is not an option.
 *
 * What a short token is *not* allowed to do is filter a query that also has
 * real words in it. Spanish is full of two-letter function words — "medicina
 * de la UC" contains `de` and `la` — and requiring each of them to prefix an
 * acronym would return zero results for a perfectly ordinary query. So:
 *
 * - query is **only** short tokens ("uc") → they are required, via `LIKE`.
 * - query also has long tokens → the long tokens filter; short tokens only
 *   raise the rank of rows whose acronym they match.
 *
 * The cost is that "UC medicina" returns every medicina in the country with
 * UC's at the top rather than UC's alone. The institution facet is one click
 * away, and no phrasing of a query can produce an empty page.
 */
export interface ParsedQuery {
  /** The normalized query, for logging and for the JS engine. */
  normalized: string;
  /** Tokens of at least `FT_MIN_TOKEN_SIZE` characters — the FULLTEXT half. */
  fullTextTokens: string[];
  /** Tokens below the FULLTEXT floor — the `institution_short` LIKE half. */
  shortTokens: string[];
  /** True when there is nothing to match on and `q` should be ignored. */
  isEmpty: boolean;
  /** True when the short tokens filter rather than merely rank. */
  shortTokensAreRequired: boolean;
}

export function parseQuery(q: string | null | undefined): ParsedQuery {
  const tokens = tokenize(q ?? '');
  const fullTextTokens = tokens.filter((t) => t.length >= FT_MIN_TOKEN_SIZE);
  const shortTokens = tokens.filter((t) => t.length < FT_MIN_TOKEN_SIZE);
  return {
    normalized: tokens.join(' '),
    fullTextTokens,
    shortTokens,
    isEmpty: tokens.length === 0,
    shortTokensAreRequired: shortTokens.length > 0 && fullTextTokens.length === 0,
  };
}

/**
 * The `AGAINST (... IN BOOLEAN MODE)` argument: every token required, every
 * token a prefix match so "medic" finds "medicina".
 *
 * Safe by construction — `normalizeText` has already removed every character
 * that means anything to the boolean parser.
 */
export function buildBooleanModeQuery(tokens: string[]): string {
  return tokens.map((token) => `+${token}*`).join(' ');
}
