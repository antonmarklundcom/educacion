import { notFound } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  Input,
  Pagination,
  RangeSlider,
  Select,
  Skeleton,
  Tag,
} from '@/components/ui';

export const metadata = {
  robots: { index: false, follow: false },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-ink text-lg font-semibold">{title}</h2>
      <div className="flex flex-wrap items-center gap-4">{children}</div>
    </section>
  );
}

/** Dev-only inventory of every design-system primitive in every state. Never linked in nav. */
export default function KitchenSinkPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-12 p-8">
      <h1 className="text-ink text-3xl font-bold">Kitchen sink</h1>

      <Section title="Button">
        <Button variant="primary">Solicitar info</Button>
        <Button variant="secondary">Compará</Button>
        <Button variant="ghost">Ver más</Button>
        <Button variant="primary" disabled>
          Deshabilitado
        </Button>
        <Button variant="primary" href="#">
          Como enlace
        </Button>
      </Section>

      <Section title="Badge">
        <Badge tone="ok" dot>
          Inscripciones abiertas
        </Badge>
        <Badge tone="warn" dot>
          Próximamente
        </Badge>
        <Badge tone="danger" dot>
          Inscripciones cerradas
        </Badge>
        <Badge tone="ok">✓ Acreditada ANEAES</Badge>
        <Badge tone="warn">En proceso de acreditación</Badge>
        <Badge tone="info">Habilitada CONES</Badge>
        <Badge tone="neutral">Sin datos de acreditación</Badge>
        <Badge tone="accent">Perfil verificado</Badge>
        <Badge tone="neutral">Destacado</Badge>
      </Section>

      <Section title="Chip">
        <Chip>Gestión privada</Chip>
        <Chip selected>Gestión pública</Chip>
      </Section>

      <Section title="Tag">
        <Tag>Salud</Tag>
        <Tag>Ingeniería</Tag>
      </Section>

      <Section title="Card">
        <Card className="w-64">
          <p className="text-body text-sm">Contenido de tarjeta.</p>
        </Card>
      </Section>

      <Section title="Checkbox">
        <Checkbox id="ks-checkbox-1" label="Sin marcar" />
        <Checkbox id="ks-checkbox-2" label="Marcado" defaultChecked />
      </Section>

      <Section title="Select">
        <Select id="ks-select" label="Ciudad" defaultValue="">
          <option value="" disabled>
            Elegí una ciudad
          </option>
          <option value="asuncion">Asunción</option>
          <option value="ciudad-del-este">Ciudad del Este</option>
        </Select>
      </Section>

      <Section title="Input">
        <Input id="ks-input" label="Buscar" placeholder="Medicina, UNA, Asunción…" />
      </Section>

      <Section title="RangeSlider">
        <RangeSlider id="ks-range" label="Arancel máximo" min={0} max={100} defaultValue={50} />
      </Section>

      <Section title="Skeleton">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 w-24" />
      </Section>

      <Section title="Pagination">
        <Pagination currentPage={4} totalPages={12} buildHref={(page) => `?page=${page}`} />
      </Section>
    </main>
  );
}
