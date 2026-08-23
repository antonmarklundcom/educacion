import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { hasRole, requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The `/admin` index.
 *
 * The groups and their order match `AdminNav` exactly — two lists that disagree
 * about what belongs with what teach the reader two different mental models of
 * the same section. If you add a screen, add it to both.
 */

type Section = {
  readonly href: string;
  readonly label: string;
  readonly detail: string;
  readonly adminOnly?: boolean;
};

const GROUPS: readonly { title: string; blurb: string; sections: readonly Section[] }[] = [
  {
    title: 'Catálogo',
    blurb: 'Quién enseña, dónde, y qué se puede estudiar.',
    sections: [
      {
        href: '/admin/instituciones',
        label: 'Instituciones',
        detail: 'Universidades, institutos superiores, técnicos e IFD.',
      },
      { href: '/admin/sedes', label: 'Sedes', detail: 'Campus y filiales de cada institución.' },
      {
        href: '/admin/carreras',
        label: 'Carreras',
        detail: 'Los conceptos canónicos que agrupan programas — los hubs de SEO.',
      },
      {
        href: '/admin/areas',
        label: 'Áreas',
        detail: 'La taxonomía con que se ordena todo el catálogo.',
      },
      {
        href: '/admin/programas',
        label: 'Programas',
        detail: 'Lo que cada institución ofrece bajo el nombre con que fue habilitado.',
      },
      {
        href: '/admin/ofertas',
        label: 'Ofertas',
        detail: 'Programa × sede × modalidad × turno — lo que el usuario compara.',
      },
    ],
  },
  {
    title: 'Datos con fecha',
    blurb: 'Todo lo que envejece y hay que volver a verificar.',
    sections: [
      {
        href: '/admin/aranceles',
        label: 'Aranceles',
        detail:
          'Matrícula, cuota y derecho de examen. Pasados 12 meses siguen a la vista, con la fecha de verificación y el aviso de dato desactualizado.',
      },
      {
        href: '/admin/acreditaciones',
        label: 'Acreditaciones',
        detail: 'La cuña del producto. Sin fuente no hay insignia.',
      },
      {
        href: '/admin/admisiones',
        label: 'Convocatorias',
        detail: 'De acá sale el estado de inscripción de cada oferta.',
      },
      {
        href: '/admin/frescura',
        label: 'Frescura',
        detail: 'Qué se venció, qué está por vencer, y la reverificación en lote.',
      },
    ],
  },
  {
    title: 'Cola de trabajo',
    blurb: 'Lo que espera una decisión tuya.',
    sections: [
      {
        href: '/admin/moderacion',
        label: 'Moderación',
        detail: 'Lo que el importador no puede escribir solo espera tu decisión.',
      },
      {
        href: '/admin/disputas',
        label: 'Disputas',
        detail: 'Cuando una institución no está de acuerdo con un dato publicado.',
      },
      {
        href: '/admin/reclamos',
        label: 'Reclamos',
        detail: 'Quién dice ser dueño de un perfil, y con qué prueba.',
      },
    ],
  },
  {
    title: 'Negocio',
    blurb: 'Quién paga, por qué plan, y si algo se está moviendo.',
    sections: [
      {
        href: '/admin/suscripciones',
        label: 'Suscripciones',
        detail: 'El plan de cada institución y hasta cuándo corre.',
        adminOnly: true,
      },
      {
        href: '/admin/facturacion',
        label: 'Facturación',
        detail: 'Lo facturado y lo que vence, para cobrar a tiempo.',
        adminOnly: true,
      },
      {
        href: '/admin/stats',
        label: 'Métricas',
        detail: 'El registro de eventos propio. Sólo números medidos, nunca estimados.',
        adminOnly: true,
      },
    ],
  },
  {
    title: 'Contenido',
    blurb: 'Lo editorial, que se escribe a mano y no llega por importación.',
    sections: [
      { href: '/admin/blog', label: 'Blog', detail: 'Guías y notas que traen tráfico propio.' },
      { href: '/admin/becas', label: 'Becas', detail: 'Ayudas y descuentos, con su fuente.' },
      { href: '/admin/empleos', label: 'Empleos', detail: 'Avisos de trabajo del sector.' },
    ],
  },
  {
    title: 'Sistema',
    blurb: 'Quién entra, qué corrió y con qué permisos.',
    sections: [
      {
        href: '/admin/importaciones',
        label: 'Importaciones',
        detail:
          'Correr CONES, ANEAES y la curaduría desde acá, y ver qué hizo el cron por última vez.',
      },
      {
        href: '/admin/usuarios',
        label: 'Cuentas',
        detail: 'Staff e instituciones. Acá se crean los accesos y se suspenden.',
        adminOnly: true,
      },
      {
        href: '/admin/actividad',
        label: 'Actividad',
        detail: 'Quién cambió qué, con el antes y el después de cada edición.',
      },
      {
        href: '/admin/privacidad',
        label: 'Datos personales',
        detail: 'Pedidos de acceso y borrado, y la purga que promete /legal/privacidad.',
        adminOnly: true,
      },
    ],
  },
] as const;

export default async function AdminPage() {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }
  const isAdmin = hasRole(user, ['admin']);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-ink text-2xl font-bold">Admin</h1>
        <p className="text-muted max-w-prose text-sm">
          Todo el catálogo, los datos con fecha de verificación y la cola de moderación de las
          importaciones.
        </p>
      </div>

      {GROUPS.map((group) => {
        const sections = group.sections.filter((section) => isAdmin || !section.adminOnly);
        if (sections.length === 0) return null;

        return (
          <section key={group.title} className="flex flex-col gap-4">
            <div>
              <h2 className="text-ink text-lg font-semibold">{group.title}</h2>
              <p className="text-muted text-sm">{group.blurb}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sections.map((section) => (
                <a
                  key={section.href}
                  href={section.href}
                  className="border-border bg-surface hover:border-border-strong flex flex-col gap-1 rounded-md border p-5"
                >
                  <span className="text-ink font-medium">{section.label}</span>
                  <span className="text-muted text-sm">{section.detail}</span>
                </a>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
