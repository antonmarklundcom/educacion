import Link from 'next/link';
import { brandCopy } from '@/lib/copy/brand';
import { footerCopy } from '@/lib/copy/footer';
import { CONTACT_EMAIL } from '@/lib/legal/contact';
import { navLinks } from './nav-links';

/**
 * Footer-only, so it lives here rather than in `nav-links.ts`: that module is
 * imported by `Header`, a client component, and everything in it ships to the
 * browser (`architecture.md` §30.2).
 */
const legalLinks = [
  { href: '/legal/privacidad', label: footerCopy.legal.privacidad },
  { href: '/legal/terminos', label: footerCopy.legal.terminos },
  { href: '/legal/fuentes', label: footerCopy.legal.fuentes },
  { href: '/legal/contacto', label: footerCopy.legal.contacto },
] as const;

/** The R-07 disclaimer is mandatory on every page — see CLAUDE.md rule 9. */
export function Footer() {
  return (
    <footer className="border-border bg-surface border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-ink text-sm font-semibold">{brandCopy.full}</p>
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-body text-sm hover:underline">
              {CONTACT_EMAIL}
            </a>
          </div>

          <nav
            aria-label={footerCopy.linksLabel}
            className="flex flex-col gap-2 sm:flex-row sm:gap-6"
          >
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="text-body text-sm hover:underline">
                {link.label}
              </Link>
            ))}
          </nav>

          <nav
            aria-label={footerCopy.legalLabel}
            className="flex flex-col gap-2 sm:flex-row sm:gap-6"
          >
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href} className="text-body text-sm hover:underline">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <p className="text-muted max-w-2xl text-xs">{footerCopy.disclaimer}</p>
      </div>
    </footer>
  );
}
