'use client';

/**
 * CLIENT COMPONENT — loads the third-party analytics script, or does not.
 *
 * Justification: whether the script may load is a per-visitor fact stored in a
 * cookie. Reading it on the server with `cookies()` would opt every static
 * page — the homepage, the legal pages, the editorial hub — out of static
 * rendering for the sake of one `<script>` tag, which is a real cost against
 * `architecture.md` §3. Reading it in the browser keeps those pages static.
 *
 * ### Two things called analytics, one banner
 *
 * This is the half a banner governs: a request to another company's server
 * carrying the visitor's IP. It does not load until `hasAnalyticsConsent()`
 * says so, and **no cookie means no** — so until PR-15 ships the banner that
 * writes it, this never loads at all. The first-party `events` table is not
 * gated and the reasoning is written down in `@/lib/analytics/consent`.
 *
 * ### Plausible, not GA4
 *
 * `architecture.md` §1 allowed either. Plausible is cookieless, does not build
 * a cross-site profile, and its script is ~1 kb against GA4's ~50 kb on a
 * 150 kb budget. It is also a paid service: with `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`
 * unset — which is every environment until someone subscribes — this component
 * renders nothing, and no half-configured script goes to production.
 */

import { useEffect, useState } from 'react';

import { CONSENT_CHANGED_EVENT, hasAnalyticsConsent } from '@/lib/analytics/consent';

const SCRIPT_SRC = 'https://plausible.io/js/script.js';

export function Analytics() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    if (!domain) return;

    const read = () => setGranted(hasAnalyticsConsent(document.cookie));
    read();

    // PR-15's banner dispatches this after writing the cookie, so accepting
    // starts counting immediately instead of on the next navigation.
    window.addEventListener(CONSENT_CHANGED_EVENT, read);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, read);
  }, [domain]);

  useEffect(() => {
    if (!domain || !granted) return;
    if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) return;

    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.defer = true;
    script.dataset.domain = domain;
    document.head.appendChild(script);
  }, [domain, granted]);

  return null;
}
