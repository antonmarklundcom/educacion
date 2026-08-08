import type { ActivityEntry } from '@/db/queries/activity-log';
import { diff } from '@/db/queries/activity-log';
import { formatDate } from '@/lib/format';

const ACTION_LABELS: Record<string, string> = {
  create: 'creó',
  update: 'editó',
  archive: 'archivó',
  restore: 'restauró',
  upload: 'subió un archivo a',
  publish: 'publicó',
  verify: 'verificó',
  approve: 'aprobó',
  reject: 'rechazó',
  submit: 'envió a revisión',
};

/**
 * `activity_log`, rendered. Server component.
 *
 * It shows *which fields* changed rather than the raw JSON: "editó institución
 * #12 — nameShort, website" is the sentence an operator can act on, and the
 * full before/after stays in the table for the case where somebody needs it.
 */
export function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-muted text-sm">Todavía no hay cambios registrados.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry) => {
        const changed = diff(entry.beforeJson, entry.afterJson);
        return (
          <li key={entry.id} className="border-border border-b pb-2 text-sm last:border-b-0">
            <span className="text-ink font-medium">
              {entry.userName ?? entry.userEmail ?? 'Sistema'}
            </span>{' '}
            <span className="text-body">
              {ACTION_LABELS[entry.action] ?? entry.action} {entry.entityType}
              {entry.entityId != null ? ` #${entry.entityId}` : ''}
            </span>
            {changed.length > 0 ? (
              <span className="text-muted"> — {changed.join(', ')}</span>
            ) : null}
            <span className="text-faint block text-xs">{formatDate(entry.createdAt)}</span>
          </li>
        );
      })}
    </ul>
  );
}
