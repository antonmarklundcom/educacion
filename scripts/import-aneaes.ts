/**
 * `npm run import:aneaes`
 *
 * Captures accredited-program records from datos.gov.py (preferred, since it
 * is structured) and the ANEAES listing (fallback) into `source_records`.
 *
 * Raw layer only. Rows arrive carrying the source's own status wording and a
 * `citable` flag; mapping those onto our accreditation enum, and refusing to
 * write a positive status without a resolution number or source URL, is PR-06.
 *
 * See `scripts/import-source.ts` for flags (`--dry-run`, `--file`, `--url`).
 */

import { collectAneaes } from '../src/lib/ingest/sources';
import { main } from './import-source';

main('ANEAES', collectAneaes);
