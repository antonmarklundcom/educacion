/**
 * `careers.salida_laboral_md` — the structure, and the rule it exists under
 * (PR-32).
 *
 * ### `risks.md` §R-11, restated where the code can see it
 *
 * Paraguay has no reliable public dataset for salaries or employability by
 * degree. Every competitor showing those numbers is either citing a foreign
 * source or inventing them. So this content is **qualitative only**: where
 * graduates work, in which sectors, what a first job tends to look like. No
 * average salary, no employment rate, no "carreras mejor pagadas".
 *
 * That rule cannot be enforced by a validator — a number in prose is not
 * distinguishable from a citation by regex, and a validator that tried would
 * either block "cinco años de carrera" or wave through "el 80% consigue
 * trabajo". What is enforceable, and is done here, is that the **editor is told
 * the rule at the moment of writing** (`SALIDA_LABORAL_TEMPLATE` is in the
 * admin field label) and that a section with numbers-and-no-link is visible as
 * such on the page it lands on.
 *
 * ### Why sections rather than one paragraph
 *
 * The brief asked for real structure, and structure is also what makes the
 * content answerable: "¿dónde trabajan?" and "¿cómo es el primer trabajo?" are
 * separate questions a student asks, and separate H2s are what a search engine
 * and an AI answer surface can both quote.
 */

/** The `##` headings a complete entry has, in order. Not enforced — offered. */
export const SALIDA_LABORAL_SECTIONS = [
  'Dónde trabajan',
  'Sectores que contratan',
  'Cómo suele ser el primer trabajo',
  'Especializaciones y caminos posibles',
] as const;

/** Pre-filled into an empty admin field, so the shape is the default. */
export const SALIDA_LABORAL_TEMPLATE = SALIDA_LABORAL_SECTIONS.map(
  (heading) => `## ${heading}\n\n`,
).join('');

export const SALIDA_LABORAL_HINT =
  'Cualitativo, sin números: dónde trabajan, qué sectores contratan, cómo es el primer trabajo. ' +
  'Nada de sueldos promedio ni tasas de empleabilidad — no existe una fuente paraguaya citable para eso (risks.md R-11).';

/** True once there is something worth rendering as its own section. */
export function hasSalidaLaboral(md: string | null | undefined): boolean {
  if (!md) return false;
  // A template with every heading and no prose under it is not content.
  const withoutHeadings = md.replace(/^#{2,3}\s+.*$/gm, '').trim();
  return withoutHeadings.length >= 80;
}
