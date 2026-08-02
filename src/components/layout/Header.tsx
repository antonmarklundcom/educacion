'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { navLinks } from './nav-links';

/** Client component: the mobile menu needs open/closed state. Nav links and the rest of the shell stay static. */
export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="text-lg font-bold text-ink" onClick={() => setOpen(false)}>
          educacion<span className="text-accent">.com.py</span>
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-body hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:block">
          <Button variant="primary" href="/carreras" className="min-h-10 px-4">
            Buscar carreras
          </Button>
        </div>

        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex size-11 items-center justify-center rounded-md text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 md:hidden"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="size-6 fill-none stroke-current">
            {open ? (
              <path
                d="M6 6l12 12M18 6L6 18"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              <path
                d="M4 7h16M4 12h16M4 17h16"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Principal, móvil"
          className="flex flex-col gap-1 border-t border-border px-4 py-3 md:hidden"
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="min-h-12 rounded-md px-3 py-3 text-sm font-medium text-body hover:bg-card-alt"
            >
              {link.label}
            </Link>
          ))}
          <Button variant="primary" href="/carreras" onClick={() => setOpen(false)} className="mt-2">
            Buscar carreras
          </Button>
        </nav>
      )}
    </header>
  );
}
