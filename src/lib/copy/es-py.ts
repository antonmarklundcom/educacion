/**
 * The `es-PY` message catalog — every UI string on the migrated surfaces.
 *
 * This is data, not logic. A value is either a string or a small function that
 * interpolates its arguments; nothing here branches on anything but its own
 * parameters, and nothing here reads the database, the session or the request.
 *
 * ### Why the values are Paraguayan and stay that way
 *
 * CLAUDE.md rule 8: voseo, `Gs. 1.450.000`, `contactanos` and not
 * `contáctanos`. `copy.test.ts` scans every leaf for the tuteo forms that keep
 * creeping back in, so a regression is a red test rather than a native reader
 * wincing at the page.
 *
 * ### What does not live here
 *
 * The `copy.ts` generators under `src/lib` — career and city intros — are out of
 * scope on purpose (`pr-plan.md` PR-47). They are data-provenance sentences
 * with Spanish grammar as their logic (agreement, elision, pluralisation), and
 * a catalog of fragments would make them worse, not more translatable. They
 * move when a real second locale forces the question.
 *
 * Error and status messages the **server** also produces — `LEAD_ERROR_MESSAGES`
 * and `MINOR_NOTICE` in `@/lib/leads/contract`, `SORT_LABELS` in `@/lib/search`
 * — stay with the contract that defines their keys. Splitting the label from
 * the enum it is keyed by would let the two drift.
 */

import { brandCopy } from './brand';
import { browseCopy } from './browse';
import { filterSheetCopy } from './filter-sheet';
import { footerCopy } from './footer';
import { leadCopy } from './lead';
import { navCopy } from './nav';
import { totalCostCopy } from './total-cost';

export const esPY = {
  brand: brandCopy,
  nav: navCopy,
  footer: footerCopy,
  browse: { ...browseCopy, filterSheet: filterSheetCopy },
  lead: leadCopy,
  totalCost: totalCostCopy,
} as const;
