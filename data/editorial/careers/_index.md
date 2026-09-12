# Career hub editorial copy — index

## Where this list came from

`DATABASE_URL` was **not set** in this session and no database was reachable, so this list is
**not** the 40 careers with the most published offerings — that ranking needs a live
`program_search` count per career (`src/db/queries/careers.ts` → `getCareerStats`), which does
not exist without a database.

The prompt's documented fallback for this case is to derive the list from the CONES fixture
rows in the repo. That fallback does not literally apply here: every CONES/ANEAES fixture in
this codebase (`src/lib/curate/__fixtures__/snapshot.ts`,
`src/lib/ingest/__fixtures__/documents.ts`, `src/lib/search/__fixtures__/synthetic.ts`) uses
placeholder names on purpose — `INSTITUCION DE PRUEBA A`, `Carrera de Prueba Uno` — precisely so
a fixture can never be copied into a seed script as if it were real data
(`docs/data-sources.md` §"Fixtures contain no real data"). There is no fixture, and no other
file in this repo, that contains real Paraguayan career names or real offering counts.

**What was actually done:** the 40 slugs below are a hand-compiled list of standard,
widely-recognized career/degree names in Paraguay's higher-education system — the kind of
generic profession names ("Medicina", "Derecho", "Enfermería") that are common knowledge, not a
fact about any specific institution, count, or ranking. They are **not** claimed to be the 40
with the most offerings, and the files make no claim about offering volume, ranking, or
popularity for any of them.

**Ordering criterion, stated:** the careers are distributed across the fourteen areas already
seeded in this repo's real taxonomy (`AREAS` in `scripts/seed-taxonomy.ts`), roughly
proportional to how many distinct career names are commonly recognized within each area, then
listed alphabetically by career name overall. This is an editorial/coverage criterion — one to a
few careers per real area — not a popularity or offering-count criterion, and no count of any
kind appears in any file.

## What must happen before this is treated as final

Before merge or at the latest before the next content pass, someone with `DATABASE_URL` set
should:

1. Run a query against `program_search` (through `src/db/queries/careers.ts`, never raw SQL —
   `CLAUDE.md` rule 5) to get the actual 40 careers with the most published offerings.
2. Diff that real list against the 40 slugs below.
3. For every slug in the real list but not here: add a markdown file (same rules, same scan).
4. For every slug here but not in the real list: keep the file (the copy is still accurate and
   not fabricated — it just was not, and may still not be, one of the top 40 by volume) or drop
   it, at the reviewer's discretion. Nothing about a career being off this ranking makes its
   description wrong.

`npm run seed:editorial` seeds `careers.description_md` by slug match — a slug with no matching
`careers` row (because the career isn't in the taxonomy yet, or the seed hasn't run) is skipped
and logged, never an error, and never invented.

## The 40 slugs

| # | Slug | Area (taxonomy) |
| - | ---- | ---------------- |
| 1 | `administracion-de-empresas` | Ciencias Empresariales |
| 2 | `analisis-de-sistemas` | Ingeniería y Tecnología |
| 3 | `arquitectura` | Arquitectura y Construcción |
| 4 | `biologia` | Ciencias Exactas y Naturales |
| 5 | `ciencias-de-la-comunicacion` | Comunicación |
| 6 | `ciencias-de-la-educacion` | Educación |
| 7 | `comercio-internacional` | Ciencias Empresariales |
| 8 | `construcciones` | Arquitectura y Construcción |
| 9 | `contaduria-publica` | Ciencias Empresariales |
| 10 | `derecho` | Derecho y Ciencias Jurídicas |
| 11 | `diseno-de-interiores` | Arte y Diseño |
| 12 | `diseno-grafico` | Arte y Diseño |
| 13 | `economia` | Ciencias Empresariales |
| 14 | `educacion-escolar-basica` | Educación |
| 15 | `educacion-fisica` | Deportes |
| 16 | `educacion-inicial` | Educación |
| 17 | `enfermeria` | Salud |
| 18 | `farmacia` | Salud |
| 19 | `filosofia` | Humanidades |
| 20 | `hoteleria-y-gastronomia` | Turismo y Hotelería |
| 21 | `ingenieria-agronomica` | Ciencias Agrarias y Veterinarias |
| 22 | `ingenieria-civil` | Ingeniería y Tecnología |
| 23 | `ingenieria-electromecanica` | Ingeniería y Tecnología |
| 24 | `ingenieria-en-sistemas` | Ingeniería y Tecnología |
| 25 | `ingenieria-industrial` | Ingeniería y Tecnología |
| 26 | `ingenieria-informatica` | Ingeniería y Tecnología |
| 27 | `kinesiologia-y-fisioterapia` | Salud |
| 28 | `letras` | Humanidades |
| 29 | `marketing` | Ciencias Empresariales |
| 30 | `medicina` | Salud |
| 31 | `medicina-veterinaria` | Ciencias Agrarias y Veterinarias |
| 32 | `notariado` | Derecho y Ciencias Jurídicas |
| 33 | `nutricion` | Salud |
| 34 | `odontologia` | Salud |
| 35 | `periodismo` | Comunicación |
| 36 | `psicologia` | Ciencias Sociales |
| 37 | `quimica` | Ciencias Exactas y Naturales |
| 38 | `sociologia` | Ciencias Sociales |
| 39 | `trabajo-social` | Ciencias Sociales |
| 40 | `turismo` | Turismo y Hotelería |

Every slug has a matching `data/editorial/careers/<slug>.md` file, 180–260 words, scanned by
`src/lib/careers/editorial-copy.test.ts` for digits, spelled-out numbers, institution names,
accreditation-status claims and ranking words.
