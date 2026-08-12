const LINKS = [
  { href: '/admin', label: 'Panel' },
  { href: '/admin/instituciones', label: 'Instituciones' },
  { href: '/admin/sedes', label: 'Sedes' },
  { href: '/admin/carreras', label: 'Carreras' },
  { href: '/admin/areas', label: 'Áreas' },
  { href: '/admin/programas', label: 'Programas' },
  { href: '/admin/ofertas', label: 'Ofertas' },
  { href: '/admin/aranceles', label: 'Aranceles' },
  { href: '/admin/acreditaciones', label: 'Acreditaciones' },
  { href: '/admin/admisiones', label: 'Convocatorias' },
  { href: '/admin/moderacion', label: 'Moderación' },
  { href: '/admin/disputas', label: 'Disputas' },
  { href: '/admin/reclamos', label: 'Reclamos' },
  { href: '/admin/suscripciones', label: 'Suscripciones' },
  { href: '/admin/facturacion', label: 'Facturación' },
  { href: '/admin/blog', label: 'Blog' },
  { href: '/admin/becas', label: 'Becas' },
  { href: '/admin/empleos', label: 'Empleos' },
  { href: '/admin/frescura', label: 'Frescura' },
  { href: '/admin/usuarios', label: 'Cuentas' },
] as const;

/** The `/admin` section nav. Plain links — no active-state JS needed. */
export function AdminNav() {
  return (
    <nav aria-label="Secciones del admin" className="border-border bg-surface border-b">
      <ul className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 sm:px-6">
        {LINKS.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className="text-body hover:text-ink inline-block px-3 py-3 text-sm font-medium"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
