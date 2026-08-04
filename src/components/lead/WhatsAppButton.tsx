'use client';

/**
 * CLIENT COMPONENT — the WhatsApp CTA.
 *
 * Justification: the link itself is plain HTML, but the `whatsapp_click` event
 * is fired with `navigator.sendBeacon` as the browser navigates away, and that
 * is browser-only. The alternative — routing the click through a server
 * redirect — would log crawlers as students and put a hop between the tap and
 * the chat, and the number PR-28 shows an institution has to be defensible.
 *
 * If JavaScript never runs the link still opens WhatsApp; the click is simply
 * not counted. An uncounted real click is a smaller error than a counted fake
 * one.
 *
 * **Renders nothing without a number.** `whatsappHref` returns `null` when the
 * institution published no `whatsapp_e164`, and there is no fallback to the
 * landline and no guess: a wrong number under this button starts a conversation
 * with a stranger (CLAUDE.md rule 1).
 *
 * Secondary style, never the accent — design-system.md §8.2: WhatsApp sits
 * beside the primary CTA, it is not a peer of it.
 */

import { EVENTS_ENDPOINT } from '@/lib/events/contract';
import { whatsappHref } from '@/lib/leads/whatsapp';

export interface WhatsAppButtonProps {
  whatsappE164: string | null | undefined;
  programName: string;
  institutionShort: string;
  offeringId: number;
  institutionId: number;
  /** `icon` is the compact square used on result cards at 390px (§7). */
  size?: 'icon' | 'full';
  className?: string;
}

const WHATSAPP_GREEN = '#1f8a4c';

export function WhatsAppButton({
  whatsappE164,
  programName,
  institutionShort,
  offeringId,
  institutionId,
  size = 'full',
  className,
}: WhatsAppButtonProps) {
  const href = whatsappHref({ whatsappE164, programName, institutionShort });
  if (!href) return null;

  const report = () => {
    try {
      navigator.sendBeacon?.(
        EVENTS_ENDPOINT,
        new Blob([JSON.stringify({ type: 'whatsapp_click', offeringId, institutionId })], {
          type: 'application/json',
        }),
      );
    } catch {
      // Never let analytics stand between a student and the chat.
    }
  };

  const base =
    'border-border-strong bg-surface text-ink hover:bg-card-alt focus-visible:ring-ink inline-flex min-h-12 items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={report}
      onAuxClick={report}
      aria-label={`Escribir por WhatsApp a ${institutionShort} sobre ${programName}`}
      className={[
        base,
        size === 'icon' ? 'w-12 shrink-0 px-0' : 'w-full px-5 sm:w-auto',
        className ?? '',
      ].join(' ')}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill={WHATSAPP_GREEN}>
        <path d="M17.5 14.4c-.3-.1-1.7-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-1.6-.8-2.7-1.5-3.8-3.4-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5s-.7-1.6-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.4 1.9.8 2.6.9 3.5.8.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z" />
      </svg>
      {size === 'full' && 'WhatsApp'}
    </a>
  );
}
