/**
 * `seo.md` §7 — *"every blog post links to at least one money page with
 * descriptive anchor text, no orphans"* — as a test, because it is a rule that
 * is otherwise enforced by remembering.
 */

import { describe, expect, it } from 'vitest';

import { linksToMoneyPage, parsePostInput } from './validation';

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

const base = {
  title: 'Qué mirar antes de elegir una carrera',
  excerpt: 'Tres cosas que conviene chequear antes de inscribirte.',
  authorName: 'Anton Marklund',
  status: 'published',
};

describe('linksToMoneyPage', () => {
  it('accepts a descriptive link to a money page', () => {
    expect(linksToMoneyPage('Mirá [las carreras de medicina](/carreras/medicina).')).toBe(true);
  });

  it('rejects a link with no anchor worth reading', () => {
    expect(linksToMoneyPage('Más info [acá](/carreras/medicina).')).toBe(false);
    expect(linksToMoneyPage('[click](/universidades)')).toBe(false);
  });

  it('does not count an external link, however good the anchor', () => {
    expect(linksToMoneyPage('[el registro del CONES](https://cones.gov.py)')).toBe(false);
  });

  it('does not count a link to a page that is not a destination', () => {
    expect(linksToMoneyPage('[nuestra política de privacidad](/legal/privacidad)')).toBe(false);
  });
});

describe('parsePostInput', () => {
  it('refuses to publish an orphan post', () => {
    const result = parsePostInput(form({ ...base, bodyMd: 'Un texto sin enlaces internos.' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.bodyMd).toMatch(/enlazar al menos una página/);
  });

  it('allows a draft to be unfinished', () => {
    const result = parsePostInput(
      form({ ...base, status: 'draft', bodyMd: 'Todavía no terminé esto.' }),
    );
    expect(result.ok).toBe(true);
  });

  it('publishes when the link is there', () => {
    const result = parsePostInput(
      form({ ...base, bodyMd: 'Compará [aranceles de medicina](/carreras/medicina).' }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe('published');
  });
});
