import type { Metadata } from 'next';
import { Analytics } from '@/components/analytics';
import { ConsentBanner } from '@/components/consent';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const ibmPlexSans = IBM_Plex_Sans({
  variable: '--font-ibm-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-ibm-plex-mono',
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'educacion.com.py',
    template: '%s | educacion.com.py',
  },
  description: 'El índice completo, buscable y comparable de la educación superior en Paraguay.',
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
