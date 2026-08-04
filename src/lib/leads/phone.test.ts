import { describe, expect, it } from 'vitest';

import { formatParaguayanPhone, parseParaguayanPhone, whatsappDigits } from './phone';

describe('parseParaguayanPhone', () => {
  it('normalises every spelling of the same mobile to one E.164 string', () => {
    const spellings = [
      '0981123456',
      '0981 123 456',
      '(0981) 123-456',
      '+595 981 123 456',
      '+595981123456',
      '595981123456',
      '00595981123456',
      '+595 (0)981 123456',
    ];

    // If these diverged the per-phone rate limit would count one spammer as
    // eight different people.
    const results = spellings.map((raw) => parseParaguayanPhone(raw).e164);
    expect(new Set(results)).toEqual(new Set(['+595981123456']));
  });

  it('accepts landlines and marks them as not mobile', () => {
    const parsed = parseParaguayanPhone('021 123 456');
    expect(parsed.ok).toBe(true);
    expect(parsed.e164).toBe('+59521123456');
    expect(parsed.isMobile).toBe(false);
  });

  it('rejects anything that is not a Paraguayan number rather than guessing', () => {
    for (const raw of [
      '',
      '   ',
      '123',
      'no soy un teléfono',
      '+46701234567', // Swedish — a real number, not ours
      '098112345', // one digit short
      '09811234567', // one digit long
      '+1 555 0100',
    ]) {
      expect(parseParaguayanPhone(raw).ok, raw).toBe(false);
    }
  });

  it('never returns an e164 when it failed', () => {
    expect(parseParaguayanPhone('nope').e164).toBeNull();
  });
});

describe('whatsappDigits', () => {
  it('drops the plus and nothing else', () => {
    expect(whatsappDigits('+595981123456')).toBe('595981123456');
  });

  it('returns null rather than inventing a number', () => {
    expect(whatsappDigits(null)).toBeNull();
    expect(whatsappDigits(undefined)).toBeNull();
    expect(whatsappDigits('')).toBeNull();
    expect(whatsappDigits('not a number')).toBeNull();
  });
});

describe('formatParaguayanPhone', () => {
  it('renders a mobile the way a Paraguayan writes it', () => {
    expect(formatParaguayanPhone('+595981123456')).toBe('0981 123 456');
  });

  it('returns the input unchanged when it cannot parse it', () => {
    expect(formatParaguayanPhone('whatever')).toBe('whatever');
  });
});
