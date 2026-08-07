'use client';

/**
 * CLIENT COMPONENT — the cookie banner, and the only one in PR-15.
 *
 * Justification: the banner's whole content is a per-visitor decision held in a
 * cookie and changed by a click. Reading it on the server with `cookies()`
 * would opt every static page out of static rendering for one dismissible strip
 * (`architecture.md` §3) — the same trade `Analytics` already made, for the same
 * reason.
 *
 * ### What it governs, and what it does not
 *
 * The Plausible script, and nothing else. The first-party `events` table is not
 * behind this banner and must never be put behind it: it sets no cookie, it
 * touches no client storage, and its session hash is derived server-side and
 * rotates daily (`consent.ts`, `architecture.md` §12). Accepting or refusing
 * here changes exactly one thing — whether a request goes to plausible.io.
 * `/legal/privacidad` §5 explains that distinction to a visitor in Spanish.
 *
 * ### Why it does not render without `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`
 *
 * With the variable unset, `Analytics` renders nothing and no third-party
 * script exists to consent to. Asking anyway would be theatre: a banner that
 * collects an answer to a question with no consequence teaches people the
 * answer never matters. The banner appears when — and only when — there is a
 * script it can actually stop.
 *
 * ### Accent discipline
 *
 * "Aceptar" is not a primary CTA, so it is ink, not `#0d6e86` (CLAUDE.md rule
 * 7). The two buttons are equal weight on purpose: an accept styled louder than
 * a refuse is a dark pattern with a stylesheet.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { CONSENT_CHANGED_EVENT } from '@/lib/analytics/consent';
import {
  consentCookieValue,
  serializeConsentCookie,
  shouldPromptForConsent,
} from '@/lib/analytics/consent-banner';

const BUTTON =
  'inline-flex min-h-12 w-full items-center justify-center rounded-md px-5 text-sm font-medium transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto';

export function ConsentBanner() {
  const configured = Boolean(process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN);
  const [visible, setVisible] = useState(false);

  // Mounted-only: the server has no cookie to read here, so rendering the strip
  // before hydration would flash it at people who already answered.
  useEffect(() => {
    if (!configured) return;
    setVisible(shouldPromptForConsent(document.cookie));
  }, [configured]);

  const decide = useCallback((accepted: boolean) => {
    document.cookie = serializeConsentCookie(consentCookieValue(accepted), {
      secure: window.location.protocol === 'https:',
    });
    setVisible(false);
    // `Analytics` listens for this, so an acceptance starts counting now rather
    // than on the next navigation. Nothing else may dispatch it.
    window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
  }, []);

  if (!configured || !visible) return null;

  return (
    <div
      role="region"
      aria-label="Preferencias de medición"
      className="border-border bg-surface fixed inset-x-0 bottom-0 z-50 border-t p-4 shadow-[0_-2px_16px_rgba(15,23,42,0.08)] sm:p-6"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body max-w-2xl text-sm">
          Usamos una herramienta externa (Plausible) para medir cuántas personas visitan el sitio.
          Solo carga si vos lo aceptás. Nuestro conteo propio de visitas no usa cookies y funciona
          igual —{' '}
          <Link href="/legal/privacidad#cookies" className="text-ink font-medium underline">
            te explicamos la diferencia acá
          </Link>
          .
        </p>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => decide(false)}
            className={`${BUTTON} border-border-strong bg-surface text-ink hover:bg-card-alt border`}
          >
            Rechazar
          </button>
          <button
            type="button"
            onClick={() => decide(true)}
            className={`${BUTTON} bg-ink hover:bg-body text-white`}
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
