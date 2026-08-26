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
| `/carreras/[carrera]?...filters`  | filtered combinations                           | ❌ `noindex,follow`, canonical → the hub      |
| `/carreras/[carrera]/[ciudad]`    | "medicina en encarnación"                       | ✅ **only above the supply gate (§4)**       |
| `/areas/[area]`                   | "carreras de salud en paraguay"                 | ✅                                           |
| `/universidades`                  | "universidades de paraguay"                     | ✅                                           |
| `/universidades/[inst]`           | "universidad católica carreras"                 | ✅                                           |
| `/universidades/[inst]?...filters`| filtered combinations                           | ❌ `noindex,follow`, canonical → the profile  |
| `/universidades/[inst]/[program]` | "medicina una arancel" — the lead page          | ✅                                           |
| `/acreditacion` + children        | **"carreras acreditadas aneaes"** — the wedge   | ✅                                           |
| `/acreditacion?q=`                | one checker answer, shareable                   | ❌ `noindex,follow`, canonical → `/acreditacion` |
| `/becas`, `/becas/[slug]`         | "becas para estudiar en paraguay"               | ✅                                           |
| `/becas?...filters`               | filtered combinations                           | ❌ `noindex,follow`, canonical → `/becas`     |
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

**Shipped in PR-41** (`src/lib/seo/catalog-schema.ts`, unit-tested; `jsonld.tsx` keeps the
`<JsonLd>` primitive and PR-30's editorial types):

- `Course` + one `CourseInstance` per offering on programme pages, with `courseMode` and an
  ISO 8601 `timeRequired`; `ItemList` + `BreadcrumbList` on career hubs.
- **The organisation type follows the institution type**, on the profile block and on a
  `Course`'s `provider` alike: `universidad` → `CollegeOrUniversity`, everything else
  (`instituto_superior`, `instituto_tecnico`, `ifd`, `otro`) → `EducationalOrganization`.
  The parenthetical in the table above is a rule, not a note — typing an instituto técnico
  as a university is a status claim we invented, and the page contradicts it by printing the
  real type.
- **Course-level `timeRequired` and `educationalCredentialAwarded` ship only where every
  offering agrees.** They are per-offering columns and genuinely differ — a distancia sede
  is commonly longer — so a value read off the first row would contradict the instances
  beside it.
- **The filtered-view rule is one rule, and it applies to every surface that
  renders a filter rail or a search box** — not only `/carreras`. PR-09 implemented
  it there and PR-56 found it had never been carried to the career hubs, the
  institution profiles, `/acreditacion`'s checker answers or `/becas`. Each of those
  shipped a bare self-canonical and an unconditional `index`, so every filter
  combination was an indexable near-duplicate that also claimed to *be* the page it
  was a slice of. Page number and sort order are deliberately **not** part of the
  predicate: `/carreras` has never counted them either, and one rule stated the same
  way everywhere is worth more than a stricter one stated twice.
- **The career hub's `ItemList` ships only from the canonical view**: page 1, no active
  filters, no `q`, default sort, non-empty. Anywhere else it would describe a slice —
  positions restarting at 1, `numberOfItems` counting one page — while the canonical points
  at a different list. Note `countActiveFilters()` counts neither `q` nor `sort`, so both
  are checked separately. `BreadcrumbList` has no such restriction.
- **No `Course.description`.** Google wants one for the Course rich result, and there is no
  programme description rendered on the page to mirror. Writing one would be rule 1; the
  block ships structural until real copy exists.
- `WebSite` + `SearchAction` + `Organization` are emitted on **`/` only**, not from the
  layout. Google reads the sitelinks searchbox only from a site's homepage, and the public
  layout also wraps `/comparar`, which is `noindex` and must therefore carry no schema at
  all. "All pages" in the table above is the intent; the homepage is where it is read.
- **A page that renders `noindex` emits no JSON-LD.** The career hub reads the same
  conditions its `generateMetadata` reads — `hasEditorialCopy()` **and**, since PR-56,
  `hasActiveFilters()` — so the two can never disagree. `/acreditacion` and `/becas`
  now withhold their whole JSON-LD block on a filtered view for the same reason;
  before PR-56, `/becas` emitted an `ItemList` describing a filtered slice while
  canonicalising to the full list, which is the exact defect PR-41's second review
  pass closed on the career hubs and nobody carried across.
- **`Offer` is stricter than the page, deliberately.** CLAUDE.md rule 3 shows a stale
  arancel *with* a visible "dato desactualizado" warning; `Offer` has no field for that
  warning, so a rich result would reprint the number stripped of the context that makes
  showing it honest. An `Offer` is therefore emitted only for a price `priceFreshness()`
  calls `fresh`. Two further withholdings, both about mirroring the page rather than about
  age: an `Offer` needs **a recurring fee and an installment count**, because
  `computeAnnualCost()` returns the bare matrícula for a matrícula-only row (the
  `annual_cost` generated column carries the same CASE) and publishing that as an annual
  arancel would label an enrolment fee as a year of tuition; and it needs **a currency**,
  because `priceDisplay()` treats a missing one as the honest gap and renders no number at
  all. A stale "gratuita" is withheld on the freshness rule — an old free claim is as wrong
  as an old number. `priceFreshness()` is imported from `src/db/invariants.ts`, never
  re-implemented.

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

- A **sitemap index** at `/sitemap.xml` split at 5,000 URLs, with `/sitemap/<familia>.xml` children — `paginas`, `carreras` (hub + `empleos`), `areas`, `ciudades`, `universidades`, `programas`, `editorial`. ~10k program URLs makes this mandatory, not optional. Shipped in PR-40 as route handlers rather than Next's `sitemap.ts` convention: `generateSitemaps()` is enumerated at build time and CI builds without a `DATABASE_URL` (`architecture.md` §3), so generation stays per-request. A family only gains a `-N` suffix once it actually splits, and a family with no URLs produces no child at all. `lastmod` is a real row timestamp everywhere it exists, and is omitted rather than invented for the static routes.
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
