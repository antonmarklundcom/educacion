import { Skeleton } from '@/components/ui';

/**
 * The Suspense fallback for every public route — and, until PR-53, the largest
 * source of layout shift on the site.
 *
 * Every public page is `force-dynamic` (`architecture.md` §3), so Next streams:
 * the shell — header, this fallback, footer — paints first, and the real
 * `<main>` replaces the fallback when the query returns. With a ~200 px
 * skeleton in a full-height layout the footer painted *inside* the viewport and
 * was then pushed down by the arriving content. Measured on a throttled mobile
 * profile that is a CLS of 0.235 on `/carreras` and 0.556 on `/acreditacion`
 * against a 0.1 budget, on every first visit (`architecture.md` §36).
 *
 * So the fallback reserves the space it is standing in for. `min-h-screen`
 * pushes the footer past the fold in the fallback frame, which is where it is
 * once the content arrives too — nothing visible moves. The skeleton bars stay
 * a plausible page-heading shape rather than growing to fill it: the reserved
 * box is structural, not decorative.
 */
export default function Loading() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 px-4 py-24">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </main>
  );
}
