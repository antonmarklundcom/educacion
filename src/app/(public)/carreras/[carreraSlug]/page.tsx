import { PagePlaceholder } from '@/components/layout/PagePlaceholder';

export default async function CarreraHubPage({
  params,
}: {
  params: Promise<{ carreraSlug: string }>;
}) {
  const { carreraSlug } = await params;
  return <PagePlaceholder title={carreraSlug} detail="Ficha de carrera." />;
}
