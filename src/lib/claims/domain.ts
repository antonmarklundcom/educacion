/**
 * The domain-verification rule (PR-22), as a pure function.
 *
 * The question it answers is narrow and it is the whole security decision of
 * the claim flow: **may an email address at this domain be trusted to speak for
 * this institution without a human looking at it?** Everything else in the flow
 * — the token, the mail, the password — only carries that answer around.
 *
 * ### Why this compares against `institutions.website` and nothing else
 *
 * `institutions.website` comes from the CONES register or from our own
 * relevamiento. It is a fact about the institution that we hold *before* anyone
 * asks to claim it, which is what makes it usable as evidence: the claimant
 * cannot influence it. `institutions.email` deliberately is **not** used, even
 * though it is the more obvious field — plenty of registered institutions list a
 * `gmail.com` or a `tigo.com.py` address, and matching against it would let
 * anybody who can open a Gmail account claim that institution. Rule 8 of this
 * file's blocklists exists for exactly that row.
 *
 * ### Three outcomes, and only one of them is automatic
 *
 * - `domain` — the address is on the institution's own domain. The token goes
 *   straight to that mailbox and the claim completes without us.
 * - `admin` — everything else, including the most common case in this dataset:
 *   **no website on file at all.** That is a gap in our data, not evidence
 *   against the claimant, so it routes to a human rather than to a rejection.
 * - there is no third outcome. A claim is never auto-refused on domain grounds,
 *   because "wrong domain" and "we have the wrong website" look identical from
 *   here.
 *
 * ### Free-mail and site-builder domains can never satisfy the check
 *
 * Both sides are screened. If an institution's website is
 * `https://sites.google.com/view/isp-xyz`, the registrable domain is
 * `google.com`, and matching a `@google.com` address against it would be
 * absurd; the same reasoning covers `wixsite.com`, `blogspot.com` and a
 * Facebook page used as a website. And a public suffix is never a domain:
 * `edu.py` is not an institution, so an address at it matches nothing.
 */

/** Free consumer mail, plus the Paraguayan ISP addresses used the same way. */
const PERSONAL_MAIL_DOMAINS = new Set([
  'aol.com',
  'gmail.com',
  'googlemail.com',
  'gmx.com',
  'gmx.net',
  'hotmail.com',
  'hotmail.es',
  'icloud.com',
  'live.com',
  'mail.com',
  'me.com',
  'msn.com',
  'outlook.com',
  'outlook.es',
  'proton.me',
  'protonmail.com',
  'yahoo.com',
  'yahoo.com.ar',
  'yahoo.es',
  'yandex.com',
  'zoho.com',
  // Paraguayan ISPs. An address here belongs to a person, not to an institution.
  'copaco.com.py',
  'personal.com.py',
  'tigo.com.py',
  'telesurf.com.py',
  'vox.com.py',
]);

/**
 * Hosts that publish somebody else's site. An institution whose "website" is one
 * of these has no domain of its own, so there is nothing here to verify against.
 */
const SHARED_HOSTING_DOMAINS = new Set([
  'blogspot.com',
  'business.site',
  'facebook.com',
  'github.io',
  'google.com',
  'instagram.com',
  'jimdofree.com',
  'linktr.ee',
  'netlify.app',
  'vercel.app',
  'weebly.com',
  'wixsite.com',
  'wix.com',
  'wordpress.com',
  'blogger.com',
  'webnode.page',
]);

/**
 * Suffixes nobody owns. Not a full public-suffix list — a dependency, and one
 * whose weekly churn we would have to track — but every suffix a Paraguayan
 * institution's site can plausibly sit under, which is the set that matters
 * here. A domain equal to one of these is treated as no domain at all.
 */
const PUBLIC_SUFFIXES = new Set([
  'py',
  'com.py',
  'edu.py',
  'gov.py',
  'org.py',
  'net.py',
  'mil.py',
  'una.py',
  'com',
  'edu',
  'org',
  'net',
  'int',
  'info',
  'ar',
  'com.ar',
  'edu.ar',
  'br',
  'com.br',
  'edu.br',
  'uy',
  'edu.uy',
  'bo',
  'edu.bo',
]);

/** Deliberately loose: this decides routing, not validity. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export type ClaimRouteReason =
  'domain_match' | 'no_website' | 'domain_mismatch' | 'personal_email' | 'shared_hosting';

export interface ClaimRoute {
  /** `domain` completes without us; `admin` waits for an explicit decision. */
  route: 'domain' | 'admin';
  reason: ClaimRouteReason;
  /** The claimant's domain, lowercased. Stored on the claim row. */
  emailDomain: string;
  /** The institution's, when we have a usable one. */
  institutionDomain: string | null;
}

/** The part after the `@`, lowercased and trimmed. `null` if not email-shaped. */
export function emailDomain(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_SHAPE.test(normalized)) return null;
  const domain = normalized.slice(normalized.lastIndexOf('@') + 1);
  return domain.replace(/\.$/, '') || null;
}

/**
 * The registrable-ish host of a stored website.
 *
 * `institutions.website` is entered by hand and by importers, so it arrives as
 * `uni.edu.py`, `www.uni.edu.py/`, `HTTPS://UNI.EDU.PY:443/carreras` and
 * everything in between. `www.` is stripped because it is not a different
 * organisation; nothing else is, because `admision.uni.edu.py` genuinely is a
 * host under the institution's own domain and the match below handles it.
 */
export function websiteDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  const raw = website.trim();
  if (!raw) return null;

  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname;
  } catch {
    return null;
  }

  const domain = host
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.$/, '');
  if (!domain || !domain.includes('.')) return null;
  return domain;
}

/** True for consumer mail and for ISP mailboxes, on either side of the check. */
export function isPersonalMailDomain(domain: string | null): boolean {
  return domain != null && PERSONAL_MAIL_DOMAINS.has(domain);
}

/** True when the "site" is hosted on somebody else's domain. */
export function isSharedHostingDomain(domain: string | null): boolean {
  if (!domain) return false;
  if (SHARED_HOSTING_DOMAINS.has(domain)) return true;
  // `uni.wixsite.com` is as much a shared host as `wixsite.com` itself.
  return [...SHARED_HOSTING_DOMAINS].some((shared) => domain.endsWith(`.${shared}`));
}

/** True when the string is a suffix nobody registers under their own name. */
export function isPublicSuffix(domain: string | null): boolean {
  return domain != null && PUBLIC_SUFFIXES.has(domain);
}

/**
 * Whether two domains belong to the same organisation.
 *
 * Equal, or one is a subdomain of the other: an institution whose site is
 * `uni.edu.py` sends mail from `@uni.edu.py` and from `@admision.uni.edu.py`,
 * and one whose site is `admision.uni.edu.py` still sends mail from
 * `@uni.edu.py`. The subdomain relation is only safe because the shorter side
 * is separately checked against the public-suffix and personal-mail lists —
 * without that, `@edu.py` would "contain" every institution in the country.
 */
export function domainsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  return a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/**
 * The rule. Pure, so every case below is a unit test rather than a click-through.
 */
export function routeClaim(email: string, website: string | null | undefined): ClaimRoute {
  const applicant = emailDomain(email) ?? '';
  const site = websiteDomain(website);

  /** A domain we could never verify anything against, whichever side it is on. */
  const unusable = (domain: string | null): boolean =>
    domain == null ||
    isPublicSuffix(domain) ||
    isPersonalMailDomain(domain) ||
    isSharedHostingDomain(domain);

  // Checked before anything else, so that an institution with a free-mail
  // domain on file can never be matched by an address at that same domain.
  if (isPersonalMailDomain(applicant)) {
    return {
      route: 'admin',
      reason: 'personal_email',
      emailDomain: applicant,
      institutionDomain: unusable(site) ? null : site,
    };
  }

  if (site == null) {
    return {
      route: 'admin',
      reason: 'no_website',
      emailDomain: applicant,
      institutionDomain: null,
    };
  }

  if (isPersonalMailDomain(site) || isSharedHostingDomain(site)) {
    return {
      route: 'admin',
      reason: 'shared_hosting',
      emailDomain: applicant,
      institutionDomain: null,
    };
  }

  // A public suffix on either side is not a domain, and a malformed address has
  // none at all. All three end up in front of a human.
  if (!applicant || isPublicSuffix(applicant) || isPublicSuffix(site)) {
    return {
      route: 'admin',
      reason: 'domain_mismatch',
      emailDomain: applicant,
      institutionDomain: isPublicSuffix(site) ? null : site,
    };
  }

  return domainsMatch(applicant, site)
    ? { route: 'domain', reason: 'domain_match', emailDomain: applicant, institutionDomain: site }
    : {
        route: 'admin',
        reason: 'domain_mismatch',
        emailDomain: applicant,
        institutionDomain: site,
      };
}

/** What the public form tells the claimant, in voseo. Never blames them. */
export const ROUTE_EXPLANATION: Record<ClaimRouteReason, string> = {
  domain_match: 'Tu correo está en el dominio del sitio oficial de la institución.',
  no_website:
    'No tenemos el sitio web de esta institución registrado, así que no podemos verificar el dominio de tu correo automáticamente.',
  domain_mismatch:
    'Tu correo no está en el dominio del sitio que tenemos registrado para esta institución.',
  personal_email:
    'Usaste un correo personal (Gmail, Hotmail y similares). No podemos verificar con eso quién sos.',
  shared_hosting:
    'El sitio que tenemos registrado para esta institución está alojado en un dominio compartido, así que no sirve para verificar tu correo.',
};
