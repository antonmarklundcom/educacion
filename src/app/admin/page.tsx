import type { Metadata } from 'next';

export const metadata: Metadata = { robots: { index: false, follow: false } };

const SECTIONS = [
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
    href: '/admin/programas',
    label: 'Programas',
    detail: 'Lo que cada institución ofrece bajo el nombre con que fue habilitado.',
  },
  {
    href: '/admin/ofertas',
    label: 'Ofertas',
    detail: 'Programa × sede × modalidad × turno — lo que el usuario compara.',
  },
  {
    href: '/admin/aranceles',
    label: 'Aranceles',
    detail: 'Matrícula, cuota y derecho de examen. Se ocultan solos a los 12 meses.',
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
    href: '/admin/moderacion',
    label: 'Moderación',
    detail: 'Lo que el importador no puede escribir solo espera tu decisión.',
  },
  {
    href: '/admin/frescura',
    label: 'Frescura',
    detail: 'Qué se venció, qué está por vencer, y la reverificación en lote.',
  },
] as const;

export default function AdminPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-ink text-2xl font-bold">Admin</h1>
        <p className="text-muted text-sm">
          Todo el catálogo, los datos con fecha de verificación y la cola de moderación de las
          importaciones.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
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
    </main>
  );
}
