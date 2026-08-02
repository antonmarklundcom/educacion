import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-24">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </main>
  );
}
