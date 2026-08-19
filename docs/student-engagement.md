# Student engagement — designed, not scheduled

**Status: specified and agreed (2026-08-19), deliberately not scheduled.** Nothing in this
document is being built yet. It exists so that when usage justifies it, the build can start
from decided interfaces instead of a new planning round — and so nobody "prepares" for it
prematurely: the audit that produced this spec confirmed **no code preparation is needed**.
Auth, sessions, transactional email, the comparador's selection state and the admissions
data model all exist; this feature set can be switched on later without rework.

## 1. Why it is deferred

- The business is SEO traffic → comparison → lead. None of that requires a student login,
  and `design-system.md` §8.3 already deferred favourites for exactly that reason.
- Every account is PII from an audience that is often under 18 (`risks.md` §R-06). We take
  that on when the retention payoff is real, not because the feature is buildable.
- The honest observation from the field: **students do not use reminder emails much.** A
  bare "alerts" feature would be built and ignored. The centrepiece below is a tool, not a
  notification.

## 2. The centrepiece: the decision dashboard ("Mi lista")

Choosing a career in Paraguay is a months-long project across 3–6 candidate faculties, each
with its own examen/CPI, calendar, requirements and costs. That multi-month loop — not a
reminder — is the natural reason to return. A signed-in student gets one page holding:

- **The shortlist** — saved programmes, reusing the comparador's selection vocabulary
  (`src/lib/compare/state.ts`) so "guardar" and "comparar" are one mental model, synced
  across devices instead of trapped in one browser's `localStorage`.
- **A per-faculty checklist** — requisitos, fecha de examen/CPI, documents, with done-ticks.
  Derived from `admissions` where we have data; honest gaps ("sin datos — consultá a la
  facultad") where we don't. Never a fabricated date.
- **The total-cost view** — matrícula + cuotas + derecho de examen across the programme
  length, per option, computed only from verified `prices` rows and carrying the same
  staleness warnings as everywhere else (`architecture.md` §23). No number without provenance.
- **Alerts as a by-product, not a product** — an item on your list whose admission cycle
  opens triggers a notice. Email first (Resend exists). WhatsApp is the channel Paraguayans
  actually read, but the Business API has per-message costs — a later decision, noted here
  so it isn't re-litigated.

## 3. Account model

- **Magic-link only, no passwords.** The `password_reset_tokens` single-use token machinery
  (PR-35/36) is the template: hashed at rest, single-use, short TTL. A student role never
  joins the staff/institution role tracks (`src/lib/auth/roles.ts` keeps them disjoint).
- **Minimum data**: email, `age_bracket`, the list itself. No name required, no phone, no
  birthdate. The account holds *preferences*, not a profile.
- **R-06 extensions, non-negotiable when this builds:**
  - `menor_18` signup shows the guardian-awareness consent text, versioned like the lead
    form's (`consent_text_version` + `consent_at`).
  - Self-service **delete my account** from day one — unlike leads (where the email path is
    deliberate, `risks.md` §R-06), an account session can prove ownership, so a button is a
    promise we *can* keep.
  - Inactive-account purge on a stated schedule (mirror the 24-month lead rule), and the
    privacy page updated in the same PR.
- Every alert email carries one-click unsubscribe that works without logging in.

## 4. Also designed, also unscheduled

- **Vocational quiz** (`monetization.md` §6.2's "orientación para colegios") — results save
  to the account and feed the shortlist. Top-of-funnel, not retention; sequence it after
  Mi lista exists to receive its output.
- **Guaraní pages** — if a second language ever ships, it is guaraní on a handful of
  high-traffic pages (a real differentiator), not English (vanity for this market). Blocked
  on the i18n seam PR (`pr-plan.md` PR-47) plus a translator we trust.

## 5. Build shape when activated (three PRs, in order)

1. **Accounts & consent** · Opus — `student` role, magic-link auth reusing the token
   pattern, consent capture, self-delete, purge cron. Schema + PII, so Opus by the
   `agent-workflow.md` split rule.
2. **Mi lista** · Sonnet → Opus review — shortlist, checklist, cost view against the
   interfaces PR 1 fixed. Review because it renders prices and admission facts.
3. **Alerts** · Sonnet — the notice job over `admissions` transitions for listed items,
   unsubscribe, and the digest hygiene rules PR-29 established (idempotent by unique key,
   catch-up not exact-day).

**Activation trigger:** revisit when organic traffic is compounding after the
October–February peak and the comparador shows repeat multi-session use — the signal
`design-system.md` §8.3 asked for. Not before.
