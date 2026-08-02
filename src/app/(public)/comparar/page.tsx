import type { Metadata } from 'next';
import { PagePlaceholder } from '@/components/layout/PagePlaceholder';

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function CompararPage() {
  return <PagePlaceholder title="Comparar" detail="Comparación de carreras seleccionadas." />;
}
