const LINKS = [
  { href: '/admin', label: 'Panel' },
  { href: '/admin/instituciones', label: 'Instituciones' },
  { href: '/admin/sedes', label: 'Sedes' },
  { href: '/admin/carreras', label: 'Carreras' },
  { href: '/admin/programas', label: 'Programas' },
  { href: '/admin/ofertas', label: 'Ofertas' },
] as const;

/** The `/admin` section nav. Plain links — no active-state JS needed. */
export function AdminNav() {
  return (
    <nav aria-label="Secciones del admin" className="border-b border-border bg-surface">
      <ul className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 sm:px-6">
        {LINKS.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className="inline-block px-3 py-3 text-sm font-medium text-body hover:text-ink"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
