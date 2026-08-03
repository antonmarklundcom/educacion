/**
 * Fuzzy string similarity for step 4 of `docs/data-sources.md` §4.
 *
 * The doc says "trigram / Levenshtein ratio ≥ 0.88 → propose, do not
 * auto-apply", and both metrics are implemented because they fail differently:
 *
 * - **Levenshtein** is right about typos and abbreviations inside a word
 *   (`CATOLICA` vs `CATOLIC`), and wrong about reordered words.
 * - **Trigram Dice** is right about reordered and partially-shared names
 *   (`ASUNCION NUESTRA SENORA CATOLICA`), and wrong about short strings.
 *
 * The score is the higher of the two. That is deliberately the generous
 * reading: nothing fuzzy is ever applied (`FUZZY_AUTO_APPLY` is false), so the
 * cost of a false positive here is one extra row in the moderation queue,
 * while the cost of a false negative is an institution silently duplicated.
 */

/** Levenshtein distance, two-row DP. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, substitution);
    }
    [previous, current] = [current, previous];
  }

  return previous[b.length];
}

/** 0–1. 1 means identical. */
export function levenshteinRatio(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(a, b) / longest;
}

/** Padded character trigrams, as a set. */
export function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const set = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i += 1) {
    set.add(padded.slice(i, i + 3));
  }
  return set;
}

/** Dice coefficient over trigram sets. 0–1. */
export function trigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const left = trigrams(a);
  const right = trigrams(b);
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;

  return (2 * shared) / (left.size + right.size);
}

/** The matcher's score: 0–100, integer, the higher of the two metrics. */
export function similarityScore(a: string, b: string): number {
  if (a === b) return 100;
  return Math.round(100 * Math.max(levenshteinRatio(a, b), trigramSimilarity(a, b)));
}
