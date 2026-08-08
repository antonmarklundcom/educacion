/**
 * `/universidades/[slug]/reclamar` — the public claim request (PR-22).
 *
 * A server component around one client form. It reads the institution to show
 * *which* profile is being claimed and to tell the visitor, before they type
 * anything, whether their address will verify automatically — the domain we
 * expect is public information (it is the website on the profile), and hiding
 * it would only produce claims that sit in a queue for no reason.
 *
 * Not indexed: this is a transactional page, not a landing page, and a claim
 * form ranking for an institution's name is the last thing this site needs.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { Card } from '@/components/ui';
import { getInstitutionBySlug } from '@/lib/institutions';
import { websiteDomain } from '@/lib/claims';

import { ClaimRequestForm } from './ClaimRequestForm';

export const dynamic = 'force-dynamic';

type Params = Promise<{ instSlug: string }>;

const loadInstitution = cache(async (slug: string) => getInstitutionBySlug(slug));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { instSlug } = await params;
  const institution = await loadInstitution(instSlug);
  return {
    title: institution
      ? `Reclamá el perfil de ${institution.nameShort}`
      : 'Institución no encontrada',
    robots: { index: false, follow: false },
  };
}

export default async function ClaimRequestPage({ params }: { params: Params }) {
  const { instSlug } = await params;
  const institution = await loadInstitution(instSlug);
  if (!institution) notFound();

  const profileHref = `/universidades/${instSlug}`;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2">
        <a href={profileHref} className="text-muted hover:text-ink text-sm underline-offset-2">
          ← {institution.nameShort}
        </a>
        <h1 className="text-ink text-2xl font-bold">¿Es tu institución?</h1>
        <p className="text-body text-sm">
          Si trabajás en {institution.nameOfficial}, podés hacerte cargo de este perfil: corregís
          los datos, cargás aranceles y convocatorias, y recibís las solicitudes de los estudiantes
          en tu panel.
        </p>
      </div>

      {institution.isClaimed ? (
        <Card className="flex flex-col gap-2">
          <h2 className="text-ink text-base font-semibold">Este perfil ya fue reclamado</h2>
          <p className="text-body text-sm">
            Alguien de {institution.nameShort} ya está a cargo. Si sos parte de la institución y
            necesitás acceso, pedile que te invite desde su panel, o escribinos.
          </p>
          <a
            href="/legal/contacto"
            className="text-body hover:text-ink text-sm underline underline-offset-2"
          >
            Contactanos
          </a>
        </Card>
      ) : (
        <>
          <ClaimRequestForm
            institutionSlug={instSlug}
            expectedDomain={websiteDomain(institution.website)}
          />

          <Card className="flex flex-col gap-2">
            <h2 className="text-ink text-sm font-semibold">Cómo verificamos</h2>
            <ul className="text-muted flex list-disc flex-col gap-1 pl-4 text-sm">
              <li>
                Si tu correo está en el dominio del sitio oficial de la institución, te mandamos un
                enlace y listo.
              </li>
              <li>
                Si no —porque no tenemos el sitio registrado o usás otra dirección— lo revisa una
                persona de nuestro equipo antes de darte acceso.
              </li>
              <li>El enlace sirve una sola vez y vence a las 72 horas.</li>
              <li>Nunca cambiamos la contraseña de una cuenta que ya existe.</li>
            </ul>
          </Card>
        </>
      )}
    </main>
  );
}
