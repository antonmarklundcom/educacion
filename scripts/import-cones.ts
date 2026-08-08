/**
 * `npm run import:cones`
 *
 * Captures the CONES habilitación register into `source_records`. Raw layer
 * only: this writes nothing to institutions, programs or accreditations, and
 * it never emits an accreditation status — CONES is authoritative for
 * habilitación, which is a different fact (`plan.md` §2).
 *
 * See `scripts/import-source.ts` for flags (`--dry-run`, `--file`, `--url`,
 * `--max-institutions`, `--no-institutions`).
 *
 * A full network pass is ~65 polite requests. Probe first:
 *
 *   npm run import:cones -- --dry-run --max-institutions 3
 */

import { summarizeConesRecords } from '../src/lib/ingest/parsers/cones';
import { collectCones } from '../src/lib/ingest/sources';
import { main } from './import-source';

main('CONES', collectCones, summarizeConesRecords);
