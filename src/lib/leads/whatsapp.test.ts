import { describe, expect, it } from 'vitest';

import { whatsappHref, whatsappPrefill } from './whatsapp';

const base = {
  programName: 'Medicina',
  institutionShort: 'UNA',
};

describe('whatsappHref', () => {
  it('builds a wa.me link with the program pre-filled', () => {
    const href = whatsappHref({ ...base, whatsappE164: '+595981123456' });
    expect(href).not.toBeNull();
    expect(href!.startsWith('https://wa.me/595981123456?text=')).toBe(true);
    expect(decodeURIComponent(href!.split('text=')[1])).toContain('Medicina');
  });

  it('returns null when the institution published no number — never a guess', () => {
    for (const value of [null, undefined, '', '   ', 'consultar']) {
      expect(whatsappHref({ ...base, whatsappE164: value }), String(value)).toBeNull();
    }
  });

  it('normalises whatever spelling the institution record holds', () => {
    expect(whatsappHref({ ...base, whatsappE164: '0981 123 456' })).toBe(
      whatsappHref({ ...base, whatsappE164: '+595981123456' }),
    );
  });
});

describe('whatsappPrefill', () => {
  it('names the carrera and the source, and asserts nothing else', () => {
    const text = whatsappPrefill({ ...base, pageUrl: 'https://educacion.com.py/x' });
    expect(text).toContain('Medicina');
    expect(text).toContain('UNA');
    expect(text).toContain('https://educacion.com.py/x');
  });

  it('works without a page URL', () => {
    expect(whatsappPrefill(base)).toContain('educacion.com.py');
  });
});
