import { PagePlaceholder } from '@/components/layout/PagePlaceholder';

export default async function ProgramaPage({
  params,
}: {
  params: Promise<{ instSlug: string; programSlug: string }>;
}) {
  const { instSlug, programSlug } = await params;
  return <PagePlaceholder title={programSlug} detail={`Programa de ${instSlug}.`} />;
}
