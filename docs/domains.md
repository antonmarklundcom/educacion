# Domains — one canonical host, the others redirect

**Decided 2026-09-11 (`docs/review-2026-09.md` §5). Do not re-litigate in a build session.**

## 1. The decision

| Domain | Owned | Role |
| --- | --- | --- |
| `educacion.com.py` | yes | **The site.** Canonical host for every URL, the only value `NEXT_PUBLIC_SITE_URL` ever takes. |
| `universidad.com.py` | yes | 301 → `https://educacion.com.py/universidades` (root) and `https://educacion.com.py/<path>` (any path). Never serves content. |
| `*.hostingersite.com` preview | n/a | 301 → canonical, and `robots` disallow-all if reached. |
| `colegio.com.py`, `escuelas.com.py` | no | Not bought for a product. At most one as a cheap defensive redirect. |

Two rules the app enforces (PR-60), so the decision does not depend on hosting-panel
discipline:

1. A request whose `Host` is not the canonical host gets a `301` to the same path on the
   canonical host. `www.` counts as non-canonical. Health checks and `/api/cron/*` are exempt
   so the scheduler is never redirected.
2. `robots.txt` on a non-canonical host is `User-agent: *` / `Disallow: /`.

## 2. Why not two sites, and why not a rebrand

- **The traffic model is the long tail** (`seo.md` §1): `[carrera] + [ciudad]`,
  `[universidad] + aranceles`. Exact-match head words on a domain do not move that; splitting
  the same pages across two hosts halves the authority each accumulates and creates
  duplicate content that has to be canonicalised back to one of them anyway.
- **`educacion` is the umbrella.** A colegios section, becas, a vocational quiz all sit under
  it. `universidad.com.py` could not hold `/colegios` without being wrong in its own name.
- **A rebrand now costs 47 files, every doc, and the OG origin, for a 4,400-volume word.**
  Keyword Planner's "universidad" (+86 % 3-month) is seasonal — August is the second intake
  — not a trend the brand should chase.
- **Two Hostinger apps would double** env vars, cron registration, Sentry projects, Search
  Console properties and the cookie domain problem, for a dataset that fits one MySQL.
- `risks.md` §R-07 (the domain looks official) is already handled by the disclaimer and does
  not get better on `universidad.com.py`.

## 3. Phase 10, unscheduled: colegios

The K-12 market is the one part of the multi-domain idea that is a real product, not a
redirect. Parents search "colegios en Asunción", "colegio privado cuota", "escuelas
bilingües". The sellable universe — private colegios — is an order of magnitude larger than
the ~70–100 institutions `monetization.md` §2 counts, with the same buyer motive (enrolment)
and the same seasonality.

**Shape, if activated:** `/colegios`, `/colegios/[ciudad]`, `/colegios/[slug]` on
`educacion.com.py`. Same object model — institution → offering (nivel: inicial / EEB / media,
turno, idioma) → price (cuota, matrícula) → comparador — with `institutions.type` gaining
`colegio` and a `colegio_details` 1:1 table. Data source: MEC's open register of
instituciones educativas (codes, names, department, district, gestión), not CONES/ANEAES;
prices are fieldwork exactly like aranceles. No accreditation axis; the wedge there is
price transparency plus MEC registration status.

**Activation trigger:** the first paying university plan (`risks.md` §R-15), the October–
February peak passed with the university index live and indexed, and a second data assistant
budget. Not before. Nothing is prepared in code ahead of activation; this section is the
preparation.

## 4. Multi-host routing in one app — kept as a design, not built

If a section ever needs its own brand on its own domain (the colegios section on
`colegio.com.py` is the only plausible case), the app can serve several hosts without a second
deployment:

- `src/middleware.ts` maps `Host` → section: `colegio.com.py/*` rewrites to `/colegios/*`
  internally; `educacion.com.py/colegios/*` 301s to `colegio.com.py/*` so each URL has one host.
- `siteUrl()` takes the host from the request (`headers()`), not from one env var; canonical,
  OG image origin and sitemap index are per host; each host gets its own `/sitemap.xml`
  listing only its own families.
- Sessions: the `iron-session` cookie is host-scoped by default, which is correct — staff
  log in on the canonical host only; `/admin` and `/panel` 301 to it from any other host.
- JSON-LD `Organization` per host, `WebSite` + `SearchAction` per host homepage.
- Search Console property, Sentry environment tag and Plausible/GA property per host.

Two things must be true before this is built: (a) Hostinger's managed Node.js app can have a
second domain mapped to the same app (unverified from a build machine; a human-inputs item),
and (b) the section has content that is *not* a slice of the university index — otherwise it
is a mirror and §2 applies.
