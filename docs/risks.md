# Problems, Risks & Mitigations

Ordered by how much damage they can do. Each has an owner phase — the mitigation must land no later than that phase.

---

## R-01 — The antagning.se model does not exist in Paraguay
**Severity: High · Mitigate: before any code (done — `plan.md` §1)**

antagning.se has captive traffic because Sweden mandates a single central admission system. Paraguay has none: every faculty runs its own convocatoria and examen de ingreso. A private site cannot become the application layer, and building UI that implies it can ("Postulate", "Mis solicitudes") would be misleading.

**Mitigation:** position as comparison/discovery (studentum.se model, not antagning.se). All traffic must be *earned* through SEO and WhatsApp sharing. Every "apply" affordance is an outbound link or a lead form to the institution — never a simulated application.

---

## R-02 — There is already an incumbent
**Severity: High · Mitigate: Phase 1**

`universidades.com.py` is part of a regional education-portal network with years of domain authority, a content team, and an established lead-gen business. We will not out-rank it on head terms like "carreras en Paraguay" for a long time.

**Mitigation — compete where they are weak, not where they are strong:**
1. **Accreditation status as a filter.** Nobody offers it. It is the #1 anxiety in Paraguayan higher education right now (~82% of programs unaccredited per July 2026 press coverage; MEC mandating accreditation from 2026).
2. **Real aranceles.** Network portals rarely carry local pricing.
3. **The comparador.** Regional portals are article-and-lead-form shaped, not comparison-tool shaped.
4. **Long-tail first.** Target `medicina + [ciudad]`, `[universidad] + aranceles`, `carreras acreditadas ANEAES` before head terms.
5. **A local domain and a local voice** (voseo, guaraníes, WhatsApp) against a templated regional network.

---

## R-03 — Arancel data doesn't exist and decays
**Severity: High · Mitigate: Phase 1, forever**

The single most valuable field is the one with no dataset behind it. Prices change annually, are quoted as matrícula + N cuotas, and are sometimes only available by phone.

**Mitigation:** collect manually for the top ~600–900 offerings (covers most search demand); store source + `verified_at` on every price; **hide prices older than 12 months** rather than showing them; make "Solicitar info" the fallback; normalize to an annual cost so comparison is honest. Full playbook in `data-sources.md` §5.

**Second-order risk:** publishing a wrong arancel damages trust with both students and the institution. The hiding rule is the mitigation — an honest gap beats a wrong number.

---

## R-04 — Two-sided cold start
**Severity: High · Mitigate: Phase 0–3 sequencing**

No traffic → institutions won't pay → no verified data → weak product → no traffic.

**Mitigation:** break the loop on the supply side using **public data**. We can build a complete index from CONES/ANEAES without asking a single institution for permission. Traffic then comes from SEO on that index, and institutions are approached only once we can show them their own numbers ("tuviste 1.240 vistas y 87 clics a WhatsApp"). That is why `events` exists in the schema from day one — the sales pitch is a report, not a promise.

---

## R-05 — Entity matching across sources
**Severity: Medium · Mitigate: Phase 0 (PR-06)**

CONES and ANEAES name the same institution differently and share no stable key. Naive importing creates duplicate institutions, which corrupts every count on the site.

**Mitigation:** normalized `match_key` + alias table + human-reviewed fuzzy proposals; nothing auto-applies on a conflict. See `data-sources.md` §4. Expect ~60–70% auto-match initially and accept that.

---

## R-06 — Lead capture from minors, under an incomplete data-protection regime
**Severity: Medium-High (legal) · Mitigate: Phase 1 (PR-15, PR-16)**

Much of the audience is 16–18. Paraguay has no comprehensive general data-protection law in force — Ley 1682/01 (modified by 1969/02) governs "información de carácter privado", and Ley 6534/2020 is **credit-data specific**, though its standard is instructive: processing data of under-16s requires the consent of the parent/guardian; for 16–17-year-olds, sensitive data requires the adolescent's express consent *plus* guardian authorisation. A general LPDP has been under legislative discussion.

**Mitigation — build to a GDPR-lite standard now, it costs almost nothing:**
- Consent checkbox **unchecked by default**, with plain-Spanish text naming who receives the data ("tus datos serán enviados a {institución} para que te contacten").
- Store `consent_text_version` + `consent_at`. Never rely on "they used the site".
- Collect the **minimum**: nombre, teléfono. Email and mensaje optional. No birthdate, no ID number, no address, no sensitive categories — ever.
- An `age_bracket` self-declaration; if `menor_18`, the consent text explicitly mentions parent/guardian awareness.
- A real `/legal/privacidad` page with contact, purpose, recipients, retention (24 months) and a working deletion request path.
- Institutions receive leads under a written commitment not to resell them. Put it in the plan terms.
- Never sell or share lead data with anyone other than the institution the lead chose.

---

## R-07 — The domain looks official
**Severity: Medium (legal/reputational) · Mitigate: Phase 1 (PR-11)**

`educacion.com.py` plus a serious institutional design (Dirección 1 is deliberately government-adjacent) plus republished official register data can read as a state portal. MEC/CONES could reasonably object, and users could be misled.

**Mitigation:** persistent footer disclaimer on every page — *"educacion.com.py es un sitio privado e independiente. No es un portal oficial del MEC, CONES ni ANEAES."* A `/legal/fuentes` page listing every data source with links. No official crests, seals or `.gov.py` visual cues. Consider a courtesy introduction letter to CONES/ANEAES before launch — being known and transparent is much cheaper than being discovered.

---

## R-08 — Hostinger git deploys wipe uploaded files
**Severity: Medium (technical, easy to get wrong) · Mitigate: Phase 2 (PR-19)**

Institution logos and photos uploaded through `/panel` will be written to disk. Hostinger's git-based deploy replaces the application directory — **anything written inside the app dir disappears on the next deploy**, silently, and only becomes visible when a user notices broken images.

**Mitigation (pick one, decide in PR-19):**
- **Preferred:** object storage — Cloudflare R2 or Bunny Storage. Cheap, CDN-fronted, survives everything, and takes image bytes off the app server.
- **Alternative:** write to a persistent path *outside* the deploy directory (e.g. `~/uploads`) and serve via a route handler. Works, but couples you to the box and complicates local dev.

Never store uploads in `public/`.

---

## R-09 — Publishing a wrong accreditation status
**Severity: Medium-High · Mitigate: Phase 0 schema (PR-02) + Phase 1 UI (PR-09)**

Accreditation is our differentiator, which means it is also our largest liability. Telling students a real program is "no acreditada" is defamatory-adjacent and would end the institutional relationships the business depends on.

**Mitigation:**
- Default unknown state is **`sin_datos`** ("Sin datos de acreditación"), **never** "no acreditada". We only assert positives we can cite.
- Every non-`sin_datos` status requires a `source_url` or `resolution_number` — enforced by a check in code and a unit test.
- Badge UI always shows agency + resolution + date and links to the source.
- Institutions can dispute via `/panel`; a dispute flips the badge to "en revisión" within one business day.
- Import conflicts on accreditation **never auto-apply**.

---

## R-10 — Faceted search performance on shared MySQL
**Severity: Low-Medium · Mitigate: Phase 0 (PR-07)**

Eight facet groups with live counts, combinable, sortable, over ~10k rows, on a shared-hosting MySQL with a small connection limit.

**Mitigation:** denormalized `program_search` table, no joins at query time, one aggregate per facet group, correct composite indexes, `connectionLimit: 8`. If it ever gets tight, the whole table fits in ~4 MB of process memory and can be filtered in JS — keep `searchPrograms()` as the single interface so that swap is one file. See `architecture.md` §4.

---

## R-11 — "Jobs / salida laboral" has no citable Paraguayan data
**Severity: Medium · Mitigate: Phase 4 (PR-32) — or don't ship it**

You want to compare "utbildningar och jobb". The comparison dimension students most want is *salary and employability by degree*. **Paraguay has no reliable public dataset for this.** Every competitor that shows such numbers is either citing a foreign source or inventing them.

Inventing them would violate the anti-fabrication rule that the rest of the product depends on, and it is the fastest way to lose the credibility the accreditation hub is built on.

**Mitigation — ship the honest version:**
- **Do ship:** "Empleos relacionados" — real, dated job postings matched to the career (scraped from public job boards with attribution, or a small integration). Real postings are verifiable and genuinely useful.
- **Do ship:** qualitative `salida_laboral_md` per canonical career — *where* graduates work, editorially written, no numbers.
- **Do not ship** average salaries, employment rates or "carreras mejor pagadas" rankings until there is a citable source (DGEEC/INE encuesta de empleo, IPS data, or a survey we run ourselves and publish the methodology for).
- If you later run your own graduate survey, that becomes a genuine proprietary asset — and a press story.

---

## R-12 — Seasonality
**Severity: Medium · Mitigate: Phase 1 planning**

Traffic peaks Oct–Feb (academic year starts Feb/March, second intake ~July). Sales budgets are set Aug–Oct. A launch in March means waiting nine months to matter.

**Mitigation:** target public launch by early October. If it slips, launch anyway to accrue index age, but move monetization to the following cycle and use the off-season for data collection — the highest-leverage off-season work. Align contracts Nov–Oct, not Jan–Dec.

---

## R-13 — Single-operator key-person risk
**Severity: Medium · Mitigate: continuously**

One person, part-time, with agents. The failure mode is a half-built Phase 2 that nobody can pick up.

**Mitigation:** every phase ends deployed and useful on its own (see `plan.md` §4). `CLAUDE.md` + these docs are the handoff artefact. No PR merges without its acceptance criteria met — a half-merged feature behind no flag is the thing that stalls projects.

---

## R-14 — Institutions demanding data removal or edits we disagree with
**Severity: Low-Medium · Mitigate: Phase 2**

A university will eventually ask to hide a program, change an accreditation status, or be delisted entirely.

**Mitigation:** documented policy — factual register data (existence, habilitación, accreditation as published by ANEAES/CONES) stays, with a right of reply displayed on the profile. Institution-supplied content (descriptions, photos, aranceles) is theirs to remove at will. Delisting entirely is refused politely with the source citation; nobody escalates a public register. Never argue over a logo — remove it on request.

---

## R-15 — Scope creep into a CMS / job board / LMS
**Severity: Medium · Mitigate: continuously**

Becas, blog, empleos, cursos, colegios, comparador de universidades regionales — all reasonable, all tempting, each one a quarter of work.

**Mitigation:** Phase 4 exists precisely to hold these. Nothing from Phase 4 starts before Phase 3 has one paying customer. If a Phase-4 idea seems urgent, it is almost always a marketing problem wearing a feature costume.
