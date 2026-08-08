import Link from 'next/link';

const LINKS = [
  { href: '/panel', label: 'Resumen' },
  { href: '/panel/carreras', label: 'Mis carreras' },
  { href: '/panel/ofertas', label: 'Sedes y aranceles' },
  { href: '/panel/convocatorias', label: 'Convocatorias' },
  { href: '/panel/miembros', label: 'Equipo' },
] as const;

/** The panel's section nav. Server component — plain links, no client state. */
export function PanelNav({ current }: { current?: string }) {
  return (
    <nav aria-label="Secciones del panel" className="border-border bg-surface border-b">
      <ul className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 sm:px-6">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={current === link.href ? 'page' : undefined}
              className={
                current === link.href
                  ? 'text-ink inline-block px-3 py-3 text-sm font-semibold underline underline-offset-8'
                  : 'text-body hover:text-ink inline-block px-3 py-3 text-sm font-medium'
              }
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
