import type { BECA_TYPE } from '@/db/schema';

/** One wording for the type, shared by the public pages and the admin. */
export const BECA_TYPE_LABELS: Record<(typeof BECA_TYPE)[number], string> = {
  institucional: 'De la institución',
  estatal: 'Estatal',
  privada: 'Privada',
  internacional: 'Internacional',
};
