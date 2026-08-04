/**
 * Sharing a comparison. A server component — both are plain links.
 *
 * WhatsApp is the growth loop here: `wa.me` without a phone number opens the
 * user's own contact picker, so no institution number is involved and nothing
 * is invented. The page it links to renders server-side and carries a
 * per-comparison OG image, which is what makes the pasted link an ad rather
 * than a bare URL (seo.md §1).
 *
 * The WhatsApp button is a secondary style, not a peer of the accent CTA
 * (design-system.md §8.2).
 */

const WHATSAPP_GREEN = '#1f8a4c';

export interface ShareButtonsProps {
  /** Absolute URL — a relative one is useless once it is pasted elsewhere. */
  url: string;
  programNames: readonly string[];
}

export function ShareButtons({ url, programNames }: ShareButtonsProps) {
  const text = `Comparé estas carreras en educacion.com.py: ${programNames.join(' · ')}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;

  return (
    <div className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-ink text-base font-semibold">Compartí esta comparación</h2>
        <p className="text-muted mt-1 text-sm">
          El enlace abre exactamente estas {programNames.length} carreras.
        </p>
      </div>
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="border-border-strong bg-surface text-ink hover:bg-card-alt focus-visible:ring-ink inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border px-5 text-sm font-medium transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill={WHATSAPP_GREEN}>
          <path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2Zm0 18a8 8 0 0 1-4.3-1.2l-.3-.2-2.9.9.9-2.8-.2-.3A8 8 0 1 1 12 20Zm4.5-5.9c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.1-.2 0-.4.1-.5l.5-.6c.1-.1.1-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.7.7-.9 1.6-.6 2.6.5 1.7 1.7 3.1 3.4 4 .5.3 1.4.6 1.9.6.7.1 1.3 0 1.8-.4.4-.3.6-.8.7-1.2 0-.2 0-.3-.1-.4Z" />
        </svg>
        Compartir por WhatsApp
      </a>
    </div>
  );
}
