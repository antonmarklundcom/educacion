/**
 * `/admin/actividad` — the audit log, finally readable (PR-44).
 *
 * `activity_log` has recorded every admin and panel write since PR-19, with a
 * before/after snapshot, and nothing has ever rendered it. That made it a table
 * that costs a write on every mutation and answers no question — including the
 * one it exists for: "who changed this arancel, and what did it say before?"
 *
 * **Read-only, and structurally so.** There is no action file next to this page
 * and `db/queries/admin/activity.ts` exports no write. A log a staff member can
 * edit is not a log.
 *
 * Reading is `editor`; *some payloads* are `admin`, because four entity types
 * have `admin`-only screens of their own and their snapshots carry what those
 * screens carry — as does the actor's email address. **None of that is decided
 * here.** `listActivity` returns the row this reader is allowed to have, so
 * editing this file cannot widen it (CLAUDE.md rule 4); the rule itself is in
 * `src/lib/admin/activity-diff.ts` and the enforcement in
 * `db/queries/admin/activity.ts`.
 *
 * Filters are links, so a filtered view is a URL somebody can paste into a
 * message — the same idiom as `/carreras`, and the reason nothing here is a
 * client component.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, Pagination } from '@/components/ui';
import {
  listActivity,
  listActivityActors,
  listActivityEntityTypes,
  type ActivityEntry,
} from '@/db/queries/admin/activity';
import { diffSnapshots, formatSnapshotValue, type FieldChange } from '@/lib/admin/activity-diff';
import { ENTITY_LABELS, ACTIVITY_ACTION_LABELS } from '@/lib/admin/labels';
import { requireRole } from '@/lib/auth/roles';
import { currentUser } from '@/lib/auth/session';
import { nextAsuncionDay, parseAsuncionDay } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const BASE = '/admin/actividad';

function one(params: Record<string, string | string[] | undefined>, key: string): string {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() ?? '';
}

function href(
  current: Record<string, string>,
  changes: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...changes })) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${BASE}?${query}` : BASE;
}

export default async function ActivityLogPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await currentUser();
  try {
    requireRole(user, ['editor']);
  } catch {
    notFound();
  }
  const params = await searchParams;
  const entityType = one(params, 'entidad');
  const actorRaw = one(params, 'autor');
  const sinceRaw = one(params, 'desde');
  const untilRaw = one(params, 'hasta');
  const pageRaw = Number(one(params, 'pagina'));

  // The dates are read in **Asunción**, not UTC. The rows are rendered in
  // `America/Asuncion` below, so a bound parsed as UTC midnight would be three
  // hours off from the day the operator can actually see: an entry shown as
  // 20/08 22:30 is stored 21/08 01:30Z, and "hasta el 20" would drop it.
  const until = parseAsuncionDay(untilRaw);

  const [{ entries, total, page, totalPages }, entityTypes, actors] = await Promise.all([
    listActivity(user, {
      entityType: entityType || undefined,
      actorId: actorRaw === 'sistema' ? 'system' : Number(actorRaw) || undefined,
      since: parseAsuncionDay(sinceRaw),
      // The control says "hasta", so the day typed is included — which makes
      // the exclusive bound the start of the *next* day.
      until: until ? nextAsuncionDay(until) : undefined,
      page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    }),
    listActivityEntityTypes(user),
    listActivityActors(user),
  ]);

  const current = {
    entidad: entityType,
    autor: actorRaw,
    desde: sinceRaw,
    hasta: untilRaw,
  };
  const hasFilter = Object.values(current).some(Boolean);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-ink text-2xl font-bold">Actividad</h1>
        <p className="text-muted max-w-prose text-sm">
          Cada escritura del admin y del panel, con lo que decía antes y lo que dice ahora. Es un
          registro: no se edita y no se borra desde acá. Lo que cambió una tarifa, quién aprobó un
          reclamo y cuándo se suspendió una cuenta salen todos de esta tabla.
        </p>
      </div>

      <form
        method="get"
        className="border-border bg-card-alt flex flex-col gap-4 rounded-md border p-4"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink font-medium">Entidad</span>
            <select
              name="entidad"
              defaultValue={entityType}
              className="border-border-strong bg-surface text-ink min-h-11 rounded-md border px-3"
            >
              <option value="">Todas</option>
              {entityTypes.map((value) => (
                <option key={value} value={value}>
                  {ENTITY_LABELS[value] ?? value}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink font-medium">Autor</span>
            <select
              name="autor"
              defaultValue={actorRaw}
              className="border-border-strong bg-surface text-ink min-h-11 rounded-md border px-3"
            >
              <option value="">Todos</option>
              <option value="sistema">El sistema (cron)</option>
              {actors.map((actor) => (
                <option key={actor.id} value={String(actor.id)}>
                  {actor.name ?? actor.email ?? `Cuenta #${actor.id}`}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink font-medium">Desde</span>
            <input
              type="date"
              name="desde"
              defaultValue={sinceRaw}
              className="border-border-strong bg-surface text-ink min-h-11 rounded-md border px-3"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink font-medium">Hasta</span>
            <input
              type="date"
              name="hasta"
              defaultValue={untilRaw}
              className="border-border-strong bg-surface text-ink min-h-11 rounded-md border px-3"
            />
          </label>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            className="border-border-strong text-ink hover:bg-surface min-h-11 rounded-md border px-4 text-sm font-medium"
          >
            Filtrar
          </button>
          {hasFilter && (
            <Link href={BASE} className="text-body text-sm hover:underline">
              Limpiar
            </Link>
          )}
          <span className="text-muted ml-auto text-sm">
            {total.toLocaleString('es-PY')} {total === 1 ? 'registro' : 'registros'}
          </span>
        </div>
      </form>

      {entries.length === 0 ? (
        <p className="border-border bg-card-alt text-muted rounded-md border px-4 py-6 text-sm">
          No hay actividad que coincida con ese filtro.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </ol>
      )}

      <Pagination
        className="justify-center"
        currentPage={page}
        totalPages={totalPages}
        buildHref={(target) => href(current, { pagina: target > 1 ? String(target) : undefined })}
      />
    </main>
  );
}

function EntryCard({ entry }: { entry: ActivityEntry }) {
  // Already restricted by `listActivity`; this component renders what it is
  // given and has no say in what that is.
  const changes = diffSnapshots(entry.before, entry.after);

  return (
    <li className="border-border bg-surface flex flex-col gap-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Badge tone={toneFor(entry.action)}>
          {ACTIVITY_ACTION_LABELS[entry.action] ?? entry.action}
        </Badge>
        <span className="text-ink font-medium">
          {ENTITY_LABELS[entry.entityType] ?? entry.entityType}
          {entry.entityId != null && (
            <span className="text-muted font-mono"> #{entry.entityId}</span>
          )}
        </span>
        <span className="text-muted">{actorLabel(entry)}</span>
        <time
          className="text-faint ml-auto font-mono text-xs"
          dateTime={entry.createdAt.toISOString()}
        >
          {entry.createdAt.toLocaleString('es-PY', {
            dateStyle: 'short',
            timeStyle: 'short',
            timeZone: 'America/Asuncion',
          })}
        </time>
      </div>

      {entry.restricted ? (
        <p className="text-muted text-sm">
          El detalle de esta entrada es visible sólo para un admin: la pantalla que administra esta
          entidad también lo es.
        </p>
      ) : changes.length === 0 ? (
        <p className="text-faint text-sm">Sin detalle registrado.</p>
      ) : (
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
          {changes.map((change) => (
            <ChangeRow key={change.key} change={change} />
          ))}
        </dl>
      )}
    </li>
  );
}

function ChangeRow({ change }: { change: FieldChange }) {
  return (
    <>
      <dt className="text-muted font-mono text-xs sm:py-0.5">{change.key}</dt>
      <dd className="text-ink flex flex-wrap items-baseline gap-2 sm:py-0.5">
        {change.kind !== 'added' && (
          <span className="text-faint line-through">{formatSnapshotValue(change.before)}</span>
        )}
        {change.kind === 'changed' && <span className="text-faint">→</span>}
        {change.kind !== 'removed' && <span>{formatSnapshotValue(change.after)}</span>}
      </dd>
    </>
  );
}

/**
 * Who wrote the entry, as far as this reader may know.
 *
 * An editor gets a name or an account number, never an address — the id is
 * enough to tell two actors apart, which is what the column is for.
 */
function actorLabel(entry: ActivityEntry): string {
  if (entry.actorId == null) return 'el sistema';
  return entry.actorName ?? entry.actorEmail ?? `Cuenta #${entry.actorId}`;
}

function toneFor(action: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (action === 'create') return 'ok';
  if (action === 'delete') return 'danger';
  if (action === 'archive') return 'warn';
  return 'neutral';
}
