/**
 * The institution directory's public surface — the same shape as
 * `src/lib/search/index.ts`: components import from here and receive plain
 * typed objects, never a Drizzle row (CLAUDE.md rule 5).
 *
 * Note what is *not* here: nothing that reads a program, a price or an
 * accreditation. Those still come from `searchPrograms()`, which is the only
 * place the 12-month arancel rule and the accreditation precedence rule are
 * applied. This module knows about institutions and counts, and nothing else.
 */

export {
  getInstitutionBySlug,
  getWhatsappNumbers,
  listInstitutions,
  type InstitutionCounts,
  type InstitutionProfile,
  type InstitutionSummary,
} from '@/db/queries/institutions';
