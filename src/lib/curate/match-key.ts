/**
 * Normalization for the matcher — `docs/data-sources.md` §4.1.
 *
 * One institution reaches us as `Universidad Católica "Nuestra Señora de la
 * Asunción"`, as `UNIVERSIDAD CATOLICA NTRA. SRA. DE LA ASUNCION` and as
 * `U.C.A.`. The match key is what makes the first two the same string; the
 * acronym candidate is what gives the third a chance.
 *
 * Everything here is pure and deterministic. The same key has to come out of
 * the importer, out of `institution_aliases` and out of the admin queue — a
 * key that depends on when it was computed is a key that silently stops
 * matching after a refactor.
 *
 * ### The cost of dropping `NACIONAL`
 *
 * §4.1 prescribes dropping `UNIVERSIDAD` and `NACIONAL`, and we follow the
 * prescription. It does over-merge in principle: `Universidad Nacional de X`
 * and `Universidad de X` produce the same key. The matcher's guard against
 * that is that a key resolving to more than one institution is never applied —
 * it is reported as `ambiguous_match` and goes to a human (see `match.ts`).
 */

/** Dropped from institution keys: §4.1's list plus the remaining articles. */
export const INSTITUTION_STOPWORDS: ReadonlySet<string> = new Set([
  'UNIVERSIDAD',
  'UNIVERSIDADES',
  'NACIONAL',
  'DE',
  'DEL',
  'LA',
  'LAS',
  'LOS',
  'EL',
  'Y',
]);

/**
 * Dropped from career/program keys. Deliberately *not* including the words
 * that name a level or a discipline — `LICENCIATURA`, `INGENIERIA`,
 * `TECNICATURA` distinguish real programs from each other.
 */
export const CAREER_STOPWORDS: ReadonlySet<string> = new Set([
  'CARRERA',
  'CARRERAS',
  'PROGRAMA',
  'DE',
  'DEL',
  'LA',
  'LAS',
  'LOS',
  'EL',
  'Y',
  'EN',
]);

/**
 * Abbreviations these registers use interchangeably with the full word.
 * Expanded before stopwords are dropped, so `NTRA. SRA.` and `NUESTRA SEÑORA`
 * converge instead of producing two keys for one institution.
 */
export const ABBREVIATIONS: Readonly<Record<string, string>> = {
  NTRA: 'NUESTRA',
  NTRO: 'NUESTRO',
  SRA: 'SENORA',
  SR: 'SENOR',
  STA: 'SANTA',
  STO: 'SANTO',
  UNIV: 'UNIVERSIDAD',
  INST: 'INSTITUTO',
  TEC: 'TECNICO',
  DR: 'DOCTOR',
  PROF: 'PROFESOR',
  GRAL: 'GENERAL',
};

/** Uppercase → strip accents → punctuation to space → collapse whitespace. */
export function normalizeName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function tokensOf(raw: string): string[] {
  const normalized = normalizeName(raw);
  if (!normalized) return [];
  return normalized.split(' ').map((token) => ABBREVIATIONS[token] ?? token);
}

function keyFrom(raw: string, stopwords: ReadonlySet<string>): string {
  const tokens = tokensOf(raw);
  const kept = tokens.filter((token) => !stopwords.has(token));
  // "Universidad Nacional" is entirely stopwords. Returning an empty key would
  // make every such name match every other; keeping the full name is worse for
  // recall and far better for correctness.
  return (kept.length > 0 ? kept : tokens).join(' ');
}

/** The institution match key. `BuildMatchKey` from `contract.ts`. */
export function buildMatchKey(rawName: string): string {
  return keyFrom(rawName, INSTITUTION_STOPWORDS);
}

/** The career/program match key. Same algorithm, different stopword list. */
export function buildCareerMatchKey(rawName: string): string {
  return keyFrom(rawName, CAREER_STOPWORDS);
}

/**
 * The acronym a name is *entirely* made of, or null.
 *
 * `U.C.A.` and `UNA` are acronym candidates; `Universidad Nacional de Asunción`
 * is not. We never derive an acronym from initials — inventing `UNA` for a name
 * that never printed it is exactly the kind of confident guess that merges two
 * institutions.
 */
export function acronymCandidate(rawName: string): string | null {
  const tokens = normalizeName(rawName).split(' ').filter(Boolean);
  if (tokens.length === 0) return null;

  // "U C A" — a dotted acronym after punctuation stripping.
  if (tokens.length > 1 && tokens.every((token) => token.length === 1)) {
    return tokens.join('');
  }
  if (tokens.length === 1 && tokens[0].length >= 2 && tokens[0].length <= 8) {
    return tokens[0];
  }
  return null;
}

/** ASCII lowercase-hyphen, per the slug convention in `data-model.md` §3. */
export function slugify(raw: string): string {
  const slug = normalizeName(raw).toLowerCase().replace(/ /g, '-');
  return slug.slice(0, 150);
}

/**
 * `slugify` plus a numeric suffix until the slug is free.
 *
 * Slug uniqueness is a UNIQUE index, so a collision is an import that fails
 * halfway rather than a duplicate row — but failing halfway on the fifth
 * "Facultad de Medicina" is not a useful outcome either.
 */
export function uniqueSlug(raw: string, taken: ReadonlySet<string>): string {
  const base = slugify(raw) || 'sin-nombre';
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`Could not find a free slug for "${raw}".`);
}
