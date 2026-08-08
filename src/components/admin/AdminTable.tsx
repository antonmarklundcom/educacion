import { Pagination } from '@/components/ui';
import { Badge } from '@/components/ui';

/**
 * The one table/list component every `/admin/*` index page uses (PR-19
 * acceptance criteria). Columns are data, rows are plain objects — an entity
 * gains a list page by describing its columns, not by writing a table.
 *
 * Server component: pagination is a link (`Pagination` already is), and
 * nothing here needs client state.
 */

export interface AdminColumn<Row> {
  header: string;
  cell: (row: Row) => React.ReactNode;
  /** IBM Plex Mono for anything numeric — design-system.md §3. */
  numeric?: boolean;
}

export interface AdminTableProps<Row extends { id: number }> {
  columns: AdminColumn<Row>[];
  rows: Row[];
  editHref: (row: Row) => string;
  emptyLabel: string;
  page: number;
  totalPages: number;
  buildPageHref: (page: number) => string;
}

export function AdminTable<Row extends { id: number }>({
  columns,
  rows,
  editHref,
  emptyLabel,
  page,
  totalPages,
  buildPageHref,
}: AdminTableProps<Row>) {
  if (rows.length === 0) {
    return (
      <p className="border-border bg-card-alt text-muted rounded-md border px-4 py-6 text-sm">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="border-border overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-border bg-card-alt border-b text-left">
              {columns.map((column) => (
                <th key={column.header} className="text-muted px-4 py-3 font-medium">
                  {column.header}
                </th>
              ))}
              <th className="text-muted px-4 py-3 text-right font-medium">
                <span className="sr-only">Editar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-border hover:bg-card-alt border-b last:border-0">
                {columns.map((column) => (
                  <td
                    key={column.header}
                    className={
                      column.numeric ? 'text-body px-4 py-3 font-mono' : 'text-body px-4 py-3'
                    }
                  >
                    {column.cell(row)}
                  </td>
                ))}
                <td className="px-4 py-3 text-right">
                  <a
                    href={editHref(row)}
                    className="text-ink text-sm font-medium underline underline-offset-4"
                  >
                    Editá
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination currentPage={page} totalPages={totalPages} buildHref={buildPageHref} />
    </div>
  );
}

/** A small status pill for the `status` column — draft/published/archived, worded in Spanish. */
export function StatusBadge({ status }: { status: 'draft' | 'published' | 'archived' }) {
  if (status === 'published') return <Badge tone="ok">Publicado</Badge>;
  if (status === 'archived') return <Badge tone="neutral">Archivado</Badge>;
  return <Badge tone="warn">Borrador</Badge>;
}
