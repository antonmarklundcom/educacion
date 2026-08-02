import { PagePlaceholder } from '@/components/layout/PagePlaceholder';

export default async function AreaPage({ params }: { params: Promise<{ areaSlug: string }> }) {
  const { areaSlug } = await params;
  return <PagePlaceholder title={areaSlug} detail="Carreras de esta área." />;
}
