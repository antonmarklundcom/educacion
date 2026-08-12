import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminForm } from '@/components/admin/AdminForm';
import { Badge } from '@/components/ui';
import { institutionsWithoutAccess, listUsers } from '@/db/queries/admin/users';
import { listInstitutionOptions } from '@/db/queries/admin/options';
import { ADMIN_LINK_TTL_HOURS } from '@/lib/auth/reset-token';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { createUserAction, setUserStatusAction } from './actions';
import { AccessLinkButton } from './AccessLinkButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  editor: 'Editor',
  institution_admin: 'Institución — admin',
  institution_editor: 'Institución — editor',
};

/**
 * `/admin/usuarios` (PR-36) — the only screen that mints logins, and the reason
 * onboarding an institution no longer requires working email.
 *
 * `admin` only. `editor` gets a 404 rather than a "no tenés permiso": the
 * screen's existence is not information an editor needs, and every function it
 * calls refuses them server-side regardless (CLAUDE.md rule 4).
 */
export default async function AdminUsersPage() {
  const user = await currentUser();
  try {
    requireRole(user, ['admin']);
  } catch {
    notFound();
  }

  const [rows, institutions, pending] = await Promise.all([
    listUsers(user),
    listInstitutionOptions(),
    institutionsWithoutAccess(user),
  ]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-ink text-2xl font-bold">Cuentas</h1>
        <p className="text-muted max-w-prose text-sm">
          Quién puede entrar. Una cuenta nueva nace sin contraseña: le generás un enlace de acceso y
          se lo pasás vos por WhatsApp o por teléfono. El enlace sirve una sola vez, vence en{' '}
          {ADMIN_LINK_TTL_HOURS} horas y no se guarda en ningún lado — si se pierde, generás otro.
        </p>
      </div>

      {pending.length > 0 && (
        <section className="border-border bg-card-alt rounded-md border px-4 py-3">
          <h2 className="text-ink text-sm font-medium">
            Instituciones publicadas sin nadie que pueda entrar ({pending.length})
          </h2>
          <p className="text-muted mt-1 text-sm">
            {pending.map((institution) => institution.name).join(' · ')}
          </p>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-ink text-lg font-semibold">Crear una cuenta</h2>
        <AdminForm
          fields={[
            { type: 'email', name: 'email', label: 'Correo', required: true, maxLength: 255 },
            { type: 'text', name: 'name', label: 'Nombre', maxLength: 160 },
            {
              type: 'select',
              name: 'role',
              label: 'Rol',
              required: true,
              placeholder: 'Seleccioná…',
              options: Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })),
            },
            {
              type: 'select',
              name: 'institutionId',
              label: 'Institución (sólo para roles de institución)',
              placeholder: 'Ninguna',
              options: institutions.map((institution) => ({
                value: String(institution.id),
                label: institution.label,
              })),
            },
          ]}
          action={createUserAction}
          submitLabel="Creá la cuenta"
          cancelHref="/admin/usuarios"
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-ink text-lg font-semibold">Cuentas existentes</h2>
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="border-border bg-surface flex flex-wrap items-start justify-between gap-4 rounded-md border px-4 py-3"
            >
              <div className="min-w-0">
                <span className="text-ink block font-medium">{row.name ?? row.email}</span>
                <span className="text-muted block text-sm">{row.email}</span>
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{ROLE_LABELS[row.role] ?? row.role}</Badge>
                  {row.institutionName && <Badge tone="neutral">{row.institutionName}</Badge>}
                  {row.status === 'suspended' ? (
                    <Badge tone="danger">Suspendida</Badge>
                  ) : row.canSignIn ? (
                    <Badge tone="ok">Puede entrar</Badge>
                  ) : (
                    <Badge tone="warn">Sin contraseña</Badge>
                  )}
                  {row.liveLinks > 0 && (
                    <Badge tone="warn">
                      {row.liveLinks === 1 ? '1 enlace activo' : `${row.liveLinks} enlaces activos`}
                    </Badge>
                  )}
                </span>
              </div>

              <div className="flex flex-col items-end gap-2">
                {row.status !== 'suspended' && (
                  <AccessLinkButton userId={row.id} email={row.email} />
                )}

                {row.id !== user!.id && (
                  <form
                    action={setUserStatusAction.bind(
                      null,
                      row.id,
                      row.status === 'suspended' ? 'active' : 'suspended',
                    )}
                  >
                    <button
                      type="submit"
                      className={
                        row.status === 'suspended'
                          ? 'text-ink text-sm underline underline-offset-4'
                          : 'text-danger text-sm underline underline-offset-4'
                      }
                    >
                      {row.status === 'suspended' ? 'Reactivá la cuenta' : 'Suspendé la cuenta'}
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
