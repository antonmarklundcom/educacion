/**
 * Where "ver más empleos" goes (PR-32).
 *
 * We are not a job board and are not becoming one (`risks.md` §R-15).
 * trabajo.com.py is where the volume is, so the landing page shows the few
 * real postings we can attribute and then hands the reader over, with the
 * career already in the query. Sending them to a bare home page would waste
 * the intent we just captured.
 *
 * This is a plain outbound search URL — no affiliate parameter, no tracking
 * redirect of our own, nothing that would make the link something other than
 * what it says it is. If an affiliate arrangement ever exists, it is a
 * commercial decision that belongs in `monetization.md`, not a parameter
 * somebody adds here quietly.
 */

export const JOBS_PARTNER_NAME = 'trabajo.com.py';
export const JOBS_PARTNER_HOST = 'https://www.trabajo.com.py';

export function partnerSearchUrl(careerName: string): string {
  return `${JOBS_PARTNER_HOST}/empleos?q=${encodeURIComponent(careerName)}`;
}
