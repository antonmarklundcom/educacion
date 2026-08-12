import Link from 'next/link';
import { CONTACT_EMAIL } from '@/lib/legal/contact';
import { navLinks } from './nav-links';

const legalLinks = [
  { href: '/legal/privacidad', label: 'Privacidad' },
  { href: '/legal/terminos', label: 'Términos' },
  { href: '/legal/fuentes', label: 'Fuentes de datos' },
  { href: '/legal/contacto', label: 'Contacto' },
] as const;

/** The R-07 disclaimer is mandatory on every page — see CLAUDE.md rule 9. */
export function Footer() {
  return (
    <footer className="border-border bg-surface border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-ink text-sm font-semibold">educacion.com.py</p>
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-body text-sm hover:underline">
              {CONTACT_EMAIL}
            </a>
          </div>

          <nav aria-label="Enlaces" className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="text-body text-sm hover:underline">
                {link.label}
              </Link>
            ))}
          </nav>

          <nav aria-label="Legal" className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href} className="text-body text-sm hover:underline">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <p className="text-muted max-w-2xl text-xs">
          educacion.com.py es un sitio privado e independiente. No es un portal oficial del MEC,
          CONES ni ANEAES.
        </p>
      </div>
    </footer>
  );
}
