const guaranies = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const dollars = new Intl.NumberFormat('es-PY', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Formats an integer amount of guaraníes as "Gs. 1.450.000". */
export function formatGs(amount: number): string {
  return `Gs. ${guaranies.format(amount)}`;
}

/**
 * Formats an amount in the currency it was captured in.
 *
 * A USD arancel is rendered as USD — never converted. An FX rate is a number
 * we would have to defend on a date we do not control (data-model.md §2), and
 * inventing one to make a column tidy is exactly the fabrication rule 1 bans.
 */
export function formatMoney(amount: number, currency: 'PYG' | 'USD'): string {
  return currency === 'USD' ? `USD ${dollars.format(amount)}` : formatGs(amount);
}
