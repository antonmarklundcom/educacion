/**
 * The copy catalog — the seam that keeps a second locale possible.
 *
 * ### The rule
 *
 * CLAUDE.md: **new UI copy goes through the catalog, never inline in JSX.**
 *
 * ### Why this shape and not an i18n library
 *
 * There is exactly one locale and there will be exactly one until somebody
 * decides otherwise (`student-engagement.md` §4 — guaraní before English, and
 * only with a translator we trust). A library would buy a message format, a
 * loader and a runtime lookup for a site that needs none of the three, and
 * `architecture.md` §1's excluded list exists so dependencies arrive when the
 * problem does. So the catalog is a plain object and lookup is property
 * access: `copy.nav.searchCta`.
 *
 * That choice is what makes the typing claim in `pr-plan.md` PR-47 true —
 * **a missing key is a type error, not a runtime fallback.** There is no
 * `t('some.key')` string lookup that can miss, no `?? key` fallback path, and
 * therefore no way for an untranslated string to reach a page as its own key.
 *
 * ### How a second locale lands
 *
 * `Messages` is the shape `es-PY` defines. A second catalog is
 * `export const gn: Messages = { … }` — and TypeScript refuses it until every
 * key is present with a compatible type. Add it to `messages`, widen `Locale`,
 * and replace `copy` at its call sites with a value the layout resolves from
 * the request. Nothing else in the app has to move, which is the whole point
 * of doing this before there is a second locale rather than during.
 */

import { esPY } from './es-py';

export const DEFAULT_LOCALE = 'es-PY';

export type Locale = typeof DEFAULT_LOCALE;

/** The contract any future catalog must satisfy in full. */
export type Messages = typeof esPY;

export const messages = { 'es-PY': esPY } satisfies Record<Locale, Messages>;

/**
 * The catalog for the only locale that exists. When a second one ships this
 * becomes a per-request lookup; until then a constant keeps every consumer a
 * server component with no plumbing.
 */
export const copy = messages[DEFAULT_LOCALE];
