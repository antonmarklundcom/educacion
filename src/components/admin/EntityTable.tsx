import Link from 'next/link';

import { Pagination } from '@/components/ui';
import type { EntityDef, ReferenceKind } from '@/lib/admin/entities';
import { labelForValue } from '@/lib/admin/entities';
import type { ReferenceOption } from '@/db/queries/admin';

/**
 * The shared list for every admin entity (PR-19's "shared table/list component").
 *
 * Server component: it renders a table and links. The search box and the filter
 * are a plain GET form, the same "the honest HTML for changing state is
 * navigation" decision `design-system.md` §9 settled for the public filter rail
 * — so the admin list is shareable by URL and costs no client JavaScript.
 */
export interface EntityTableProps {
  def: EntityDef;
  rows: Array<Record<string, unknown>>;
  total: number;
  page: number;
  perPage: number;
  q?: string;
  filterValue?: number | null;
  references: Record<ReferenceKind, ReferenceOption[]>;
  basePath: string;
}

function referenceLabel(options: ReferenceOption[], id: unknown): string {
  if (typeof id !== 'number') return '—';
  return options.find((option) => option.id === id)?.label ?? `#${id}`;
}

export function EntityTable({
  def,
  rows,
  total,
  page,
  perPage,
  q,
  filterValue,
  references,
  basePath,
}: EntityTableProps) {
  const fieldByName = new Map(def.fields.map((field) => [field.name, field]));
  const searchable = def.key !== 'ofertas';

  return (
    <section className="flex flex-col gap-4">
      <form method="get" className="flex flex-wrap items-end gap-3">
        {searchable ? (
          <label className="text-body flex flex-col gap-1.5 text-sm">
            Buscar
            <input
              type="search"
              name="q"
              defaultValue={q ?? ''}
              placeholder={`Buscá en ${def.plural.toLowerCase()}`}
              className="border-border-strong bg-surface text-ink placeholder:text-faint focus-visible:ring-ink min-h-11 w-64 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
            />
          </label>
        ) : null}

        {def.listFilter ? (
          <label className="text-body flex flex-col gap-1.5 text-sm">
            {fieldByName.get(def.listFilter.field)?.label ?? 'Filtrar'}
            <select
              name="filtro"
              defaultValue={filterValue != null ? String(filterValue) : ''}
              className="border-border-strong bg-surface text-ink focus-visible:ring-ink min-h-11 w-72 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              <option value="">Todas</option>
              {references[def.listFilter.reference].map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button
          type="submit"
          className="border-border-strong bg-surface text-ink hover:bg-card-alt min-h-11 rounded-md border px-4 text-sm font-medium"
        >
          Aplicar
        </button>
      </form>

      <p className="text-muted text-sm">
        {total === 1 ? '1 registro' : `${total.toLocaleString('es-PY')} registros`}
      </p>

      {rows.length === 0 ? (
        <p className="border-border text-body rounded-lg border border-dashed p-6 text-sm">
          No hay {def.plural.toLowerCase()} que coincidan. Probá quitando el filtro o creá una.
        </p>
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead className="bg-card-alt">
              <tr>
                {def.listColumns.map((name) => (
                  <th key={name} scope="col" className="text-ink px-3 py-2 text-left font-semibold">
                    {fieldByName.get(name)?.label ?? name}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 text-right">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)} className="border-border border-t">
                  {def.listColumns.map((name) => {
                    const field = fieldByName.get(name);
                    const value = row[name];
                    return (
                      <td key={name} className="text-body px-3 py-2 align-top">
                        {field?.reference
                          ? referenceLabel(references[field.reference], value)
                          : field
                            ? labelForValue(field, value)
                            : String(value ?? '—')}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right align-top">
                    <Link
                      href={`${basePath}/${String(row.id)}`}
                      className="text-ink text-sm font-medium underline underline-offset-4"
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        currentPage={page}
        totalPages={Math.max(1, Math.ceil(total / perPage))}
        buildHref={(target) => {
          const params = new URLSearchParams();
          if (q) params.set('q', q);
          if (filterValue != null) params.set('filtro', String(filterValue));
          if (target > 1) params.set('pagina', String(target));
          const query = params.toString();
          return query ? `${basePath}?${query}` : basePath;
        }}
      />
    </section>
  );
}
