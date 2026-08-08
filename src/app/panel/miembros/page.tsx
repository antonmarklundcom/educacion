import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PanelForm } from '@/components/panel/PanelForm';
import { PanelNav } from '@/components/panel/PanelNav';
import { Badge } from '@/components/ui';
import { listMembers } from '@/db/queries/panel/members';
import { hasRole } from '@/lib/auth/roles';
import { AuthError } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

import { inviteMemberAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

const input =
  'min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink';

/**
 * Reading the team needs panel access; changing it needs `institution_admin`.
 * The form below is hidden from an editor — and `inviteMember` refuses them
 * server-side regardless, which is the check that counts (CLAUDE.md rule 4).
 */
export default async function PanelMembersPage() {
  const user = await currentUser();

  let members;
  try {
    members = await listMembers(user);
  } catch (error) {
    if (error instanceof AuthError) redirect('/ingresar');
    throw error;
  }

  const isAdmin = hasRole(user, ['institution_admin']);

  return (
    <>
      <PanelNav current="/panel/miembros" />
      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-ink text-2xl font-bold">Equipo</h1>
          <p className="text-muted max-w-prose text-sm">
            Quiénes pueden entrar al panel de tu institución.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li
              key={member.userId}
              className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3"
            >
              <span className="min-w-0">
                <span className="text-ink block font-medium">{member.name ?? member.email}</span>
                <span className="text-muted block text-sm">{member.email}</span>
              </span>
              <span className="flex items-center gap-2">
                <Badge tone="neutral">
                  {member.role === 'institution_admin' ? 'Administra' : 'Edita'}
                </Badge>
                {!member.canSignIn && <Badge tone="warn">Sin acceso todavía</Badge>}
              </span>
            </li>
          ))}
        </ul>

        {isAdmin && (
          <section className="border-border flex flex-col gap-3 border-t pt-6">
            <h2 className="text-ink text-lg font-semibold">Sumá a alguien</h2>
            <PanelForm
              action={inviteMemberAction}
              submitLabel="Agregá a esta persona"
              note="Todavía no enviamos correos de acceso, así que después de agregarla escribinos para que le habilitemos la contraseña. Preferimos decírtelo antes que dejarte esperando un mail que no llega."
            >
              <label className="text-body flex flex-col gap-1.5 text-sm font-medium">
                Correo
                <input name="email" type="email" required className={input} />
              </label>
              <label className="text-body flex flex-col gap-1.5 text-sm font-medium">
                Nombre
                <input name="name" className={input} />
              </label>
              <label className="text-body flex flex-col gap-1.5 text-sm font-medium">
                Rol
                <select name="role" defaultValue="institution_editor" className={input}>
                  <option value="institution_editor">Edita los datos</option>
                  <option value="institution_admin">Administra el equipo también</option>
                </select>
              </label>
            </PanelForm>
          </section>
        )}
      </main>
    </>
  );
}
