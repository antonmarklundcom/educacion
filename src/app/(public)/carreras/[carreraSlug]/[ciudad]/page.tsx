import { PagePlaceholder } from '@/components/layout/PagePlaceholder';

export default async function CarreraCiudadPage({
  params,
}: {
  params: Promise<{ carreraSlug: string; ciudad: string }>;
}) {
  const { carreraSlug, ciudad } = await params;
  return <PagePlaceholder title={`${carreraSlug} — ${ciudad}`} />;
}
