/**
 * `npm run import:cones`
 *
 * Captures the CONES habilitación register into `source_records`. Raw layer
 * only: this writes nothing to institutions, programs or accreditations, and
 * it never emits an accreditation status — CONES is authoritative for
 * habilitación, which is a different fact (`plan.md` §2).
 *
 * See `scripts/import-source.ts` for flags (`--dry-run`, `--file`, `--url`).
 */

import { collectCones } from '../src/lib/ingest/sources';
import { main } from './import-source';

main('CONES', collectCones);
