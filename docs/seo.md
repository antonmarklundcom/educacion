# SEO Architecture

Applies `seo-web-builds` to this project. Locale: `es-PY`, voseo, single language (no hreflang needed).

## 1. Why SEO is the entire distribution strategy

There is no paid-acquisition budget and no captive traffic (see `risks.md` §R-01). Every visitor arrives from a search or a shared WhatsApp link. The two consequences:

1. **The index must be exhaustive.** Long-tail coverage _is_ the traffic model — thousands of `[carrera] + [ciudad]` and `[universidad] + [carrera]` queries, each tiny, collectively the business.
2. **OG images matter as much as titles.** In Paraguay, links are shared in WhatsApp groups. A shared comparison or program page is an ad. Every public route needs a real 1200×630 OG image.

## 2. URL map

| Route                             | Intent                                          | Indexed                                      |
| --------------------------------- | ----------------------------------------------- | -------------------------------------------- |
| `/`                               | brand + "buscar carreras en Paraguay"           | ✅                                           |
| `/carreras`                       | browse (base, unfiltered)                       | ✅                                           |
| `/carreras?...filters`            | filtered combinations                           | ❌ `noindex,follow`, canonical → `/carreras` |
| `/carreras/[carrera]`             | **"medicina en paraguay"** — primary money page | ✅                                           |
| `/carreras/[carrera]/[ciudad]`    | "medicina en encarnación"                       | ✅ **only above the supply gate (§4)**       |
| `/areas/[area]`                   | "carreras de salud en paraguay"                 | ✅                                           |
| `/universidades`                  | "universidades de paraguay"                     | ✅                                           |
| `/universidades/[inst]`           | "universidad católica carreras"                 | ✅                                           |
| `/universidades/[inst]/[program]` | "medicina una arancel" — the lead page          | ✅                                           |
| `/acreditacion` + children        | **"carreras acreditadas aneaes"** — the wedge   | ✅                                           |
| `/becas`, `/becas/[slug]`         | "becas para estudiar en paraguay"               | ✅                                           |
| `/blog/[slug]`                    | informational, feeds the money pages            | ✅                                           |
| `/comparar`                       | shareable, not searchable                       | ❌ `noindex`                                 |
| `/para-instituciones`             | B2B                                             | ✅                                           |
| `/legal/*`                        | trust                                           | ✅ (low priority)                            |
| `/panel`, `/admin`                | private                                         | ❌ `noindex, nofollow` + auth                |

**One page = one intent.** The most likely cannibalization here is `/carreras/medicina` vs a blog post "¿Qué se estudia en Medicina?" — the hub owns the transactional intent, the post owns the informational intent and links to the hub. Never let a post target "medicina en paraguay".

## 3. Metadata patterns

```
/carreras/[carrera]
  title: "{Carrera} en Paraguay – {N} universidades y aranceles | educacion.com.py"   (≤60)
  desc:  "Compará {N} opciones para estudiar {Carrera} en Paraguay: aranceles,
          duración, modalidad y acreditación ANEAES. Actualizado {mes año}."          (≤155)
  h1:    "{Carrera} en Paraguay"

/universidades/[inst]/[program]
  title: "{Programa} – {Institución Corta} | Arancel, duración y acreditación"
  desc:  "{Programa} en {Institución}: {duración}, modalidad {modalidad}, {arancel|consultá el arancel}
          y estado de acreditación. Solicitá información."
  h1:    "{Programa}"

/universidades/[inst]
  title: "{Institución Corta} – Carreras, aranceles y sedes | educacion.com.py"

/areas/[area]
  title: "Carreras de {Área} en Paraguay – {N} opciones | educacion.com.py"
```

Rules: exactly one H1 per page containing the primary keyword; H2s are real subtopics ("¿Cuánto cuesta estudiar Medicina en Paraguay?") that double as FAQ schema and AI-answer surface; never use headings for styling; the "Actualizado {mes año}" in descriptions is generated from real `verified_at` data, never hardcoded.

## 4. The city-page gate (anti-doorway rule)

`/carreras/[carrera]/[ciudad]` generates **only if** all three hold:

1. ≥ 3 published offerings of that career in that city, **and**
2. ≥ 2 distinct institutions, **and**
3. unique intro copy exists (≥ 120 words about that city's supply — not the career description with the city name swapped in).

Otherwise the city filter is a query param on the hub, `noindex`. Ten thin city pages with a swapped name is a doorway-page pattern and it will suppress the whole directory. Enforce the gate in `generateStaticParams`, not by discipline.

### 4.1 What PR-12 settled

**The gate is enforced at request time, not in `generateStaticParams`.** `architecture.md` §3 already has every detail route as `force-dynamic` until a build-time database exists — CI's `npm run build` has no `DATABASE_URL` to enumerate cities from — so `/carreras/[carrera]/[ciudad]` calls the same `getCareerCitySupply()` the hub used to link it and `notFound()`s if the city fails the gate. Same numbers, same query, so a city can never appear as a link on the hub and 404 underneath it.

**A career or area hub with no editorial `description_md` ships `noindex, follow`, not fabricated copy.** Nobody has written the 150 words yet — there is no admin UI to write them before PR-19/20, and §8 below lists this copy as first-90-days content work, not something PR-12 auto-generates. Inventing enthusiastic career-outlook prose to hit the word count would be exactly the fabrication CLAUDE.md rule 1 bans. Instead the hub renders an honest paragraph built only from real `program_search` counts (`src/lib/careers/copy.ts`) and stays out of the index until `description_md` clears `MIN_EDITORIAL_WORDS` (150) — at which point it starts indexing itself, no code change required. The gated city page has no such gap and ships indexed immediately: its intro is composed entirely from the offerings already fetched for that city (real institution names, modalities, price range, accreditation counts), which is genuinely unique per city without being hand-written.

## 5. Structured data

| Page                                                     | JSON-LD                                                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| All                                                      | `Organization` (educacion.com.py) + `WebSite` with `SearchAction`                                                                                      |
| `/carreras/[carrera]`, `/areas/[area]`, `/universidades` | `ItemList` + `BreadcrumbList`                                                                                                                          |
| `/universidades/[inst]`                                  | `CollegeOrUniversity` (or `EducationalOrganization` for institutos) + `BreadcrumbList`                                                                 |
| `/universidades/[inst]/[program]`                        | `Course` + `CourseInstance` (with `courseMode` and duration) + `BreadcrumbList`, plus `Offer` **only where we have a price verified within 12 months** |
| `/becas/[slug]`                                          | `ItemList` parent, `Offer`-style detail                                                                                                                |
| `/blog/[slug]`                                           | `Article` + author `Person`                                                                                                                            |
| FAQ sections                                             | `FAQPage` — only where the Q&As are visible on the page                                                                                                |

**Never** emit `aggregateRating` or `review` — we have no reviews, and inventing them violates the anti-fabrication rule the whole product rests on.

**OG image routes (PR-39).** Every shared page needs a real card (§1), so each
carries its own route handler rather than a static image — a card is per-record
and the record isn't known at build time. All are 1200×630, `runtime = 'nodejs'`,
`dynamic = 'force-dynamic'`, and live outside `/api` so `robots.ts` doesn't hide
them from Facebook's and WhatsApp's scrapers. A missing record 404s; none of
them ever render blank.

| Route                                   | Draws                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `/og/blog?slug=…`                        | title, author, publication date, wordmark                                        |
| `/og/beca?slug=…`                        | title, provider, coverage and deadline (same wording as the page)                |
| `/og/programa?instSlug=…&programSlug=…`  | programme name, institution, duración, arancel via `priceDisplay()`              |
| `/og/comparar?ids=…`                     | up to N compared programmes (PR-33)                                              |

`/og/programa` mirrors `/og/comparar`'s handling of the arancel exactly: a
number needs `priceDisplay()`, never a raw value, and an arancel older than 12
months carries the visible "dato desactualizado" note rather than being hidden
(CLAUDE.md rule 3). Each detail page's `generateMetadata` points
`openGraph.images` and `twitter.images` (`card: 'summary_large_image'`) at its
route.

**On stale prices and `Offer` (changed in PR-33).** The page now _shows_ an arancel older than 12 months, with a visible "dato desactualizado" and its date — but `Offer` markup still requires a price verified within 12 months. The two rules only look inconsistent: a warning is a thing a human reads and a rich result is a thing a machine repeats stripped of its context, so a price we are hedging on the page must not be handed to Google as a clean current offer. Schema mirrors what is _asserted_, not merely what is drawn.

## 6. Technical baseline

- `sitemap.ts` producing a **sitemap index** split at 5,000 URLs (careers, institutions, programs, editorial as separate children). ~10k program URLs makes this mandatory, not optional.
- `robots.ts`: allow everything public, disallow `/panel`, `/admin`, `/api`, `/comparar`; link the sitemap index.
- Self-referencing canonical on every indexable page; filtered URLs canonical to the clean route.
- Slugs: lowercase ASCII, hyphens, no accents or ñ — `ingenieria-informatica`, `asuncion`.
- Trailing slash off, consistently.
- `next/image` everywhere, hero not lazy-loaded, explicit dimensions, WebP.
- Static generation for all hubs and detail pages; no client-side fetching of SEO-critical content.

## 7. Internal linking

- Program page → its career hub, its institution, its area, 3 related programs (same career, different institution — the highest-value link on the page).
- Career hub → top 10 programs, related careers in the same area, the accreditation explainer.
- Institution page → all its programs, its city page where one exists.
- Every blog post → at least one money page with descriptive anchor text. No orphans.
- Footer: areas + top careers in plain text on every page.

## 8. Content priorities (first 90 days after launch)

1. **The accreditation hub** — `/acreditacion`: what ANEAES accreditation means, what CONES habilitación means, what happens to a título from an unaccredited program, how to check yours. This is a live national story with almost no good online coverage. It is the most linkable asset we can build.
2. **`[universidad] + aranceles` pages** — high intent, low competition, exactly what our data is for.
3. **"Carreras acreditadas por ANEAES 2026"** — a maintained, dated list. Recurring traffic, natural backlinks.
4. **Career hub intro copy** — 150+ genuinely unique words each, prioritised by search volume.

Not a priority: generic "las 10 carreras con más futuro" listicles. High volume, zero differentiation, and the incumbent already ranks for them.
