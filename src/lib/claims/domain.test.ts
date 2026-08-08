/**
 * The domain rule (PR-22). This file is the acceptance criterion
 *
 * > *claim only completes from an email on the institution's verified domain,
 * > or after explicit admin approval*
 *
 * turned into a truth table. Every case that routes to `admin` is a case where
 * nothing is granted without a human, so the dangerous direction is a `domain`
 * verdict that should not have been one — which is what most of these assert.
 */

import { describe, expect, it } from 'vitest';

import { emailDomain, routeClaim, websiteDomain, domainsMatch } from './domain';

const UNI = 'https://www.uni.edu.py/';

describe('emailDomain', () => {
  it('lowercases, trims and takes the last @ segment', () => {
    expect(emailDomain('  Rectorado@UNI.edu.py ')).toBe('uni.edu.py');
  });

  it('rejects anything that is not email-shaped', () => {
    expect(emailDomain('rectorado')).toBeNull();
    expect(emailDomain('rectorado@localhost')).toBeNull();
    expect(emailDomain('a@b@uni.edu.py')).toBeNull();
    expect(emailDomain('')).toBeNull();
    expect(emailDomain('rectorado@ uni.edu.py')).toBeNull();
  });
});

describe('websiteDomain', () => {
  it('normalizes the shapes `institutions.website` actually holds', () => {
    expect(websiteDomain('uni.edu.py')).toBe('uni.edu.py');
    expect(websiteDomain('https://www.uni.edu.py')).toBe('uni.edu.py');
    expect(websiteDomain('HTTP://UNI.EDU.PY:8080/carreras?x=1')).toBe('uni.edu.py');
    expect(websiteDomain('  https://admision.uni.edu.py/  ')).toBe('admision.uni.edu.py');
  });

  it('is null for the empty and the unusable', () => {
    expect(websiteDomain(null)).toBeNull();
    expect(websiteDomain('')).toBeNull();
    expect(websiteDomain('   ')).toBeNull();
    expect(websiteDomain('no es una url')).toBeNull();
    // A host with no dot is not a domain we can verify anything against.
    expect(websiteDomain('http://localhost')).toBeNull();
  });
});

describe('domainsMatch', () => {
  it('accepts equality and either subdomain direction', () => {
    expect(domainsMatch('uni.edu.py', 'uni.edu.py')).toBe(true);
    expect(domainsMatch('admision.uni.edu.py', 'uni.edu.py')).toBe(true);
    expect(domainsMatch('uni.edu.py', 'admision.uni.edu.py')).toBe(true);
  });

  /** The bug a naive `endsWith` would have: `notuni.edu.py` ends with `uni.edu.py`. */
  it('does not match on a bare suffix without the dot boundary', () => {
    expect(domainsMatch('notuni.edu.py', 'uni.edu.py')).toBe(false);
    expect(domainsMatch('uni.edu.py.attacker.com', 'uni.edu.py')).toBe(false);
  });
});

describe('routeClaim — the automatic path', () => {
  it('verifies an address on the institution’s own domain', () => {
    const route = routeClaim('rectorado@uni.edu.py', UNI);
    expect(route.route).toBe('domain');
    expect(route.reason).toBe('domain_match');
    expect(route.institutionDomain).toBe('uni.edu.py');
  });

  it('verifies a subdomain of it — faculties do have their own mail', () => {
    expect(routeClaim('decano@ing.uni.edu.py', UNI).route).toBe('domain');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(routeClaim('  RECTORADO@Uni.Edu.Py  ', 'UNI.EDU.PY').route).toBe('domain');
  });

  it('accepts plus-addressing, which is still the same mailbox domain', () => {
    expect(routeClaim('rectorado+educacion@uni.edu.py', UNI).route).toBe('domain');
  });
});

describe('routeClaim — free-mail domains can never satisfy the check', () => {
  it.each([
    'alguien@gmail.com',
    'alguien@hotmail.com',
    'alguien@yahoo.com',
    'alguien@outlook.com',
    'alguien@icloud.com',
    'alguien@tigo.com.py',
    'alguien@personal.com.py',
  ])('%s goes to the admin queue', (email) => {
    const route = routeClaim(email, UNI);
    expect(route.route).toBe('admin');
    expect(route.reason).toBe('personal_email');
  });

  /**
   * The case the brief calls out: an institution whose *own* record carries a
   * free-mail domain must not become claimable by anybody with an account
   * there. The personal-mail check runs before the comparison for this reason.
   */
  it('does not match even when the institution has that domain on file', () => {
    const route = routeClaim('cualquiera@gmail.com', 'https://gmail.com');
    expect(route.route).toBe('admin');
    expect(route.reason).toBe('personal_email');
    expect(route.institutionDomain).toBeNull();
  });

  it('and not when the institution’s "website" is a free-mail domain either', () => {
    expect(routeClaim('rectorado@uni.edu.py', 'http://hotmail.com').route).toBe('admin');
  });
});

describe('routeClaim — shared hosting is not a domain', () => {
  it.each([
    'https://sites.google.com/view/isp-xyz',
    'https://isp-xyz.wixsite.com/inicio',
    'https://ispxyz.wordpress.com',
    'https://www.facebook.com/ispxyz',
    'https://ispxyz.blogspot.com',
  ])('%s routes to review', (website) => {
    const route = routeClaim('alguien@google.com', website);
    expect(route.route).toBe('admin');
    expect(route.institutionDomain).toBeNull();
  });
});

describe('routeClaim — a public suffix is not a domain', () => {
  it('an address at edu.py matches no institution', () => {
    expect(routeClaim('alguien@edu.py', UNI).route).toBe('admin');
  });

  it('and an institution whose stored site is a bare suffix verifies nobody', () => {
    const route = routeClaim('rectorado@edu.py', 'http://edu.py');
    expect(route.route).toBe('admin');
    expect(route.institutionDomain).toBeNull();
  });
});

describe('routeClaim — the fallback, which is a queue and never a rejection', () => {
  /**
   * The most common row in this dataset. A missing website is a gap in *our*
   * data; refusing the claim would punish the institution for it.
   */
  it('no website on file routes to admin approval, not to a refusal', () => {
    const route = routeClaim('rectorado@uni.edu.py', null);
    expect(route.route).toBe('admin');
    expect(route.reason).toBe('no_website');
    expect(route.institutionDomain).toBeNull();
  });

  it('an unparseable website is the same case', () => {
    expect(routeClaim('rectorado@uni.edu.py', 'no es una url').reason).toBe('no_website');
  });

  it('a different domain routes to admin approval', () => {
    const route = routeClaim('rectorado@otrauni.edu.py', UNI);
    expect(route.route).toBe('admin');
    expect(route.reason).toBe('domain_mismatch');
    // The admin still sees what we hold, which is how they decide.
    expect(route.institutionDomain).toBe('uni.edu.py');
  });

  it('a lookalike domain does not verify', () => {
    expect(routeClaim('rectorado@uni-edu.py', UNI).route).toBe('admin');
    expect(routeClaim('rectorado@uni.edu.py.attacker.com', UNI).route).toBe('admin');
  });

  it('a malformed address never verifies', () => {
    const route = routeClaim('no-es-un-correo', UNI);
    expect(route.route).toBe('admin');
    expect(route.emailDomain).toBe('');
  });
});
