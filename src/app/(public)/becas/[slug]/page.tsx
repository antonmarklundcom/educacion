import { PagePlaceholder } from '@/components/layout/PagePlaceholder';

export default async function BecaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PagePlaceholder title={slug} />;
}
