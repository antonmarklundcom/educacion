/**
 * The site origin, and paths built from it.
 *
 * Split out of `jsonld.tsx` in PR-41: the schema builders are pure functions
 * with unit tests, and a `.tsx` file in their import graph drags JSX into a
 * test environment that has no reason to parse it. `jsonld.tsx` re-exports
 * this, so every existing import keeps working.
 */
export function siteUrl(path = ''): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://educacion.com.py';
  return `${base.replace(/\/$/, '')}${path}`;
}
