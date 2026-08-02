import { PagePlaceholder } from '@/components/layout/PagePlaceholder';

export default async function InstitucionPage({
  params,
}: {
  params: Promise<{ instSlug: string }>;
}) {
  const { instSlug } = await params;
  return <PagePlaceholder title={instSlug} detail="Perfil de institución." />;
}
