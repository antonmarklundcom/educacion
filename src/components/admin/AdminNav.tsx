'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The `/admin` section nav, as a sidebar.
 *
 * Twenty-one destinations in a horizontally scrolling strip meant everything
 * past `Ofertas` was invisible until you dragged for it, and nothing told you
 * where you were. A vertical rail shows the whole surface at once and gives the
 * groups somewhere to live — the grouping is the point, not decoration: it says
 * out loud that `Aranceles` and `Frescura` are the same job, and that
 * `Facturación` is not the same job as `Blog`.
 *
 * **This is the one client component in the section** (CLAUDE.md rule 6). It
 * needs `usePathname` for the active state, which a server component cannot
 * read. Nothing else here is interactive: every item is a plain `Link`, so the
 * rail works with JS off apart from losing the highlight.
 *
 * `adminOnly` items are hidden from an `editor`. That is UX, not access
 * control — each of those pages calls `requireRole(user, ['admin'])` and
 * answers 404 on its own (CLAUDE.md rule 4). Hiding them keeps an editor from
 * clicking into four dead ends, nothing more.
 */

type NavItem = {
  readonly href: string;
  readonly label: string;
  /** Hidden from editors. The page enforces this itself; see above. */
  readonly adminOnly?: boolean;
};

type NavGroup = {
  readonly title: string;
  readonly items: readonly NavItem[];
};

const GROUPS: readonly NavGroup[] = [
  {
    title: 'Catálogo',
    items: [
      { href: '/admin/instituciones', label: 'Instituciones' },
      { href: '/admin/sedes', label: 'Sedes' },
      { href: '/admin/carreras', label: 'Carreras' },
      { href: '/admin/areas', label: 'Áreas' },
      { href: '/admin/programas', label: 'Programas' },
      { href: '/admin/ofertas', label: 'Ofertas' },
    ],
  },
  {
    title: 'Datos con fecha',
    items: [
      { href: '/admin/aranceles', label: 'Aranceles' },
      { href: '/admin/acreditaciones', label: 'Acreditaciones' },
      { href: '/admin/admisiones', label: 'Convocatorias' },
      { href: '/admin/frescura', label: 'Frescura' },
    ],
  },
  {
    title: 'Cola de trabajo',
    items: [
      { href: '/admin/moderacion', label: 'Moderación' },
      { href: '/admin/disputas', label: 'Disputas' },
      { href: '/admin/reclamos', label: 'Reclamos' },
    ],
  },
  {
    title: 'Negocio',
    items: [
      { href: '/admin/suscripciones', label: 'Suscripciones', adminOnly: true },
      { href: '/admin/facturacion', label: 'Facturación', adminOnly: true },
      { href: '/admin/stats', label: 'Métricas', adminOnly: true },
    ],
  },
  {
    title: 'Contenido',
    items: [
      { href: '/admin/blog', label: 'Blog' },
      { href: '/admin/becas', label: 'Becas' },
      { href: '/admin/empleos', label: 'Empleos' },
    ],
  },
  {
    title: 'Sistema',
    items: [{ href: '/admin/usuarios', label: 'Cuentas', adminOnly: true }],
  },
] as const;

/**
 * Whether `href` is the section the current path belongs to.
 *
 * Prefix-matched so `/admin/carreras/nueva` and `/admin/carreras/12` both keep
 * `Carreras` lit — the edit screens have no nav entry of their own and would
 * otherwise leave the rail blank. `/admin` itself is matched exactly, or it
 * would light up on every page in the section.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? 'bg-card-alt text-ink block rounded-md px-3 py-2 text-sm font-medium'
          : 'text-body hover:bg-card-alt hover:text-ink block rounded-md px-3 py-2 text-sm'
      }
    >
      {item.label}
    </Link>
  );
}

function NavLinks({ pathname, isAdmin }: { pathname: string; isAdmin: boolean }) {
  return (
    <div className="flex flex-col gap-5 px-3 py-4">
      <NavLink item={{ href: '/admin', label: 'Panel' }} active={isActive(pathname, '/admin')} />

      {GROUPS.map((group) => {
        const items = group.items.filter((item) => isAdmin || !item.adminOnly);
        if (items.length === 0) return null;

        return (
          <div key={group.title} className="flex flex-col gap-1">
            <h2 className="text-muted px-3 pb-1 text-xs font-semibold tracking-wide uppercase">
              {group.title}
            </h2>
            {items.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function AdminNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <>
      {/*
        Mobile: a disclosure rather than a rail. A 240 px column on a 360 px
        phone leaves nothing for the tables these pages exist to show, and
        `<details>` costs no script for the open/close.
      */}
      <details className="border-border border-b md:hidden">
        <summary className="text-ink cursor-pointer px-4 py-3 text-sm font-medium">
          Secciones
        </summary>
        <nav aria-label="Secciones del admin">
          <NavLinks pathname={pathname} isAdmin={isAdmin} />
        </nav>
      </details>

      <aside className="border-border hidden w-60 shrink-0 border-r md:block">
        <nav
          aria-label="Secciones del admin"
          className="sticky top-0 max-h-screen overflow-y-auto"
        >
          <NavLinks pathname={pathname} isAdmin={isAdmin} />
        </nav>
      </aside>
    </>
  );
}
