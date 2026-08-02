# educacion.com.py — Master Plan

**Product:** the complete, searchable, comparable index of every higher-education program in Paraguay.
**Domain:** educacion.com.py
**Stack:** Next.js 15 (App Router, TS) + Drizzle + MySQL on Hostinger managed Node.js
**Language of the product:** Paraguayan Spanish (voseo). Language of the repo/docs: English.

> Companion docs: [`docs/architecture.md`](docs/architecture.md) · [`docs/data-model.md`](docs/data-model.md) · [`docs/data-sources.md`](docs/data-sources.md) · [`docs/monetization.md`](docs/monetization.md) · [`docs/seo.md`](docs/seo.md) · [`docs/design-system.md`](docs/design-system.md) · [`docs/risks.md`](docs/risks.md) · [`docs/pr-plan.md`](docs/pr-plan.md) · [`docs/agent-workflow.md`](docs/agent-workflow.md) · [`docs/deployment.md`](docs/deployment.md)

---

## 1. What we are actually building (and what we are not)

The brief was "antagning.se but for Paraguay". That mental model has to be corrected before a line of code is written, because it drives the whole architecture:

**antagning.se is a government application monopoly.** It exists because Sweden has one central admission system (UHR). You log in with BankID, you rank your choices, the state runs the selection. Its traffic is captive — students *must* go there.

**Paraguay has no central admission.** Every faculty runs its own convocatoria, its own examen de ingreso / curso probatorio de ingreso (CPI/CBA), its own calendar. There is no national ranking, no national selection algorithm, and no legal path for a private site to become one.

So the honest positioning is:

> **educacion.com.py is the comparison and discovery layer that Paraguay's higher-education system does not have.**
> Closer to `studentum.se` / `utbildning.se` than to `antagning.se`.

That is not a downgrade. Sweden's *comparison* sites are commercial businesses; antagning.se is a cost centre. The comparison layer is the part that can actually be monetized.

**What we build:** exhaustive index of institutions → programs → offerings, with real filters (gestión, nivel, modalidad, ciudad, arancel, acreditación, estado de inscripción), a side-by-side comparador, per-institution admission calendars, and a lead channel to the institutions.

**What we do not build:** an application system, a central exam, or anything that implies state affiliation. See [`docs/risks.md`](docs/risks.md) §R-07 — the domain name `educacion.com.py` looks official enough that a visible "sitio privado e independiente" disclaimer is mandatory from day one.

---

## 2. The wedge: accreditation

Paraguay's higher-education sector is in an accreditation crisis *right now*, and no existing portal surfaces it:

- ANEAES reported (July 2026) **~2,565 accredited and active grade programs**, while stating the system "habilita mucho más de lo que evalúa".
- Press coverage (ABC Color, July 2026) put **~82% of programs as not accredited**, with the concrete consequence that titles may not be registrable.
- MEC has ruled that **all programs must begin accreditation from 2026**.

A 17-year-old choosing a career, and their parents paying for it, now have one question nobody answers well online: *"¿Mi título va a valer?"*

Therefore: **accreditation status is a first-class field, a first-class filter, and a first-class content hub** — not a badge we bolt on later. It is the single feature that makes us more useful than the incumbent (`universidades.com.py`, a regional lead-gen network with far more domain authority than we will have for two years).

**Hard rule:** every accreditation badge on the site must carry a source (agency, resolution number, date) and link to it. We never assert an accreditation status we cannot cite. See [`docs/risks.md`](docs/risks.md) §R-09.

---

## 3. Design: merge the two mockups, don't choose between them

The two directions you built are not competing designs — they are two views of the same dataset, and both should ship.

| Mockup | Role in the product |
|---|---|
| **Dirección 1 — "Antagning fiel"** | The default **browse/discovery** view. Filter rail + rich result cards. Good for "no sé qué quiero estudiar todavía". |
| **Dirección 4 — "Comparador"** | The **decision** view. Dense table, sortable columns, checkbox multi-select, sticky compare bar. Good for "ya tengo 5 opciones, ¿cuál?". |

Ship them as a **view toggle on the same route** (`/carreras?vista=tarjetas|tabla`), sharing one filter state, one URL, one query. The comparador selection persists across both views. Full spec in [`docs/design-system.md`](docs/design-system.md).

Visual system: one accent (`#0d6e86`, taken from your Dirección 1), navy/slate text, white surfaces, IBM Plex Sans + IBM Plex Mono for numeric columns. Per `conversion-design`, the accent appears **only** on primary CTAs.

---

## 4. Phases

Each phase is independently shippable and produces something real. Do not start phase N+1 before phase N is deployed and verified live.

### Phase 0 — Foundation (PR 01–07)
Repo scaffold, DB schema, design system, app shell, data import pipeline, search index.
**Exit:** `npm run build` clean, DB seeded with real CONES + ANEAES data, a rebuild script that is safe to re-run.

### Phase 1 — Public MVP (PR 08–17)
The two views, program/institution/career pages, comparador, lead capture, SEO pack, legal pages, analytics.
**Exit:** live on educacion.com.py, indexable, every program in the country findable, "Solicitar info" produces a real lead in the DB.

### Phase 2 — Backend & institution portal (PR 18–24)
Auth, admin CRUD, moderation queue, institution panel, claim flow, lead inbox.
**Exit:** an institution can claim its profile, correct its own data, and receive leads without you touching the DB.

### Phase 3 — Monetization (PR 25–29)
Plans, entitlements, sales page, billing ops, verified/destacado presentation, institution analytics.
**Exit:** first paid institution invoiced and live.

### Phase 4 — Depth & growth (PR 30–34)
Editorial + accreditation hub, becas, salida laboral, data-freshness system, performance/a11y pass.
**Exit:** organic traffic compounding, data provably fresh.

**Realistic calendar** (part-time, agent-assisted): Phase 0 ≈ 1–2 weeks, Phase 1 ≈ 3–5 weeks, Phase 2 ≈ 3–4 weeks, Phase 3 ≈ 2–3 weeks, Phase 4 ongoing. The bottleneck is **not** the code — see §6.

---

## 5. Timing (this matters more than it looks)

The Paraguayan academic year starts in **February/March**, with a second intake around **July/August**. Search traffic for "carreras", "inscripciones", "examen de ingreso" peaks **October–February**.

- Public MVP must be live and indexed by **early October** to catch the main season.
- Institutional sales conversations happen **August–October**, when marketing budgets for the admission campaign are set. Selling in March is selling to an empty budget.

If the build slips past November, do not rush a bad launch into the peak — launch anyway to start accruing index age, but plan monetization for the *following* cycle.

---

## 6. The real bottleneck is data, not code

Say this out loud before estimating anything: **this project is a data-operations business with a website attached.**

Writing the Next.js app is the easy, cheap, agent-automatable part. The hard, expensive, human part is:

- Reconciling CONES habilitación records (PDF resolutions, inconsistent institution names) with ANEAES accreditation records (separate dataset, separate naming) into one canonical program list.
- Getting **aranceles**. Paraguayan universities do not publish clean pricing. It's matrícula + N cuotas + derecho de examen, changes yearly, sometimes only given by WhatsApp. There is no dataset. This must be collected by a human, per institution, and re-verified annually.
- Keeping convocatorias current every semester.

**Budget for a part-time Paraguayan data assistant** (relevamiento + verification) from Phase 1. This is the actual cost centre. A beautiful site over stale data is worthless; an ugly site over the only accurate dataset in the country wins.

---

## 7. Monetization: short answer

Your instinct of **~USD 50 per program per year is roughly the right price level and the wrong unit of sale.**

- Selling per program forces a line-item negotiation with a marketing director who wants to sign one contract, and invites them to drop their weakest programs — exactly the ones we most need listed.
- USD 50 ACV cannot fund a sales motion that requires in-person visits and WhatsApp follow-up in Asunción.
- If only paid programs are listed, we stop being a directory, our SEO collapses, and the comparador becomes an ad board.

**Instead:** everything is listed for free from public data. Sell an institution-level annual plan priced in program bands, which lands at an effective **USD 20–60 per program per year** — your number, one signature.

Full model, pricing table, revenue projections and the honest downside case in [`docs/monetization.md`](docs/monetization.md).

---

## 8. Problems found (summary)

Full analysis with mitigations in [`docs/risks.md`](docs/risks.md). The ones that can kill the project:

| # | Problem | Severity |
|---|---|---|
| R-01 | "antagning.se model" doesn't exist in Paraguay — no captive traffic, no application flow | **High** — addressed by repositioning (§1) |
| R-02 | `universidades.com.py` already owns the "guía de carreras" SEO space with network domain authority | **High** — accreditation + arancel + comparador is the wedge |
| R-03 | Arancel data doesn't exist in public form and decays yearly | **High** — the core moat *and* the core cost |
| R-04 | Two-sided cold start: no traffic → no payers → no verified data | **High** — free-listing-first sequencing |
| R-05 | Institution-name matching across CONES/ANEAES sources is genuinely hard | Medium |
| R-06 | Lead capture from minors under an incomplete Paraguayan data-protection regime | Medium-**High** (legal) |
| R-07 | Domain looks official; risk of implied MEC/CONES affiliation | Medium (legal) |
| R-08 | Hostinger git deploys wipe non-repo files → uploaded logos disappear | Medium (technical, easy to get wrong) |
| R-09 | Publishing a wrong accreditation status is reputationally and legally dangerous | Medium-High |
| R-10 | Faceted search + counts over ~10k rows on shared MySQL | Low-Medium (solvable, see architecture) |
| R-11 | "Salida laboral / jobs" comparison has **no reliable Paraguayan salary dataset** | Medium — must not be faked |
| R-12 | Seasonality of both traffic and sales | Medium |

---

## 9. Model split (Opus 5 vs Sonnet 5)

Your instinct — Sonnet does ~80%, Opus does the hard parts — is right. The split is not "hard code vs easy code", it's **"expensive to change vs cheap to change"**.

**Opus 5 owns:** the DB schema, the source-reconciliation/matching pipeline, the search & facet layer, comparador state design, anything touching PII/auth/permissions/entitlements, billing, and the final review of every Sonnet PR that touches money, data integrity, or access control.

**Sonnet 5 owns:** all page/component implementation, admin CRUD screens, content pages, metadata/schema wiring, tests, refactors — i.e. everything downstream of a decided interface.

Per-PR ownership is assigned in [`docs/pr-plan.md`](docs/pr-plan.md); prompt templates and handoff rules in [`docs/agent-workflow.md`](docs/agent-workflow.md).

---

## 10. Pull requests

**34 PRs across 5 phases.** Complete enumerated list with scope, owner model, dependencies and acceptance criteria: [`docs/pr-plan.md`](docs/pr-plan.md).

Sizing principle: one PR = one reviewable concern = deployable on its own. If a PR needs a paragraph to explain why it contains two things, split it.
