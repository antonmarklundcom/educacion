/** Spanish labels the admin forms need that `lib/search/labels.ts` has no reason to carry. */

import type { PublicationStatus } from './validation';

export const STATUS_LABELS: Record<PublicationStatus, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
};
