'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { brandCopy } from '@/lib/copy/brand';
import { navCopy } from '@/lib/copy/nav';
import { navLinks } from './nav-links';

/** Client component: the mobile menu needs open/closed state. Nav links and the rest of the shell stay static. */
export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-border bg-surface sticky top-0 z-40 border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="text-ink text-lg font-bold" onClick={() => setOpen(false)}>
          {brandCopy.name}
          <span className="text-accent">{brandCopy.tld}</span>
        </Link>

        <nav aria-label={navCopy.primaryLabel} className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-body hover:text-ink text-sm font-medium"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:block">
          <Button variant="primary" href="/carreras" className="min-h-10 px-4">
            {navCopy.searchCta}
          </Button>
        </div>

        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? navCopy.closeMenu : navCopy.openMenu}
          onClick={() => setOpen((value) => !value)}
          className="text-ink focus-visible:ring-ink inline-flex size-11 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none md:hidden"
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
          aria-label={navCopy.mobileLabel}
          className="border-border flex flex-col gap-1 border-t px-4 py-3 md:hidden"
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="text-body hover:bg-card-alt min-h-12 rounded-md px-3 py-3 text-sm font-medium"
            >
              {link.label}
            </Link>
          ))}
          <Button
            variant="primary"
            href="/carreras"
            onClick={() => setOpen(false)}
            className="mt-2"
          >
            {navCopy.searchCta}
          </Button>
        </nav>
      )}
    </header>
  );
}
