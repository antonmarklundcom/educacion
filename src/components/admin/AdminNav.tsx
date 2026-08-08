import Link from 'next/link';

import { ADMIN_ENTITIES, ENTITY_DEFS } from '@/lib/admin/entities';

/**
 * The admin's one navigation surface. Server component — it renders links.
 *
 * No accent anywhere (CLAUDE.md rule 7): navigation is ink and border, the
 * accent belongs to primary CTAs on the public site.
 */
export function AdminNav({ current }: { current?: string }) {
  const items = [
    { href: '/admin', label: 'Resumen', key: 'resumen' },
    ...ADMIN_ENTITIES.map((entity) => ({
      href: `/admin/${entity}`,
      label: ENTITY_DEFS[entity].plural,
      key: entity,
    })),
    { href: '/admin/stats', label: 'Métricas', key: 'stats' },
  ];

  return (
    <nav aria-label="Secciones del admin" className="border-border border-b">
      <ul className="mx-auto flex max-w-6xl flex-wrap gap-x-4 gap-y-1 px-4 py-2 sm:px-6">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={current === item.key ? 'page' : undefined}
              className={
                current === item.key
                  ? 'text-ink text-sm font-semibold underline underline-offset-4'
                  : 'text-muted hover:text-ink text-sm'
              }
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
