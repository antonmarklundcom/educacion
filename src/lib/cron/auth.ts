/**
 * The one check every `/api/cron/[job]` route makes before doing anything
 * (`architecture.md` §10: "All guarded by `CRON_SECRET` in a header").
 *
 * hPanel cron calls these with a plain `curl`, so the check is a constant
 * string compare against one header — no signing, no timestamp window. That
 * is deliberate: the secret is long, lives only in hPanel and the shell that
 * sets it, and is never sent anywhere else, so replay is not the threat model
 * a cron endpoint on a single Hostinger slot needs to defend against.
 */

const HEADER = 'x-cron-secret';

export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get(HEADER) === secret;
}
