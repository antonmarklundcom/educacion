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

/**
 * A name and the acronym the source printed *inside* it.
 *
 * CONES writes its institutions as `Universidad Autónoma de Asunción – UAA`:
 * 10 of the 13 names on the saved register pages carry a trailing acronym like
 * this, and two of them (`– UC`, `– UNASUR`) show the range it spans. Left in
 * place, that suffix does two kinds of damage at once — it becomes a token in
 * the match key, so the same institution written without it does not match;
 * and the acronym itself, printed right there, never reaches the acronym index
 * that §4 step 3 exists to use.
 *
 * This **reads** an acronym the source printed. It never derives one from
 * initials — inventing `UNA` for a name that never spelled it out is exactly
 * the confident guess that merges two institutions.
 */
export interface PrintedName {
  /** The name with a printed acronym suffix removed. */
  name: string;
  /** The acronym as printed, or null when the name carries none. */
  acronym: string | null;
}

/**
 * Uppercase-only, 2–8 characters, at the very end, after a dash or inside
 * parentheses. Case is read from the *raw* string on purpose: lowercasing
 * first would make `Universidad de la Costa` end in an "acronym".
 */
const PRINTED_ACRONYM =
  /^(.*\S)\s*(?:[–—-]\s*|\(\s*)([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ0-9.]{1,7})\s*\)?\s*$/u;

export function splitPrintedAcronym(rawName: string): PrintedName {
  const match = PRINTED_ACRONYM.exec(rawName.trim());
  if (!match) return { name: rawName.trim(), acronym: null };

  const name = match[1].trim();
  const acronym = normalizeName(match[2]).replace(/ /g, '');
  // A name that is *only* an acronym keeps its name; there is nothing to split.
  if (!name || !acronym) return { name: rawName.trim(), acronym: null };
  return { name, acronym };
}

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

/**
 * The institution match key. `BuildMatchKey` from `contract.ts`.
 *
 * A printed acronym suffix is dropped before the key is built, so
 * `Universidad Autónoma de Luque – UAL` and `Universidad Autónoma de Luque`
 * converge instead of queueing as a fuzzy near-miss. The acronym is not lost —
 * `acronymCandidate` returns it, and the matcher indexes it separately.
 *
 * Dropping it cannot merge two distinct institutions on its own: names that
 * differ *only* by the suffix are the same name, and a key resolving to two
 * institutions is reported `ambiguous_match` and never applied (`match.ts`).
 */
export function buildMatchKey(rawName: string): string {
  return keyFrom(splitPrintedAcronym(rawName).name, INSTITUTION_STOPWORDS);
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
  // An acronym the source printed inside a full name: "… de Luque – UAL".
  const printed = splitPrintedAcronym(rawName).acronym;
  if (printed) return printed;

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
