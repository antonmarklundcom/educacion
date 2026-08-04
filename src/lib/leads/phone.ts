/**
 * Paraguayan phone numbers, normalised to E.164.
 *
 * The lead is worthless to the institution if the number cannot be dialled, and
 * a lead stored under two spellings of the same number defeats the per-phone
 * rate limit — so normalisation is a correctness requirement, not tidiness.
 * `+595 981 123 456`, `0981123456` and `(0981) 123-456` are the same person and
 * must produce the same string.
 *
 * **Scope, deliberately narrow.** Only Paraguayan numbers are accepted. A
 * general phone parser is a library (`libphonenumber` is ~250 kb) and this site
 * serves one country; anything that is not a PY number is rejected with a
 * message rather than stored in a shape nobody can call.
 *
 * Structure: country code 595, then a national number of 9 digits whose leading
 * digit is 9 for mobiles (`9xx xxx xxx`) or a 2–4 digit area code for
 * landlines. Nationally both are written with a leading `0`. Mobiles are what
 * a student will give and what an institution will use, so they are the case
 * this is tuned for; landlines are accepted rather than refused.
 *
 * No pure function here touches the network or the database, which is what lets
 * the modal use it for live feedback and the API use it as the authority.
 */

const COUNTRY_CODE = '595';

/** 9xx xxx xxx — every PY mobile. */
const MOBILE = /^9\d{8}$/;

/** Landlines: 2–4 digit area code plus 5–7 subscriber digits, 8–9 total. */
const LANDLINE = /^[2-8]\d{7,8}$/;

export interface PhoneParseResult {
  ok: boolean;
  /** `+5959XXXXXXXX`. Only set when `ok`. */
  e164: string | null;
  isMobile: boolean;
}

const INVALID: PhoneParseResult = { ok: false, e164: null, isMobile: false };

/**
 * Returns the E.164 form, or `ok: false`. Never throws, never guesses a country
 * code for a number that does not look Paraguayan.
 */
export function parseParaguayanPhone(raw: string): PhoneParseResult {
  if (typeof raw !== 'string') return INVALID;

  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 32) return INVALID;

  // Keep digits only; a leading + is implied by what remains.
  let digits = trimmed.replace(/\D/g, '');
  if (digits.length === 0) return INVALID;

  // 00595… international prefix, then 595… country code, then 0… national.
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith(COUNTRY_CODE)) {
    digits = digits.slice(COUNTRY_CODE.length);
    // A number written +595 (0)981… — the trunk zero is not part of E.164.
    if (digits.startsWith('0')) digits = digits.slice(1);
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (MOBILE.test(digits)) {
    return { ok: true, e164: `+${COUNTRY_CODE}${digits}`, isMobile: true };
  }
  if (LANDLINE.test(digits)) {
    return { ok: true, e164: `+${COUNTRY_CODE}${digits}`, isMobile: false };
  }
  return INVALID;
}

/**
 * The digits `wa.me` wants: E.164 without the `+`. Returns `null` for anything
 * we could not parse, because a WhatsApp link to a number we invented would
 * open a chat with a stranger.
 */
export function whatsappDigits(e164: string | null | undefined): string | null {
  if (!e164) return null;
  const parsed = parseParaguayanPhone(e164);
  return parsed.e164 ? parsed.e164.slice(1) : null;
}

/** `+595981123456` → `0981 123 456`. Display only. */
export function formatParaguayanPhone(e164: string): string {
  const parsed = parseParaguayanPhone(e164);
  if (!parsed.e164) return e164;
  const national = parsed.e164.slice(1 + COUNTRY_CODE.length);
  if (parsed.isMobile) {
    return `0${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
  }
  return `0${national}`;
}
