import { cn } from '@/lib/cn';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  buildHref: (page: number) => string;
  className?: string;
}

/** URL-driven pagination — no client state. Current page uses ink, never the accent. */
export function Pagination({ currentPage, totalPages, buildHref, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPageList(currentPage, totalPages);

  return (
    <nav aria-label="Paginación" className={cn('flex items-center gap-1', className)}>
      <PageLink
        href={currentPage > 1 ? buildHref(currentPage - 1) : undefined}
        disabled={currentPage <= 1}
        aria-label="Página anterior"
      >
        ←
      </PageLink>

      {pages.map((page, index) =>
        page === 'ellipsis' ? (
          <span key={`ellipsis-${index}`} className="text-faint px-2 text-sm" aria-hidden>
            …
          </span>
        ) : (
          <PageLink
            key={page}
            href={buildHref(page)}
            current={page === currentPage}
            aria-current={page === currentPage ? 'page' : undefined}
          >
            {page}
          </PageLink>
        ),
      )}

      <PageLink
        href={currentPage < totalPages ? buildHref(currentPage + 1) : undefined}
        disabled={currentPage >= totalPages}
        aria-label="Página siguiente"
      >
        →
      </PageLink>
    </nav>
  );
}

function getPageList(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set<number>([1, 2, total - 1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);

  const result: (number | 'ellipsis')[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) result.push('ellipsis');
    result.push(page);
    previous = page;
  }
  return result;
}

function PageLink({
  href,
  current,
  disabled,
  children,
  ...props
}: {
  href?: string;
  current?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const classes = cn(
    'inline-flex min-h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm font-medium transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2',
    current && 'bg-ink text-white',
    !current && !disabled && 'text-body hover:bg-card-alt',
    disabled && 'pointer-events-none text-faint',
  );

  if (!href) {
    return (
      <span className={classes} aria-disabled="true">
        {children}
      </span>
    );
  }

  return (
    <a href={href} className={classes} {...props}>
      {children}
    </a>
  );
}
