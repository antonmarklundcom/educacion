import type { Metadata } from 'next';
import { Analytics } from '@/components/analytics';
import { ConsentBanner } from '@/components/consent';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

// Google serves IBM Plex Sans as one variable file, so all four weights cost a
// single ~40 kB request. It carries every heading and every line of body copy,
// so it stays preloaded.
const ibmPlexSans = IBM_Plex_Sans({
  variable: '--font-ibm-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

/**
 * Mono is **not** preloaded (PR-53).
 *
 * It is two static files, ~21 kB, and `design-system.md` §3 gives it one job:
 * the numeric columns of the comparador and the price rows. It is never the LCP
 * element, and `/`, `/acreditacion` and `/universidades` do not render a
 * monospace glyph between them — but `preload: true` (the default) fetched both
 * files on every route anyway, because a preload is a declaration that the font
 * is needed, not an observation that it is. Measured: 61.3 kB of font on pages
 * that paint 39.6 kB of it, inside the ~274 kB that decides LCP on the
 * simulated-4G profile the budgets use (`architecture.md` §36).
 *
 * Dropping the preload keeps the `@font-face`. A page that does use mono still
 * loads it — one round trip later, on demand, painting in the metric-adjusted
 * fallback in the meantime, which is what `display: swap` already promised.
 */
const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-ibm-plex-mono',
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
  preload: false,
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'educacion.com.py',
    template: '%s | educacion.com.py',
  },
  description: 'El índice completo, buscable y comparable de la educación superior en Paraguay.',
  twitter: {
    card: 'summary_large_image',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-PY">
      <body className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} antialiased`}>
        {/* The first tab stop on every page (PR-34). `/carreras` puts a filter
            rail of ~40 links before the results; without this, reaching them
            with a keyboard means tabbing through the whole rail on every
            navigation. `main` carries the id — every route renders one. */}
        <a
          href="#contenido"
          className="text-ink focus:border-border-strong focus:bg-surface sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-md focus:border focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
        >
          Saltar al contenido
        </a>
        {children}
        <Analytics />
        {/* Beside `Analytics`, not inside the public layout: the script it
            governs is mounted here, so the banner that governs it has to reach
            every route the script does. */}
        <ConsentBanner />
      </body>
    </html>
  );
}
